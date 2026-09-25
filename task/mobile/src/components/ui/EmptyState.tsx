import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Button from "./Button";
import { palette, typography } from "@/theme/colors";

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}

/** Empty-state primitive — mirrors web/admin's EmptyState.tsx layout and tone. */
export default function EmptyState({ icon, title, description, action }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={32} color={palette.gray400} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {action && (
        <View style={styles.actionWrap}>
          <Button label={action.label} onPress={action.onPress} size="sm" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", paddingVertical: 64, paddingHorizontal: 24 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: palette.gray100,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  title: {
    fontSize: typography.h4.fontSize, fontFamily: typography.h4.fontFamily,
    fontWeight: "600", color: palette.gray700, marginBottom: 4, textAlign: "center",
  },
  description: {
    fontSize: typography.bodySm.fontSize, fontFamily: typography.bodySm.fontFamily,
    color: palette.gray400, textAlign: "center", maxWidth: 260,
  },
  actionWrap: { marginTop: 16 },
});
