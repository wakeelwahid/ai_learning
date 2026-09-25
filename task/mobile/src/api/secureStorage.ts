import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Auth tokens are secrets and must never sit in plain AsyncStorage (readable
// by any other app with root/jailbreak access, or lifted straight off disk
// on a rooted device with no unlock needed) — SecureStore backs onto the
// OS keystore/Keychain instead. Non-secret cache data (profile JSON, recent
// searches, language, bookmarks) stays in AsyncStorage; only the two actual
// credentials live here.
//
// expo-secure-store's web build is a stub (`export default {}` — no OS
// keystore exists in a browser) — calling any of its methods on web throws
// synchronously, which previously broke every API call on the Expo web
// target. There's no real equivalent of a keystore in a browser either way,
// so web falls back to localStorage (the same tier the web frontend's own
// token storage already uses) rather than crashing; native platforms keep
// the real SecureStore-backed security property unchanged.
const ACCESS_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const isWeb = Platform.OS === "web";

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return window.localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) { window.localStorage.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) { window.localStorage.removeItem(key); return; }
  await SecureStore.deleteItemAsync(key);
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS_TOKEN_KEY);
}

export async function setAccessToken(token: string): Promise<void> {
  await setItem(ACCESS_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string): Promise<void> {
  await setItem(REFRESH_TOKEN_KEY, token);
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([setAccessToken(accessToken), setRefreshToken(refreshToken)]);
}

// Clear both keys in parallel. Safe to call even if a key was never set.
export async function clearTokens(): Promise<void> {
  await Promise.all([deleteItem(ACCESS_TOKEN_KEY), deleteItem(REFRESH_TOKEN_KEY)]);
}
