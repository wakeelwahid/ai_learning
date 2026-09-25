import React from "react";
import { View, ViewStyle } from "react-native";
import { radius, cardShadow, cardShadowElevated } from "@/theme/colors";

interface Props {
  children: React.ReactNode;
  /** Adds the slightly more present shadow — for hero/emphasis cards, mirrors web's `.card-hover`. */
  elevated?: boolean;
  style?: ViewStyle;
}

/** Card primitive — white surface, thin neutral border, small radius, minimal/restrained shadow. */
export default function Card({ children, elevated = false, style }: Props) {
  return (
    <View
      style={[
        {
          backgroundColor: "#fff",
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: "#F3F4F6",
          padding: 16,
        },
        elevated ? cardShadowElevated : cardShadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}
