import axios from "axios";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "./secureStorage";

// All traffic goes through the API gateway (port 9000). The gateway routes to every
// microservice internally and proxies the chat WebSocket (/ws).
// EXPO_PUBLIC_API_URL is inlined at bundle time (not per-platform), so it's only
// used as an explicit override — e.g. your LAN IP for a physical device, such as
// "http://192.168.1.100:9000/api". Left unset, Platform.OS picks the right host
// at runtime: 10.0.2.2 is the Android emulator's alias for the host machine, and
// web/iOS simulator can reach the gateway via localhost directly.
const PLATFORM_DEFAULT =
  Platform.OS === "android" ? "http://10.0.2.2:9000/api" : "http://localhost:9000/api";

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || PLATFORM_DEFAULT;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Don't try to refresh/logout on the auth endpoints themselves — a 401 there
// means "bad credentials" or "expired refresh token", handled by the caller
// (mirrors frontend/src/lib/api.ts's identical AUTH_PATHS guard).
const AUTH_PATHS = ["/v1/auth/login", "/v1/auth/otp/verify", "/v1/auth/refresh"];
const isAuthPath = (url?: string) => !!url && AUTH_PATHS.some((p) => url.includes(p));

// Single-flight refresh: several requests can 401 at once (e.g. a screen
// fans out multiple calls right as the access token expires); they must
// NOT each fire their own refresh. The refresh token is single-use /
// rotated server-side, so a stampede would make all-but-one refresh fail
// and force a spurious logout. Every waiter shares ONE in-flight refresh.
let refreshPromise: Promise<string> | null = null;

// Set by App.tsx once the Redux store exists, so a failed refresh can log
// the user out through the same path a manual logout uses (clears Redux
// state + navigates to the login screen) instead of this module reaching
// into the store directly and risking an import cycle.
let onRefreshFailed: (() => void) | null = null;
export function setOnRefreshFailed(handler: () => void): void {
  onRefreshFailed = handler;
}

async function getRefreshedToken(): Promise<string> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw new Error("no refresh token");
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${BASE_URL}/v1/auth/refresh`, { refresh_token: refreshToken })
      .then(async ({ data }) => {
        await setTokens(data.access_token, data.refresh_token);
        return data.access_token as string;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthPath(original.url)
    ) {
      original._retry = true;
      try {
        const newAccess = await getRefreshedToken();
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newAccess}`;
        return client(original);
      } catch {
        // No refresh token, or the refresh call itself failed (expired/
        // revoked) — same cleanup either way: drop the session and let the
        // app's own render logic fall back to the login screen.
        await clearTokens();
        await AsyncStorage.removeItem("auth_user");
        onRefreshFailed?.();
      }
    }
    return Promise.reject(error);
  }
);

export default client;
