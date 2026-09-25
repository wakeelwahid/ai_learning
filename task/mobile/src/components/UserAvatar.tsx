/**
 * UserAvatar — the ONE way to render a student's face anywhere in the app
 * (battles, leaderboards, chat, activity feeds, friend lists, invitations…).
 *
 * The photo URL is DERIVED from the user id (gateway /users/avatar/{id}), so
 * every screen gets real photos without each backend list endpoint having to
 * join avatar_url. The endpoint is Redis-cached server-side (positive and
 * negative) and sends Cache-Control, so thousands of concurrent users cost
 * one cached fetch per avatar per device — never a DB read per row.
 * Students without a photo fall back to a deterministic initials circle.
 */
import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { BASE_URL } from "@/api/client";

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");

export const avatarUrlFor = (userId?: string | null): string | null =>
  userId ? `${API_ORIGIN}/api/v1/users/avatar/${userId}` : null;

const COLORS = ["#6366F1", "#10B981", "#F59E0B", "#F43F5E", "#0EA5E9", "#8B5CF6"];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

export default function UserAvatar({
  userId,
  name,
  uri,
  size = 32,
  style,
}: {
  userId?: string | null;
  name?: string | null;
  /** Explicit URL (wins over the derived one), e.g. right after an upload */
  uri?: string | null;
  size?: number;
  style?: object;
}) {
  const [broken, setBroken] = useState(false);
  const url = uri || avatarUrlFor(userId);
  const label = (name || "?").trim();
  const round = { width: size, height: size, borderRadius: size / 2 };

  if (url && !broken) {
    return (
      <Image
        source={{ uri: url }}
        style={[round, style]}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <View style={[round, styles.fallback, { backgroundColor: colorFor(label) }, style]}>
      <Text style={[styles.txt, { fontSize: Math.max(10, size * 0.42) }]}>
        {label.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
  txt: { color: "#fff", fontWeight: "800" },
});
