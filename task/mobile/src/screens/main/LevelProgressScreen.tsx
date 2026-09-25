import React from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { getLevelInfo } from "@/api/gamification";
import { useAppSelector } from "@/store";
import { palette, semantic, radius, spacing, typography, cardShadowElevated, cardShadow } from "@/theme/colors";

// Mirrors frontend/src/pages/gamification/LevelProgressPage.tsx

const LEVEL_COLORS: [string, string][] = [
  ["#9CA3AF", "#6B7280"],
  ["#4ADE80", "#10B981"],
  ["#2DD4BF", "#06B6D4"],
  ["#60A5FA", "#2563EB"],
  ["#818CF8", "#4F46E5"],
  ["#A78BFA", "#9333EA"],
  ["#C084FC", "#DB2777"],
  ["#F472B6", "#E11D48"],
  ["#FB923C", "#F59E0B"],
  ["#FACC15", "#FBBF24"],
];

const LEVEL_NAMES = [
  "Novice", "Explorer", "Scholar", "Achiever", "Expert",
  "Champion", "Master", "Legend", "Elite", "Grand Master",
];

interface LevelInfo {
  level:                 number;
  total_xp:              number;
  xp_to_next_level:      number;
  progress_percent:      number;
  unlocked_features:     string[];
  next_level_features:   string[];
  season_start:          string | null;
  all_unlocks:           Record<string, string[]>;
}

