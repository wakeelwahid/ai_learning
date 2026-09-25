import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, ViewStyle } from "react-native";
import { palette, radius } from "@/theme/colors";

/** Base pulsing skeleton block — compose into skeleton rows/cards/lists. */
export function SkeletonBlock({ style }: { style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { backgroundColor: palette.gray200, borderRadius: radius.sm, height: 16 },
        style,
        { opacity },
      ]}
    />
  );
}

/** Skeleton card — icon + two lines, mirrors web's SkeletonCard. */
export function SkeletonCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardRow}>
        <SkeletonBlock style={styles.avatar} />
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonBlock style={{ width: "75%" }} />
          <SkeletonBlock style={{ width: "50%" }} />
        </View>
      </View>
      <SkeletonBlock style={{ marginTop: 12 }} />
      <SkeletonBlock style={{ width: "80%", marginTop: 8 }} />
    </View>
  );
}

/** Skeleton list — stacked rows with a fade-out gradient, mirrors web's SkeletonList. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} style={{ height: 56, borderRadius: radius.md, opacity: 1 - i * 0.15 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    padding: 16,
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: radius.md },
});
