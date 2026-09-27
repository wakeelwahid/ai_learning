import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";

// A stable per-install identifier — NOT a secret, so plain AsyncStorage is
// fine here (unlike auth tokens, see secureStorage.ts). Used to key push
// tokens per-device (see notification_service's push_tokens.device_id) so
// a second device on the same platform doesn't evict the first device's
// registration. Persists for the life of the install; reinstalling the app
// generates a new one, which correctly reads as "a new device" server-side.
const DEVICE_ID_KEY = "device_id";

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    cached = existing;
    return existing;
  }
  const fresh = randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
  cached = fresh;
  return fresh;
}
