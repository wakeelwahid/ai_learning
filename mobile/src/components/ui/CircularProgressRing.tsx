import React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { palette } from "@/theme/colors";

interface CircularProgressRingProps {
  pct: number; // 0-100
  completed?: boolean;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  progressColor?: string;
  children?: React.ReactNode;
}

// SVG progress ring wrapping an icon badge — mobile counterpart of the web
// dashboard's CircularProgressRing, used for Today's Goals buttons so
// completion state reads at a glance without opening the goal.
export default function CircularProgressRing({
  pct,
  completed,
  size = 56,
  strokeWidth = 3,
  trackColor = "rgba(0,0,0,0.08)",
  progressColor,
  children,
}: CircularProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = circumference * (1 - clamped / 100);
  const center = size / 2;
  const color = progressColor ?? (completed ? palette.primary500 : palette.primary600);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
        />
      </Svg>
      {children}
    </View>
  );
}