export default function LevelProgressScreen() {
  const navigation = useNavigation<any>();
  const userId: string = useAppSelector((s) => s.auth.user?.id ?? "");

  const { data, isLoading } = useQuery({
    queryKey: ["level-info", userId],
    queryFn: () => getLevelInfo(userId).then((r: any) => r.data),
    enabled: !!userId,
  });

  const info: Partial<LevelInfo> = data ?? {};
  const level              = info.level ?? 1;
  const totalXp            = info.total_xp ?? 0;
  const xpToNext           = info.xp_to_next_level ?? 100;
  const progress           = info.progress_percent ?? 0;
  const unlockedFeatures   = info.unlocked_features ?? [];
  const nextFeatures       = info.next_level_features ?? [];
  const seasonStart        = info.season_start ?? null;
  const allUnlocks         = info.all_unlocks ?? {};

  const seasonEnd = seasonStart
    ? (() => { const d = new Date(seasonStart); d.setMonth(d.getMonth() + 3); return d; })()
    : null;
  const daysRemaining = seasonEnd
    ? Math.max(0, Math.floor((seasonEnd.getTime() - Date.now()) / 86_400_000))
    : null;

  const [colorFrom, colorTo] = LEVEL_COLORS[Math.min(level - 1, 9)];
  const levelName = LEVEL_NAMES[Math.min(level - 1, 9)];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Level Progress</Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      {isLoading ? (
        <View style={s.centeredState}>
          <ActivityIndicator size="large" color={palette.primary600} />
        </View>
      ) : (
        <ScrollView
          style={s.container}
          contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Current level card */}
          <LinearGradient colors={[colorFrom, colorTo]} style={s.levelCard}>
            <View style={s.levelCardTop}>
              <View style={s.levelBadgeLg}>
                <Text style={s.levelBadgeLgTxt}>{level}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.levelEyebrow}>LEVEL {level}</Text>
                <Text style={s.levelName}>{levelName}</Text>
                <View style={s.rowCenter}>
                  <Ionicons name="star" size={12} color="rgba(255,255,255,0.7)" />
                  <Text style={s.levelXp}>{totalXp.toLocaleString()} Total XP</Text>
                </View>
              </View>
              {daysRemaining !== null && (
                <View style={s.seasonPill}>
                  <Text style={s.seasonPillDays}>{daysRemaining}d</Text>
                  <Text style={s.seasonPillLabel}>Season resets</Text>
                </View>
              )}
            </View>

            <View style={{ marginTop: 18 }}>
              <View style={s.rowBetween}>
                <Text style={s.progressLabel}>
                  Next: Level {level < 10 ? level + 1 : "MAX"}
                </Text>
                <Text style={s.progressLabel}>
                  {level < 10 ? `${xpToNext} XP needed` : "Max Level Reached!"}
                </Text>
              </View>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${level >= 10 ? 100 : progress}%` as any }]} />
              </View>
              {level < 10 && (
                <Text style={s.progressPct}>{Math.round(progress)}%</Text>
              )}
            </View>
          </LinearGradient>

          {/* Unlocked features */}
          {unlockedFeatures.length > 0 && (
            <View style={s.card}>
              <View style={s.rowCenter}>
                <Ionicons name="lock-open" size={16} color={palette.success500} />
                <Text style={s.cardTitle}>Your Unlocked Features</Text>
              </View>
              <View style={{ marginTop: 10, gap: 8 }}>
                {unlockedFeatures.map((f) => (
                  <View key={f} style={s.rowCenter}>
                    <Ionicons name="chevron-forward" size={14} color={palette.success500} />
                    <Text style={s.unlockedTxt}>{f}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Next level preview */}
          {level < 10 && nextFeatures.length > 0 && (
            <View style={[s.card, s.cardIndigoBorder]}>
              <View style={s.rowCenter}>
                <Ionicons name="lock-closed" size={16} color={palette.primary500} />
                <Text style={s.cardTitle}>Unlock at Level {level + 1}</Text>
              </View>
              <View style={{ marginTop: 10, gap: 8 }}>
                {nextFeatures.map((f) => (
                  <View key={f} style={s.rowCenter}>
                    <Ionicons name="chevron-forward" size={14} color={palette.primary300} />
                    <Text style={s.lockedTxt}>{f}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Level roadmap */}
          <View style={s.card}>
            <View style={s.rowCenter}>
              <Ionicons name="trophy" size={16} color={palette.warning500} />
              <Text style={s.cardTitle}>Level Roadmap</Text>
            </View>
            <View style={{ marginTop: 12, gap: 8 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((lvl) => {
                const isCompleted = lvl < level;
                const isCurrent   = lvl === level;
                const features    = allUnlocks[String(lvl)] ?? [];
                const [from, to]  = LEVEL_COLORS[lvl - 1];
                const name        = LEVEL_NAMES[lvl - 1];

                return (
                  <View
                    key={lvl}
                    style={[
                      s.roadmapRow,
                      isCurrent && s.roadmapRowCurrent,
                      isCompleted && s.roadmapRowCompleted,
                      !isCurrent && !isCompleted && s.roadmapRowLocked,
                    ]}
                  >
                    <LinearGradient colors={[from, to]} style={s.roadmapBadge}>
                      {isCompleted ? (
                        <Ionicons name="shield-checkmark" size={16} color="#fff" />
                      ) : (
                        <Text style={s.roadmapBadgeTxt}>{lvl}</Text>
                      )}
                    </LinearGradient>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={s.rowCenter}>
                        <Text style={[s.roadmapName, isCurrent && s.roadmapNameCurrent]} numberOfLines={1}>
                          Lvl {lvl} — {name}
                        </Text>
                        {isCurrent && (
                          <View style={s.currentPill}><Text style={s.currentPillTxt}>Current</Text></View>
                        )}
                        {isCompleted && (
                          <View style={s.completePill}><Text style={s.completePillTxt}>Complete</Text></View>
                        )}
                      </View>
                      {features.length > 0 && (
                        <Text style={s.roadmapFeatures} numberOfLines={1}>
                          {features.slice(0, 3).join(" · ")}
                          {features.length > 3 && ` +${features.length - 3} more`}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Season info */}
          {seasonStart && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Season Info</Text>
              <Text style={s.seasonInfoTxt}>
                Current season started{" "}
                <Text style={s.seasonInfoBold}>
                  {new Date(seasonStart).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                </Text>
                . XP resets every 3 months — EduPoints never reset.
                {daysRemaining !== null && (
                  <Text style={s.seasonInfoAccent}> {daysRemaining} days left in this season.</Text>
                )}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: palette.gray50 },
  container:       { flex: 1 },

  header:          { paddingTop: spacing.sm, paddingBottom: spacing.xl, paddingHorizontal: spacing["2xl"], backgroundColor: palette.primary600 },
  headerTopRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn:         { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle:     { color: "#fff", fontSize: typography.h3.fontSize, fontFamily: typography.h3.fontFamily, fontWeight: "800", letterSpacing: -0.3 },

  centeredState:   { flex: 1, alignItems: "center", justifyContent: "center" },

  levelCard:       { borderRadius: radius.xl, padding: spacing["2xl"], ...cardShadowElevated },
  levelCardTop:    { flexDirection: "row", alignItems: "center", gap: 14 },
  levelBadgeLg:    { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 3, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" },
  levelBadgeLgTxt: { fontSize: 24, fontWeight: "900", color: "#fff" },
  levelEyebrow:    { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  levelName:       { color: "#fff", fontSize: 22, fontWeight: "900" },
  levelXp:         { color: "rgba(255,255,255,0.7)", fontSize: 12, marginLeft: 4 },

  seasonPill:        { backgroundColor: "rgba(0,0,0,0.2)", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  seasonPillDays:     { color: "#fff", fontSize: 17, fontWeight: "800" },
  seasonPillLabel:    { color: "rgba(255,255,255,0.6)", fontSize: 10 },

  progressLabel:   { color: "rgba(255,255,255,0.75)", fontSize: 11 },
  progressTrack:   { height: 10, backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 5, overflow: "hidden", marginTop: 6 },
  progressFill:    { height: "100%", backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 5 },
  progressPct:     { textAlign: "right", color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 4 },

  card:            { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, ...cardShadow },
  cardIndigoBorder:{ borderWidth: 1, borderColor: palette.primary100 },
  cardTitle:       { fontSize: typography.bodyMedium.fontSize, fontFamily: typography.bodyMedium.fontFamily, fontWeight: "800", color: palette.gray800, marginLeft: 6 },

  rowCenter:       { flexDirection: "row", alignItems: "center", gap: 4 },
  rowBetween:      { flexDirection: "row", justifyContent: "space-between" },

  unlockedTxt:     { fontSize: typography.bodySm.fontSize, color: semantic.success.text, flexShrink: 1 },
  lockedTxt:       { fontSize: typography.bodySm.fontSize, color: palette.gray500, flexShrink: 1 },

  roadmapRow:          { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.md, backgroundColor: palette.gray50 },
  roadmapRowCurrent:   { backgroundColor: palette.primary50, borderWidth: 1, borderColor: palette.primary200 },
  roadmapRowCompleted: { backgroundColor: palette.gray100, opacity: 0.85 },
  roadmapRowLocked:    { opacity: 0.55 },
  roadmapBadge:        { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  roadmapBadgeTxt:     { color: "#fff", fontSize: 13, fontWeight: "800" },
  roadmapName:         { fontSize: typography.bodyMedium.fontSize, fontFamily: typography.bodyMedium.fontFamily, fontWeight: "700", color: palette.gray500 },
  roadmapNameCurrent:  { color: palette.gray800 },
  roadmapFeatures:     { fontSize: 11, color: palette.gray400, marginTop: 2 },

  currentPill:      { backgroundColor: palette.primary600, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, marginLeft: 6 },
  currentPillTxt:   { color: "#fff", fontSize: 10, fontWeight: "700" },
  completePill:     { backgroundColor: semantic.success.bg, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, marginLeft: 6 },
  completePillTxt:  { color: semantic.success.text, fontSize: 10, fontWeight: "700" },

  seasonInfoTxt:    { fontSize: typography.bodySm.fontSize, color: palette.gray500, lineHeight: 18, marginTop: spacing.sm },
  seasonInfoBold:   { color: palette.gray800, fontWeight: "700" },
  seasonInfoAccent: { color: palette.primary600, fontWeight: "700" },
});
