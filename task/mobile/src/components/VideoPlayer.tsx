// Native (iOS / Android) embedded YouTube video player with full in-app controls.
// Uses react-native-webview to load the YouTube IFrame Player API and drives it
// via injected JavaScript / postMessage, mirroring the web VideoPlayer.web.tsx
// implementation (playback speed, medium toggle, position tracking).
//
// NOTE: react-native-webview must be installed (added to mobile/package.json)
// for this file to build. The import is written against its public API.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/theme/colors";

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export interface VideoPlayerProps {
  youtubeId: string;
  youtubeIdHi?: string | null;
  initialPositionSeconds?: number;
  /** Called ~every 1s locally with the current playhead + completion flag. */
  onProgress?: (seconds: number, isCompleted: boolean) => void;
  /** Called ~every 30s — the parent screen should persist this to the backend. */
  onProgressSync?: (seconds: number, isCompleted: boolean) => void;
  onMediumChange?: (medium: "en" | "hi") => void;
}

function buildEmbedHtml(videoId: string, startSeconds: number) {
  // videoId is interpolated directly into an inline <script> below, so it
  // must be validated as a real YouTube id (11 chars, [A-Za-z0-9_-]) before
  // that happens — a teacher/admin-created Video row is the only source of
  // this value today, but a malformed or malicious youtube_id string could
  // otherwise break out of the JS string literal.
  const safeVideoId = /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : "";
  // Minimal HTML host page that loads the YouTube IFrame Player API and exposes
  // window.postMessage-driven playback-rate control, matching the web variant.
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body { margin:0; padding:0; background:#000; height:100%; overflow:hidden; }
      #player { position:absolute; top:0; left:0; width:100%; height:100%; }
    </style>
  </head>
  <body>
    <div id="player"></div>
    <script>
      var tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      var firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

      var player;
      var lastPos = 0;
      function post(msg) {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
      window.onYouTubeIframeAPIReady = function () {
        player = new YT.Player('player', {
          videoId: '${videoId}',
          playerVars: { enablejsapi: 1, autoplay: 0, playsinline: 1, start: ${Math.max(0, Math.floor(startSeconds))} },
          events: {
            onReady: function () { post({ type: 'ready' }); },
            onStateChange: function (e) {
              post({ type: 'state', state: e.data });
            },
          },
        });
      };
      setInterval(function () {
        try {
          if (player && player.getCurrentTime) {
            var t = player.getCurrentTime();
            var d = player.getDuration ? player.getDuration() : 0;
            if (typeof t === 'number' && t !== lastPos) {
              lastPos = t;
              post({ type: 'time', position: t, duration: d });
            }
          }
        } catch (e) {}
      }, 1000);

      document.addEventListener('message', handleMessage);
      window.addEventListener('message', handleMessage);
      function handleMessage(event) {
        try {
          var data = JSON.parse(event.data);
          if (!player) return;
          if (data.func === 'setPlaybackRate') player.setPlaybackRate(data.args[0]);
          if (data.func === 'seekTo') player.seekTo(data.args[0], true);
          if (data.func === 'playVideo') player.playVideo();
          if (data.func === 'pauseVideo') player.pauseVideo();
        } catch (e) {}
      }
    </script>
  </body>
</html>`;
}

export default function VideoPlayer({
  youtubeId,
  youtubeIdHi,
  initialPositionSeconds = 0,
  onProgress,
  onProgressSync,
  onMediumChange,
}: VideoPlayerProps) {
  const [medium, setMedium] = useState<"en" | "hi">("en");
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);

  const webviewRef = useRef<WebView>(null);
  const lastSyncRef = useRef(0);
  const durationRef = useRef(0);
  const startedAtRef = useRef(initialPositionSeconds);

  const activeYoutubeId = medium === "hi" && youtubeIdHi ? youtubeIdHi : youtubeId;

  const html = useMemo(() => buildEmbedHtml(activeYoutubeId, startedAtRef.current), [activeYoutubeId]);

  const sendCommand = (func: string, args: any[] = []) => {
    const js = `handleMessage({ data: ${JSON.stringify(JSON.stringify({ event: "command", func, args }))} }); true;`;
    webviewRef.current?.injectJavaScript(js);
  };

  const setPlaybackRate = (rate: number) => {
    setSpeed(rate);
    sendCommand("setPlaybackRate", [rate]);
  };

  const switchMedium = (m: "en" | "hi") => {
    if (m === "hi" && !youtubeIdHi) return;
    setMedium(m);
    onMediumChange?.(m);
  };

  const onMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "ready") {
        setLoading(false);
        setPlaybackRate(speed);
      } else if (data.type === "time") {
        const pos = Math.floor(data.position);
        const dur = Math.floor(data.duration ?? 0);
        if (dur > 0) durationRef.current = dur;
        if (pos > 0) {
          const isDone = dur > 0 && pos / dur > 0.9;
          if (isDone && !completed) setCompleted(true);
          onProgress?.(pos, isDone || completed);
          if (Math.abs(pos - lastSyncRef.current) >= 30) {
            lastSyncRef.current = pos;
            onProgressSync?.(pos, isDone || completed);
          }
        }
      }
    } catch {
      /* ignore malformed messages */
    }
  };

  // Reset resume point + reload iframe HTML whenever the active video changes.
  useEffect(() => {
    startedAtRef.current = initialPositionSeconds;
    setLoading(true);
    setCompleted(false);
    lastSyncRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeYoutubeId]);

  return (
    <View style={styles.wrap}>
      <View style={styles.playerBox}>
        <WebView
          ref={webviewRef}
          source={{ html }}
          originWhitelist={["*"]}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          onMessage={onMessage}
          style={styles.webview}
        />
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}
      </View>

      {/* Controls row: medium + speed */}
      <View style={styles.controlsRow}>
        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Medium</Text>
          {(["en", "hi"] as const).map((m) => {
            const available = m === "en" || !!youtubeIdHi;
            const active = medium === m;
            return (
              <TouchableOpacity
                key={m}
                disabled={!available}
                onPress={() => switchMedium(m)}
                style={[
                  styles.pill,
                  active && styles.pillActiveIndigo,
                  !available && styles.pillDisabled,
                ]}
              >
                <Text style={[styles.pillTxt, active && styles.pillTxtActive]}>{m === "en" ? "EN" : "HI"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={styles.controlsRow}>
        <View style={styles.controlGroup}>
          <Ionicons name="speedometer-outline" size={13} color="#9CA3AF" />
          <Text style={styles.controlLabel}>Speed</Text>
          {SPEEDS.map((r) => {
            const active = speed === r;
            return (
              <TouchableOpacity
                key={r}
                onPress={() => setPlaybackRate(r)}
                style={[styles.pill, active && styles.pillActivePrimary]}
              >
                <Text style={[styles.pillTxt, active && styles.pillTxtActive]}>{r === 1 ? "1x" : `${r}x`}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:            { gap: 10 },
  playerBox:        { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000", borderRadius: 16, overflow: "hidden" },
  webview:           { flex: 1, backgroundColor: "#000" },
  loadingOverlay:    { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  controlsRow:       { flexDirection: "row", flexWrap: "wrap" },
  controlGroup:      { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  controlLabel:      { fontSize: 11, fontWeight: "700", color: "#9CA3AF", marginRight: 2 },
  pill:              { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff" },
  pillDisabled:      { opacity: 0.4 },
  pillActiveIndigo:  { backgroundColor: palette.primary600, borderColor: palette.primary600 },
  pillActivePrimary: { backgroundColor: palette.primary600, borderColor: palette.primary600 },
  pillTxt:           { fontSize: 11, fontWeight: "800", color: "#374151" },
  pillTxtActive:     { color: "#fff" },
});
