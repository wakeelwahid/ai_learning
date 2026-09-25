import { useEffect, useState } from "react";
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import toast from "react-hot-toast";
import { notificationApi } from "@/lib/api";

type PermissionStatus = "granted" | "denied" | "default" | "unavailable";

interface UseFCMReturn {
  permissionStatus: PermissionStatus;
  fcmToken: string | null;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let firebaseApp: FirebaseApp | null = null;
function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey) return null; // not configured — stay disabled, never throw
  if (!firebaseApp) firebaseApp = initializeApp(firebaseConfig);
  return firebaseApp;
}

/**
 * Registers this browser for Firebase web push and syncs the resulting FCM
 * token to the backend, mirroring mobile's usePushNotifications (token +
 * platform, no separate device_id — the FCM token itself is the device
 * identity). Every failure mode (no config, unsupported browser, denied
 * permission, network error) degrades to "unavailable"/null rather than
 * throwing, so a missing Firebase project or an ad-blocker never breaks the
 * rest of the app.
 */
export function useFCM(userId: string): UseFCMReturn {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("default");
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermissionStatus("unavailable");
      return;
    }

    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        const app = getFirebaseApp();
        if (!app || !(await isSupported())) {
          setPermissionStatus("unavailable");
          return;
        }

        const permission = await Notification.requestPermission();
        setPermissionStatus(permission as PermissionStatus);
        if (permission !== "granted") return;

        const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        const messaging = getMessaging(app);
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";
        const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });

        if (token) {
          setFcmToken(token);
          await notificationApi.registerPushToken(userId, token, "web");
        }

        unsubscribe = onMessage(messaging, (payload) => {
          const title = payload.notification?.title ?? "New notification";
          const body = payload.notification?.body ?? "";
          toast(body ? `${title}: ${body}` : title, { icon: "🔔" });
        });
      } catch (err) {
        console.error("[useFCM] Failed to register FCM token", err);
        setPermissionStatus("unavailable");
      }
    })();

    return () => unsubscribe?.();
  }, [userId]);

  return { permissionStatus, fcmToken };
}
