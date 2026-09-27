// Firebase Cloud Messaging service worker — handles push notifications
// received while no tab has focus. Must be served from the site's root
// (not from /assets/ or any subpath) for the browser's push subscription
// scope to cover the whole origin.
//
// __FIREBASE_CONFIG__ is written into this file by the writeFcmServiceWorker
// Vite plugin (vite.config.ts) from the same VITE_FIREBASE_* env vars the
// app itself uses — this file can't read import.meta.env since it's served
// as a static file, not bundled. Firebase web config values are not secret
// (they're visible in any browser's network tab regardless), so writing
// them into a public file is safe.
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({"apiKey":"AIzaSyD-dummyKeyForTestingOnly1234567","authDomain":"edulearn-dummy-test.firebaseapp.com","projectId":"edulearn-dummy-test","storageBucket":"edulearn-dummy-test.appspot.com","messagingSenderId":"123456789012","appId":"1:123456789012:web:abc123def456ghi789"});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? "EduLearn";
  const body = payload.notification?.body ?? "";
  self.registration.showNotification(title, {
    body,
    icon: "/favicon.svg",
    data: payload.data ?? {},
  });
});
