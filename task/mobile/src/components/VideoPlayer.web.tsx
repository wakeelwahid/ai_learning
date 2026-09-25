// Web (Expo/Metro auto-selects this file when bundling for react-native-web) embedded
// YouTube player. Renders a plain <iframe> (React Native Web passes intrinsic JSX
// elements straight through to the DOM) pointed at the YouTube embed URL, and drives
// playback rate / play-pause via window.postMessage to the iframe's contentWindow,
// using the standard YouTube IFrame Player API postMessage protocol.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/theme/colors";

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export interface VideoPlayerProps {
  youtubeId: string;
  youtubeIdHi?: string | null;
  initialPositionSeconds?: number;
  onProgress?: (seconds: number, isCompleted: boolean) => void;
  onProgressSync?: (seconds: number, isCompleted: boolean) => void;
  onMediumChange?: (medium: "en" | "hi") => void;
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
  const [completed, setCompleted] = useState(false);
  const [ready, setReady] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastSyncRef = useRef(0);
  const pollRef = useRef<any>(null);
  const durationRef = useRef(0);

  const activeYoutubeId = medium === "hi" && youtubeIdHi ? youtubeIdHi : youtubeId;

  const embedSrc = useMemo(() => {
    // A real YouTube id is always exactly 11 chars of [A-Za-z0-9_-] — reject
    // anything else rather than interpolate it into the iframe src unchecked
    // (same defensive check as the native player's buildEmbedHtml).
    const safeId = /^[A-Za-z0-9_-]{11}$/.test(activeYoutubeId) ? activeYoutubeId : "";
    return `https://www.youtube.com/embed/${safeId}?enablejsapi=1&autoplay=0&playsinline=1`;
  }, [activeYoutubeId]);

  const postToPlayer = (func: string, args: any[] = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  };

  const setPlaybackRate = (rate: number) => {
    setSpeed(rate);
    postToPlayer("setPlaybackRate", [rate]);
  };

  const switchMedium = (m: "en" | "hi") => {
    if (m === "hi" && !youtubeIdHi) return;
    setMedium(m);
    onMediumChange?.(m);
  };

  // Listen for postMessage events coming back from the YouTube iframe (infoDelivery).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data?.event === "onReady") {
          setReady(true);
          postToPlayer("setPlaybackRate", [speed]);
          if (initialPositionSeconds > 5) postToPlayer("seekTo", [initialPositionSeconds, true]);
        }
        if (data?.event === "infoDelivery" && data?.info) {
          if (typeof data.info.currentTime === "number") {
            const pos = Math.floor(data.info.currentTime);
            const dur = Math.floor(data.info.duration ?? 0);
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
        }
      } catch {
        /* ignore non-JSON postMessage traffic (other libs on the page) */
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, speed, initialPositionSeconds]);

  // Poll the player for its current state (YouTube iframe API needs "listening"
  // subscription started explicitly for infoDelivery events to flow).
  useEffect(() => {
    setReady(false);
    lastSyncRef.current = 0;
    const iv = setInterval(() => {
      postToPlayer("getCurrentTime");
      postToPlayer("addEventListener", ["onReady"]);
    }, 1000);
    pollRef.current = iv;
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeYoutubeId]);

  return (
    <View style={styles.wrap}>
      <View style={styles.playerBox}>
        {/* React Native Web renders raw intrinsic elements straight to the DOM. */}
        {/* @ts-ignore -- intrinsic <iframe> is valid on web target only */}
        <iframe
          ref={iframeRef as any}
          src={embedSrc}
          style={webIframeStyle}
          title="video-player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          frameBorder={0}
        />
      </View>

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
                style={[styles.pill, active && styles.pillActiveIndigo, !available && styles.pillDisabled]}
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
      {!ready && <Text style={styles.hint}>Loading player…</Text>}
    </View>
  );
}

// Kept as a plain CSS object (not RN StyleSheet) since this targets a raw DOM <iframe>.
const webIframeStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  border: "none",
};

const styles = StyleSheet.create({
  wrap:            { gap: 10 },
  playerBox:        { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000", borderRadius: 16, overflow: "hidden", position: "relative" as any },
  controlsRow:       { flexDirection: "row", flexWrap: "wrap" },
  controlGroup:      { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  controlLabel:      { fontSize: 11, fontWeight: "700", color: "#9CA3AF", marginRight: 2 },
  pill:              { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff" },
  pillDisabled:      { opacity: 0.4 },
  pillActiveIndigo:  { backgroundColor: palette.primary600, borderColor: palette.primary600 },
  pillActivePrimary: { backgroundColor: palette.primary600, borderColor: palette.primary600 },
  pillTxt:           { fontSize: 11, fontWeight: "800", color: "#374151" },
  pillTxtActive:     { color: "#fff" },
  hint:              { fontSize: 10, color: "#9CA3AF", textAlign: "center" },
});
