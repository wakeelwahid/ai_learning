import React, { useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { parentApi } from "@/api/parent";
import { errorDetail } from "@/api/errorDetail";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import EmptyState from "@/components/ui/EmptyState";
import type { StudentLink } from "@/hooks/useLinkedChild";
import { palette, spacing } from "@/theme/colors";

export function firstNameOf(link: Pick<StudentLink, "student_name"> | null | undefined, fallback = "your child"): string {
  const name = link?.student_name?.trim();
  return name ? name.split(" ")[0] : fallback;
}

export function PendingBadge({ style }: { style?: object }) {
  const { t } = useLanguage();
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeTxt}>{t("pending")}</Text>
    </View>
  );
}

export function PendingApprovalState({ child }: { child: StudentLink }) {
  const { t } = useLanguage();
  const parentId = useAppSelector((s) => s.auth.user?.id ?? "");
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const firstName = firstNameOf(child, t("yourChild"));

  const cancelRequest = () => {
    Alert.alert(
      t("cancelRequestTitle"),
      fmt(t("cancelRequestBody"), { name: firstName }),
      [
        { text: t("keepWaiting"), style: "cancel" },
        {
          text: t("cancelRequest"),
          style: "destructive",
          onPress: async () => {
            if (cancelling) return;
            setCancelling(true);
            try {
              await parentApi.removeLink(child.id);
              Toast.show({ type: "success", text1: t("requestCancelled") });
              await qc.invalidateQueries({ queryKey: ["parent-students", parentId] });
            } catch (err: any) {
              Toast.show({
                type: "error",
                text1: t("couldNotCancelRequest"),
                text2: errorDetail(err, t("pleaseTryAgain")),
              });
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.wrap}>
      <EmptyState
        icon="hourglass-outline"
        title={fmt(t("awaitingApprovalOf"), { name: firstName })}
        description={fmt(t("awaitingApprovalBody"), { name: firstName })}
        action={{ label: cancelling ? t("cancelling") : t("cancelRequest"), onPress: cancelRequest }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.md },
  badge: {
    backgroundColor: palette.warning100,
    borderRadius: 6,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    alignSelf: "center",
  },
  badgeTxt: { fontSize: 9, fontWeight: "700", color: palette.warning700 },
});
