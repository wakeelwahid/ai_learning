import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Firebase's messaging service worker is a static file served from the
 * site root — it can't read import.meta.env like the rest of the app
 * (Vite doesn't bundle files under public/). This plugin fills the
 * __FIREBASE_CONFIG__ placeholder in scripts/firebase-messaging-sw.template.js
 * with the real VITE_FIREBASE_* env values and writes the result to
 * public/firebase-messaging-sw.js, which Vite then serves as-is in dev and
 * copies verbatim into dist/ on build (same as every other public/ file).
 */
function writeFcmServiceWorker(mode: string): Plugin {
  return {
    name: "write-fcm-service-worker",
    config(_config, { command }) {
      const env = loadEnv(mode, process.cwd(), "VITE_");
      const firebaseConfig = {
        apiKey: env.VITE_FIREBASE_API_KEY ?? "",
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
        projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
        appId: env.VITE_FIREBASE_APP_ID ?? "",
      };
      const templatePath = path.resolve(__dirname, "scripts/firebase-messaging-sw.template.js");
      const outPath = path.resolve(__dirname, "public/firebase-messaging-sw.js");
      const template = fs.readFileSync(templatePath, "utf-8");
      const filled = template.replace(
        "firebase.initializeApp(__FIREBASE_CONFIG__);",
        `firebase.initializeApp(${JSON.stringify(firebaseConfig)});`,
      );
      fs.writeFileSync(outPath, filled);
      if (command === "build" && !firebaseConfig.apiKey) {
        console.warn(
          "[write-fcm-service-worker] VITE_FIREBASE_* env vars are not set — " +
          "firebase-messaging-sw.js was written with an empty config; web push will stay disabled until they're set.",
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), writeFcmServiceWorker(mode)],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    port: 3002,
    proxy: {
      // Everything routes through the API gateway — REST + both WebSockets.
      // The gateway internally proxies /ws (chat) and /api/v1/battles/{id}/ws (battle).
      "/api": {
        target: "http://localhost:9000",
        changeOrigin: true,
        ws: true,
      },
      "/ws": {
        target: "http://localhost:9000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
}));
