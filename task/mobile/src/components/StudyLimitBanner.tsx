import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import { useStudyTime } from "@/hooks/useStudyTime";
import { semantic, radius, spacing } from "@/theme/colors";

export default function StudyLimitBanner({ style }: { style?: ViewStyle }) {
  const { t } = useLanguage();
  const { blocked, limitMinutes, usedToday } = useStudyTime();
  if (!blocked) return null;

  return (
    <View style={[styles.banner, style]}>
      <Ionicons name="time-outline" size={18} color={semantic.warning.text} />
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={2}>
          {fmt(t("studyLimitReachedTitle"), { limit: limitMinutes ?? usedToday })}
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {fmt(t("studyLimitReachedBody"), { used: usedToday })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: semantic.warning.bg,
    borderWidth: 1,
    borderColor: semantic.warning.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: "800", color: semantic.warning.text },
  sub: { fontSize: 11.5, color: semantic.warning.text, marginTop: 2, lineHeight: 16 },
});
