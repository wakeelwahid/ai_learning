import React, { useState } from "react";
import { View, Text, StyleSheet, Switch, ActivityIndicator, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { parentApi } from "@/api/parent";
import { errorDetail } from "@/api/errorDetail";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import { firstNameOf } from "@/components/parent/PendingApproval";
import type { StudentLink } from "@/hooks/useLinkedChild";
import { palette, accentSolid, radius, spacing } from "@/theme/colors";

interface Props {
  link: StudentLink;
  showName?: boolean;
  style?: ViewStyle;
}

export default function ApprovalModeSwitch({ link, showName = false, style }: Props) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const parentId = useAppSelector((s) => s.auth.user?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const value = optimistic ?? link.approval_required === true;
  const name = firstNameOf(link, t("yourChild"));

  const onToggle = async (next: boolean) => {
    if (saving) return;
    setSaving(true);
    setOptimistic(next);
    try {
      await parentApi.updateLink(link.id, { approval_required: next });
      Toast.show({
        type: "success",
        text1: t("approvalModeUpdated"),
        text2: fmt(next ? t("approvalModeOnBody") : t("approvalModeOffBody"), { name }),
      });
      await qc.invalidateQueries({ queryKey: ["parent-students", parentId] });
    } catch (err: any) {
      setOptimistic(null);
      Toast.show({
        type: "error",
        text1: t("couldNotUpdateApprovalMode"),
        text2: errorDetail(err, t("pleaseTryAgain")),
      });
    } finally {
      setSaving(false);
      setOptimistic(null);
    }
  };

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        <View style={styles.iconBox}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.label} numberOfLines={1}>
            {t("approvalMode")}{showName ? ` · ${name}` : ""}
          </Text>
          <Text style={styles.help} numberOfLines={3}>{fmt(t("approvalModeHelp"), { name })}</Text>
        </View>
        {saving ? (
          <ActivityIndicator size="small" color={palette.primary600} />
        ) : (
          <Switch
            value={value}
            onValueChange={onToggle}
            trackColor={{ false: palette.gray200, true: palette.primary600 }}
            thumbColor="#fff"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm + 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconBox: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: accentSolid.indigo, alignItems: "center", justifyContent: "center" },
  textCol: { flex: 1, minWidth: 0 },
  label: { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  help: { fontSize: 11, color: palette.gray500, marginTop: 2, lineHeight: 15 },
});
