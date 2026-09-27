import React from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator, Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { analyticsApi } from "@/api/analytics";
import { useAppSelector } from "@/store";
import { palette, accentSolid, radius, spacing } from "@/theme/colors";

// ─── Types ────────────────────────────────────────────────────────────────────
// Actual shape returned by GET /v1/analytics/student/{userId}/weekly-summary
// (services/analytics_service/app/api/v1/routes/analytics.py:364 student_weekly_summary)
interface WeakTopic {
  topic_id:  string;
  accuracy:  number;
  attempts:  number;
}

interface WeeklySummary {
  videos_watched:    number;
  quizzes_completed: number;
  avg_score:         number;
  xp_earned:         number;
  rank:              number;
  streak:            number;
  weak_topics:       WeakTopic[];
}

// ─── Stat card (matches AnalyticsScreen.tsx visual style) ─────────────────────

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={s.barTrack}>
      <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WeeklyReportScreen() {
  const navigation = useNavigation<any>();
  const userId: string = useAppSelector((st) => st.auth.user?.id ?? "");
  const userName: string = useAppSelector((st) => st.auth.user?.full_name ?? "");

  const {
    data: raw,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["weekly-summary", userId],
    queryFn: () => analyticsApi.weeklySummary(userId).then((r) => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const summary: WeeklySummary | null = raw ?? null;

  const videos    = summary?.videos_watched    ?? 0;
  const quizzes   = summary?.quizzes_completed ?? 0;
  const avgScore  = Math.round(summary?.avg_score ?? 0);
  const xpEarned  = summary?.xp_earned ?? 0;
  const rank      = summary?.rank ?? 0;
  const streak    = summary?.streak ?? 0;
  const weakTopics = summary?.weak_topics ?? [];

  const hasActivity = videos > 0 || quizzes > 0 || xpEarned > 0;

  // A natural share text can be composed from this summary — reuse the
  // Share.share() pattern established in ReferralScreen.tsx / QuizScreen.tsx.
  const handleShare = async () => {
    try {
      const lines = [
        `📊 My Weekly Report on EduLearn${userName ? ` — ${userName}` : ""}`,
        "",
        `🎬 Videos watched: ${videos}`,
        `✅ Quizzes completed: ${quizzes}`,
        `🎯 Avg. quiz score: ${avgScore}%`,
        `⚡ XP earned: ${xpEarned}`,
        `🔥 Streak: ${streak} day${streak === 1 ? "" : "s"}`,
      ];
      if (rank > 0) lines.push(`🏆 Rank: #${rank}`);
      lines.push("", "Join me on EduLearn: https://edulearn.app");

      await Share.share({
        message: lines.join("\n"),
        title: "My Weekly Progress Report",
      });
    } catch {
      Toast.show({ type: "error", text1: "Share failed", text2: "Please try again." });
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[s.header, { backgroundColor: palette.primary600 }]}>
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Weekly Report</Text>
          <View style={{ width: 36 }} />
        </View>
        <Text style={s.headerSub}>Your progress over the last 7 days</Text>
      </View>

      <ScrollView
        style={s.container}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Loading state */}
        {isLoading && (
          <View style={s.centeredState}>
            <ActivityIndicator size="large" color={palette.primary600} />
            <Text style={s.loadingTxt}>Loading your weekly report…</Text>
          </View>
        )}

        {/* Error state */}
        {!isLoading && isError && (
          <View style={s.centeredState}>
            <Ionicons name="alert-circle-outline" size={40} color={palette.danger500} />
            <Text style={s.errorTxt}>Couldn't load your weekly report.</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => refetch()} disabled={isFetching}>
              {isFetching ? (
                <ActivityIndicator color={palette.primary600} size="small" />
              ) : (
                <Text style={s.retryBtnTxt}>Retry</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Empty state */}
        {!isLoading && !isError && summary && !hasActivity && (
          <View style={s.centeredState}>
            <View style={s.emptyIconBox}>
              <Ionicons name="bar-chart-outline" size={40} color={palette.gray400} />
            </View>
            <Text style={s.emptyTitle}>No Activity This Week</Text>
            <Text style={s.emptyBody}>
              Watch videos and attempt quizzes to build up your weekly report.
            </Text>
          </View>
        )}

        {/* Content */}
        {!isLoading && !isError && summary && hasActivity && (
          <View style={s.content}>
            {/* Streak highlight */}
            <View style={[s.card, s.rowBetween]}>
              <View>
                <Text style={s.cardTitle}>🔥 {streak}-day streak</Text>
                <Text style={s.cardSub}>Keep learning daily to grow your streak</Text>
              </View>
              <View style={s.streakDots}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <View key={i} style={[s.streakDot, i < streak % 7 && s.streakDotActive]} />
                ))}
              </View>
            </View>

            {/* Summary stat cards */}
            <View style={s.statsGrid}>
              <StatCard label="Videos"    value={videos}         icon="play-circle"      color={palette.primary500} />
              <StatCard label="Quizzes"   value={quizzes}        icon="checkmark-circle" color={palette.success500} />
              <StatCard label="Avg Score" value={`${avgScore}%`} icon="analytics"        color={palette.warning500} />
              <StatCard label="XP Earned" value={xpEarned}       icon="star"             color={accentSolid.violet} />
            </View>

            {/* Rank card */}
            {rank > 0 && (
              <View style={[s.card, s.rowBetween]}>
                <View style={s.rowCenter}>
                  <View style={[s.statIcon, { backgroundColor: palette.warning500 + "22" }]}>
                    <Ionicons name="trophy" size={18} color={palette.warning500} />
                  </View>
                  <View style={{ marginLeft: 10 }}>
                    <Text style={s.cardTitle}>Rank #{rank}</Text>
                    <Text style={s.cardSub}>Your standing this week</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Breakdown section */}
            <View style={s.card}>
              <Text style={[s.cardTitle, { marginBottom: 12 }]}>This Week's Breakdown</Text>

              <View style={s.breakdownRow}>
                <View style={s.breakdownLeft}>
                  <Ionicons name="play-circle-outline" size={16} color={palette.primary500} />
                  <Text style={s.breakdownLabel}>Videos watched</Text>
                </View>
                <Text style={s.breakdownValue}>{videos}</Text>
              </View>
              <View style={s.breakdownDivider} />

              <View style={s.breakdownRow}>
                <View style={s.breakdownLeft}>
                  <Ionicons name="checkmark-done-outline" size={16} color={palette.success500} />
                  <Text style={s.breakdownLabel}>Quizzes completed</Text>
                </View>
                <Text style={s.breakdownValue}>{quizzes}</Text>
              </View>
              <View style={s.breakdownDivider} />

              <View style={s.breakdownRow}>
                <View style={s.breakdownLeft}>
                  <Ionicons name="ribbon-outline" size={16} color={palette.warning500} />
                  <Text style={s.breakdownLabel}>Average quiz score</Text>
                </View>
                <Text style={s.breakdownValue}>{avgScore}%</Text>
              </View>
              <View style={s.breakdownDivider} />

              <View style={s.breakdownRow}>
                <View style={s.breakdownLeft}>
                  <Ionicons name="flash-outline" size={16} color={accentSolid.violet} />
                  <Text style={s.breakdownLabel}>XP earned</Text>
                </View>
                <Text style={s.breakdownValue}>{xpEarned}</Text>
              </View>

              {rank > 0 && (
                <>
                  <View style={s.breakdownDivider} />
                  <View style={s.breakdownRow}>
                    <View style={s.breakdownLeft}>
                      <Ionicons name="trophy-outline" size={16} color={palette.danger500} />
                      <Text style={s.breakdownLabel}>Rank</Text>
                    </View>
                    <Text style={s.breakdownValue}>#{rank}</Text>
                  </View>
                </>
              )}
            </View>

            {/* Weak topics */}
            {weakTopics.length > 0 && (
              <View style={s.card}>
                <Text style={[s.cardTitle, { marginBottom: 10 }]}>⚠️ Needs Improvement</Text>
                {weakTopics.slice(0, 5).map((t, i) => (
                  <View key={t.topic_id ?? i} style={{ marginBottom: spacing.sm }}>
                    <View style={s.rowBetween}>
                      <Text style={s.weakLabel}>{t.topic_id?.replace(/_/g, " ")}</Text>
                      <Text style={[s.weakPct, t.accuracy < 40 && { color: palette.danger500 }]}>
                        {Math.round(t.accuracy)}%
                      </Text>
                    </View>
                    <ProgressBar value={t.accuracy} max={100} color={t.accuracy < 40 ? palette.danger500 : palette.warning500} />
                  </View>
                ))}
              </View>
            )}

            {/* Share action */}
            <TouchableOpacity onPress={handleShare} activeOpacity={0.85} style={[s.shareBtn, { backgroundColor: palette.primary600 }]}>
              <Ionicons name="share-social-outline" size={18} color="#fff" />
              <Text style={s.shareBtnTxt}>Share My Report</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: palette.gray50 },
  container:      { flex: 1 },

  header:         { paddingTop: spacing.sm, paddingBottom: spacing["2xl"], paddingHorizontal: spacing.xl },
  headerTopRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle:    { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  headerSub:      { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: spacing.sm + 2, textAlign: "center" },

  content:        { padding: spacing.lg, gap: spacing.md },

  card:           { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardTitle:      { fontSize: 13, fontWeight: "700", color: palette.gray800 },
  cardSub:        { fontSize: 11, color: palette.gray400, marginTop: 2 },

  rowBetween:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowCenter:      { flexDirection: "row", alignItems: "center" },

  streakDots:     { flexDirection: "row", gap: 5 },
  streakDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.gray100 },
  // Streak "fire" accent (#f97316, orange-500) is a deliberate one-off — not
  // part of the shared indigo/gray/semantic palette; kept hardcoded (see report).
  streakDotActive:{ backgroundColor: "#f97316" },

  statsGrid:      { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statCard:       { flexGrow: 1, flexBasis: "45%", minWidth: 100, backgroundColor: "#fff", borderRadius: radius.md + 2, padding: spacing.md + 2, alignItems: "center", gap: spacing.sm - 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  statIcon:       { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  statValue:      { fontSize: 16, fontWeight: "800", color: palette.gray800 },
  statLabel:      { fontSize: 11, color: palette.gray500, fontWeight: "600" },

  breakdownRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm + 2 },
  breakdownLeft:      { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  breakdownLabel:     { fontSize: 13, color: palette.gray700, fontWeight: "500" },
  breakdownValue:     { fontSize: 13, color: palette.gray900, fontWeight: "700" },
  breakdownDivider:   { height: 1, backgroundColor: palette.gray100 },

  barTrack:       { height: 6, backgroundColor: palette.gray100, borderRadius: 3, overflow: "hidden" },
  barFill:        { height: "100%", borderRadius: 3 },
  weakLabel:      { fontSize: 12, color: palette.gray500, textTransform: "capitalize" },
  weakPct:        { fontSize: 12, fontWeight: "700", color: palette.warning500 },

  shareBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.md + 2, minHeight: 44, paddingVertical: spacing.md + 2, marginTop: spacing.xs },
  shareBtnTxt:    { color: "#fff", fontSize: 15, fontWeight: "700" },

  // States
  centeredState:  { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing["3xl"], paddingTop: 80, gap: spacing.md },
  emptyIconBox:   { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
  emptyTitle:     { fontSize: 15, fontWeight: "700", color: palette.gray700, textAlign: "center" },
  emptyBody:      { fontSize: 13, color: palette.gray400, textAlign: "center", lineHeight: 19 },
  loadingTxt:     { fontSize: 14, color: palette.gray500, marginTop: spacing.sm },
  errorTxt:       { fontSize: 14, color: palette.danger500, textAlign: "center", lineHeight: 20 },
  retryBtn:       { marginTop: spacing.xs, backgroundColor: palette.primary50, paddingHorizontal: spacing["2xl"], paddingVertical: spacing.sm + 2, borderRadius: radius.md, minHeight: 44, justifyContent: "center" },
  retryBtnTxt:    { fontSize: 13, fontWeight: "700", color: palette.primary600 },
});
