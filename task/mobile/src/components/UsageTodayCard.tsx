import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";

import { getUsageStatus } from "@/api/gamification";
import { palette, radius, spacing, cardShadow } from "@/theme/colors";

interface FeatureUsage {
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
}

interface UsageStatusResponse {
  tier: "free" | "premium";
  features: Record<string, FeatureUsage>;
}

/** "Usage Today" widget — a proactive daily-quota snapshot, distinct from
 * the reactive UpgradePrompt shown once a limit is already hit. Renders
 * nothing for a premium account (every limit is null/unlimited) and
 * nothing if no feature currently has a configured limit. */
export default function UsageTodayCard({ userId }: { userId?: string }) {
  const navigation = useNavigation<any>();

  const { data } = useQuery<UsageStatusResponse>({
    queryKey: ["usage-status", userId],
    queryFn: () => getUsageStatus(userId!).then((r: any) => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });

  if (!data || data.tier === "premium") return null;

  const limited = Object.entries(data.features).filter(([, f]) => f.limit !== null);
  if (limited.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBadge}>
            <Ionicons name="speedometer-outline" size={16} color={palette.primary600} />
          </View>
          <Text style={styles.title}>Usage Today</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate("Subscription")} activeOpacity={0.7} style={styles.upgradeBtn}>
          <Ionicons name="star" size={13} color={palette.primary600} />
          <Text style={styles.upgradeTxt}>Upgrade</Text>
        </TouchableOpacity>
      </View>

      <View style={{ gap: spacing.md }}>
        {limited.map(([key, f]) => {
          const limit = f.limit as number;
          const pct = limit > 0 ? Math.min(100, (f.used / limit) * 100) : 0;
          const atLimit = f.remaining === 0;
          return (
            <View key={key}>
              <View style={styles.rowBetween}>
                <Text style={styles.featureLabel} numberOfLines={1}>{f.label}</Text>
                <Text style={[styles.featureCount, atLimit && { color: palette.danger600 }]}>
                  {f.used}/{limit}
                </Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${pct}%`, backgroundColor: atLimit ? palette.danger500 : palette.primary500 },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: palette.primary50,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 14, fontWeight: "700", color: palette.gray900 },
  upgradeBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  upgradeTxt: { fontSize: 12, fontWeight: "600", color: palette.primary600 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  featureLabel: { fontSize: 12.5, color: palette.gray600, flex: 1, marginRight: spacing.sm },
  featureCount: { fontSize: 12.5, fontWeight: "600", color: palette.gray500 },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: palette.gray100, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill },
});
