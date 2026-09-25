import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useNavigation } from "@react-navigation/native";
import { notificationApi } from "@/api/notification";
import { useAppSelector } from "@/store";

// Foreground notifications show a system banner + sound (matches the OS
// default when the app is backgrounded) instead of doing nothing, which is
// Notifications' own default while the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Registers this device's push token once per login, requests permission,
// and wires tap-to-deep-link. Call from a single place high in the tree
// (MainNavigator) so it runs exactly once per authenticated session rather
// than once per screen that happens to mount.
export function usePushNotifications() {
  const userId = useAppSelector(s => s.auth.user?.id);
  const navigation = useNavigation<any>();
  const registered = useRef(false);

  useEffect(() => {
    if (!userId || registered.current) return;
    registered.current = true;

    (async () => {
      // Web has no OS-level push permission model Notifications can drive,
      // and the backend's FCM sender only serves ios/android tokens
      // meaningfully today — skip registration there rather than surface a
      // permission prompt that leads nowhere.
      if (Platform.OS === "web") return;

      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      try {
        // The backend sends raw FCM (legacy HTTP API, see push_service.py),
        // not Expo's push relay — getDevicePushTokenAsync returns the real
        // FCM registration token on Android (what the backend needs) or the
        // raw APNs token on iOS (NOT directly FCM-compatible without the
        // FCM project's APNs bridge being configured — iOS push therefore
        // needs that server-side setup before it will actually deliver;
        // registration itself still succeeds either way).
        const { data } = await Notifications.getDevicePushTokenAsync();
        await notificationApi.registerPushToken(userId, data, Platform.OS);
      } catch {
        // Permission granted but token fetch failed (e.g. no Google Play
        // Services on this Android device, or a simulator) — not fatal,
        // just means this device won't receive push this session.
      }
    })();
  }, [userId]);

  // Tap-to-deep-link: a notification payload's `data.screen` (and optional
  // `data.params`) navigates the user straight to the relevant screen
  // instead of just opening the app to wherever it was left.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
      const { screen, params } = response.notification.request.content.data ?? {};
      if (typeof screen === "string") {
        try {
          navigation.navigate(screen, params ?? undefined);
        } catch {
          // Unknown/renamed screen name in an old notification payload —
          // fail silently rather than crash on a bad deep link.
        }
      }
    });
    return () => sub.remove();
  }, [navigation]);
}
