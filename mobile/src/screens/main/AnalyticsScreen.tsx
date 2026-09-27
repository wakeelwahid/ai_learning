import React, { useState, useEffect } from "react";
import Toast from "react-native-toast-message";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "@/api/analytics";
import { getProfile, getUserBadges } from "@/api/gamification";
import { battleApi } from "@/api/battle";
import { palette, semantic, accentSolid, radius, spacing } from "@/theme/colors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashData {
  total_videos_watched: number;
  total_quizzes_completed: number;
  avg_quiz_score: number;
  chapters_in_progress: number;
  weak_topics: { topic_id: string; accuracy: number; attempts: number }[];
}

interface GamProfile {
  xp?: { total_xp: number; level: number; xp_to_next_level?: number; progress_percent?: number };
  streak?: { current: number; longest: number };
  badges?: { type: string; earned_at: string }[];
  edupoints?: { balance: number; total_earned: number };
}

interface BattleStats {
  total_battles?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  win_rate?: number;
  xp_from_battles?: number;
}

const TABS = ["Overview", "Battles", "Progress", "Badges"] as const;
type Tab = typeof TABS[number];

const BADGE_INFO: Record<string, { emoji: string; label: string; desc: string }> = {
  first_login:   { emoji: "🎉", label: "First Login",   desc: "Welcome to EduLearn!" },
  quiz_master:   { emoji: "🧠", label: "Quiz Master",   desc: "Completed 10+ quizzes" },
  streak_7:      { emoji: "🔥", label: "7-Day Streak",  desc: "Studied 7 days in a row" },
  streak_30:     { emoji: "🚀", label: "30-Day Streak", desc: "30 days of dedication" },
  top_scorer:    { emoji: "🏆", label: "Top Scorer",    desc: "Scored 90%+ in a quiz" },
  battle_winner: { emoji: "⚔️", label: "Battle Winner", desc: "Won your first battle" },
  video_star:    { emoji: "🎬", label: "Video Star",    desc: "Watched 20+ videos" },
};

// ─── Mini progress bar ─────────────────────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={s.barTrack}>
      <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={s.statValue} numberOfLines={1}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ dash, gam, loading }: { dash: DashData | null; gam: GamProfile | null; loading: boolean }) {
  if (loading) return <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={palette.primary500} />;

  const totalXp   = gam?.xp?.total_xp    ?? 0;
  const level     = gam?.xp?.level       ?? 0;
  const xpToNext  = gam?.xp?.xp_to_next_level ?? 500;
  const streak    = gam?.streak?.current  ?? 0;
  const longest   = gam?.streak?.longest  ?? 0;
  const badges    = gam?.badges ?? [];
  const ep        = gam?.edupoints?.balance ?? 0;

  const videos    = dash?.total_videos_watched    ?? 0;
  const quizzes   = dash?.total_quizzes_completed ?? 0;
  const avgScore  = Math.round(dash?.avg_quiz_score ?? 0);
  const chapters  = dash?.chapters_in_progress     ?? 0;
  const weakTopics= dash?.weak_topics ?? [];

  return (
    <View style={{ gap: 12 }}>
      {/* XP / Level card */}
      <View style={s.card}>
        <View style={s.xpHeader}>
          <View>
            <Text style={s.cardTitle}>Level {level}</Text>
            <Text style={s.cardSub}>{totalXp.toLocaleString()} XP total</Text>
          </View>
          <View style={s.epBadge}>
            <Text style={s.epText}>⚡ {ep} EP</Text>
          </View>
        </View>
        <ProgressBar value={totalXp % xpToNext} max={xpToNext} color={palette.primary500} />
        <Text style={s.xpToNext}>{xpToNext - (totalXp % xpToNext)} XP to Level {level + 1}</Text>
      </View>

      {/* Streak */}
      <View style={[s.card, s.rowBetween]}>
        <View>
          <Text style={s.cardTitle}>🔥 {streak}-day streak</Text>
          <Text style={s.cardSub}>Longest: {longest} days</Text>
        </View>
        <View style={s.streakDots}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={[s.streakDot, i < streak % 7 && s.streakDotActive]} />
          ))}
        </View>
      </View>

      {/* Stats grid */}
      <View style={s.statsGrid}>
        <StatCard label="Videos"     value={videos}       icon="play-circle"    color={palette.primary500} />
        <StatCard label="Quizzes"    value={quizzes}      icon="checkmark-circle" color={palette.success500} />
        <StatCard label="Avg Score"  value={`${avgScore}%`} icon="analytics"    color={palette.warning500} />
        <StatCard label="Chapters"   value={chapters}     icon="book-outline"   color={accentSolid.teal} />
      </View>

      {/* Weak topics */}
      <View style={s.card}>
        <Text style={[s.cardTitle, { marginBottom: 10 }]}>⚠️ Needs Improvement</Text>
        {weakTopics.length === 0 ? (
          <Text style={[s.weakLabel, { textAlign: "center", paddingVertical: 12 }]}>
            No weak topics — great performance!
          </Text>
        ) : (
          weakTopics.slice(0, 4).map((t) => (
            <View key={t.topic_id} style={{ marginBottom: 8 }}>
              <View style={s.rowBetween}>
                <Text style={s.weakLabel}>{t.topic_id.replace(/_/g, " ")}</Text>
                <Text style={[s.weakPct, t.accuracy < 40 && { color: palette.danger500 }]}>
                  {Math.round(t.accuracy)}%
                </Text>
              </View>
              <ProgressBar value={t.accuracy} max={100} color={t.accuracy < 40 ? palette.danger500 : palette.warning500} />
            </View>
          ))
        )}
      </View>

      {/* Badges */}
      {badges.length > 0 && (
        <View style={s.card}>
          <Text style={[s.cardTitle, { marginBottom: 10 }]}>🏅 Badges Earned</Text>
          <View style={s.badgeRow}>
            {badges.map((b) => (
              <View key={b.type} style={s.badge}>
                <Text style={s.badgeEmoji}>{BADGE_INFO[b.type]?.emoji ?? "🎖️"}</Text>
                <Text style={s.badgeLabel}>{b.type.replace(/_/g, " ")}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Battles Tab ──────────────────────────────────────────────────────────────

function BattlesTab({ userId }: { userId: string }) {
  const { data: statsRaw, isLoading } = useQuery({
    queryKey: ["battle-stats", userId],
    queryFn: () => battleApi.stats(userId).then((r) => r.data),
    retry: 0,
  });

  const { data: histRaw, isLoading: histLoading } = useQuery({
    queryKey: ["battle-history", userId],
    queryFn: () => battleApi.history(userId).then((r) => r.data),
    retry: 0,
  });

  if (isLoading) return <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={palette.primary500} />;

  const stats: BattleStats = statsRaw ?? {};
  const history: any[] = Array.isArray(histRaw) ? histRaw
    : Array.isArray(histRaw?.battles) ? histRaw.battles
    : [];

  const wins     = stats.wins     ?? 0;
  const losses   = stats.losses   ?? 0;
  const draws    = stats.draws    ?? 0;
  const total    = stats.total_battles ?? (wins + losses + draws);
  const winRate  = total > 0 ? Math.round((wins / total) * 100) : 0;

  return (
    <View style={{ gap: 12 }}>
      {total === 0 && !histLoading ? (
        <View style={[s.card, { alignItems: "center", paddingVertical: spacing["2xl"] }]}>
          <Ionicons name="flash-outline" size={40} color={palette.gray300} />
          <Text style={[s.cardSub, { marginTop: spacing.sm }]}>No battles played yet</Text>
          <Text style={[s.weakLabel, { marginTop: spacing.xs, textAlign: "center" }]}>
            Start a battle to track your performance here
          </Text>
        </View>
      ) : (
        <>
          <View style={s.statsGrid}>
            <StatCard label="Battles"   value={total}          icon="flash"           color={palette.primary500} />
            <StatCard label="Wins"      value={wins}           icon="trophy"          color={palette.success500} />
            <StatCard label="Losses"    value={losses}         icon="close-circle"    color={palette.danger500} />
            <StatCard label="Win Rate"  value={`${winRate}%`}  icon="stats-chart"     color={palette.warning500} />
          </View>

          <View style={s.card}>
            <Text style={[s.cardTitle, { marginBottom: spacing.sm }]}>Win / Loss Ratio</Text>
            {total > 0 && (
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${winRate}%` as any, backgroundColor: palette.success500 }]} />
              </View>
            )}
            <View style={[s.rowBetween, { marginTop: spacing.xs + 2 }]}>
              <Text style={[s.weakLabel, { color: palette.success500 }]}>Wins: {wins}</Text>
              {draws > 0 && <Text style={[s.weakLabel, { color: palette.warning500 }]}>Draws: {draws}</Text>}
              <Text style={[s.weakLabel, { color: palette.danger500 }]}>Losses: {losses}</Text>
            </View>
          </View>

          {history.length > 0 && (
            <View style={s.card}>
              <Text style={[s.cardTitle, { marginBottom: spacing.sm }]}>Recent Battles</Text>
              {history.slice(0, 5).map((b: any, i: number) => (
                <View key={i} style={[s.histRow, i < history.length - 1 && s.histDivider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle} numberOfLines={1}>{b.subject ?? b.topic ?? "Battle"}</Text>
                    <Text style={s.cardSub}>{b.battle_type ?? b.mode ?? "—"}</Text>
                  </View>
                  <View style={[s.resultBadge, { backgroundColor: b.result === "win" ? semantic.success.bg : b.result === "loss" ? semantic.danger.bg : palette.gray100 }]}>
                    <Text style={[s.resultText, { color: b.result === "win" ? semantic.success.text : b.result === "loss" ? semantic.danger.text : palette.gray500 }]}>
                      {b.result ?? "—"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ─── Progress Tab ─────────────────────────────────────────────────────────────

function ProgressTab({ userId }: { userId: string }) {
  const { data: progressRaw, isLoading } = useQuery({
    queryKey: ["student-progress", userId],
    queryFn: () => analyticsApi.progress(userId).then((r) => r.data),
    retry: 0,
  });

  if (isLoading) return <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={palette.primary500} />;

  const subjects: Record<string, { videos: number; quizzes: number; score: number; pct: number }> =
    progressRaw?.subject_breakdown ?? progressRaw?.subjects ?? {};

  const subjectList = Object.entries(subjects);

  // Rotating categorical tint per subject card (decorative, not brand) —
  // solid colors only, no gradients, no violet (per design-system palette rule).
  const SUBJ_COLORS = [
    palette.primary500, palette.success500, palette.warning500,
    palette.danger500, accentSolid.teal, accentSolid.cyan,
  ];

  return (
    <View style={{ gap: spacing.md }}>
      {subjectList.length === 0 ? (
        <View style={[s.card, { alignItems: "center", paddingVertical: spacing["2xl"] }]}>
          <Ionicons name="bar-chart-outline" size={40} color={palette.gray300} />
          <Text style={[s.cardSub, { marginTop: spacing.sm }]}>No progress data yet</Text>
          <Text style={[s.weakLabel, { marginTop: spacing.xs, textAlign: "center" }]}>
            Complete videos and quizzes to track your progress
          </Text>
        </View>
      ) : (
        subjectList.map(([subject, data], i) => (
          <View key={subject} style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>{subject}</Text>
              <Text style={[s.statValue, { color: SUBJ_COLORS[i % SUBJ_COLORS.length] }]}>
                {Math.round(data.pct ?? 0)}%
              </Text>
            </View>
            <ProgressBar value={data.pct ?? 0} max={100} color={SUBJ_COLORS[i % SUBJ_COLORS.length]} />
            <View style={[s.rowBetween, { marginTop: spacing.xs + 2 }]}>
              <Text style={s.cardSub}>📹 {data.videos ?? 0} videos</Text>
              <Text style={s.cardSub}>✅ {data.quizzes ?? 0} quizzes</Text>
              <Text style={s.cardSub}>🎯 {Math.round(data.score ?? 0)}% avg</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Badges Tab ───────────────────────────────────────────────────────────────

function BadgesTab({ gam }: { gam: GamProfile | null }) {
  const userBadges = gam?.badges ?? [];
  const earnedTypes = new Set(userBadges.map((b) => b.type));

  return (
    <View style={{ gap: 12 }}>
      <View style={s.badgeGrid}>
        {Object.entries(BADGE_INFO).map(([key, info]) => {
          const earned = earnedTypes.has(key);
          const earnedAt = userBadges.find((b) => b.type === key)?.earned_at;
          return (
            <View key={key} style={[s.badgeTile, earned ? s.badgeTileEarned : s.badgeTileLocked]}>
              <Text style={s.badgeTileEmoji}>{info.emoji}</Text>
              <Text style={s.badgeTileLabel} numberOfLines={1}>{info.label}</Text>
              <Text style={s.badgeTileDesc} numberOfLines={2}>{info.desc}</Text>
              {earned && earnedAt ? (
                <Text style={s.badgeTileEarnedTxt}>
                  Earned {new Date(earnedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </Text>
              ) : (
                <Text style={s.badgeTileLockedTxt}>Locked</Text>
              )}
            </View>
          );
        })}
      </View>

      {userBadges.length === 0 && (
        <View style={[s.card, { alignItems: "center", paddingVertical: 32 }]}>
          <Ionicons name="trophy-outline" size={40} color={palette.gray300} />
          <Text style={[s.cardSub, { marginTop: 8 }]}>No badges yet</Text>
          <Text style={[s.weakLabel, { marginTop: 4, textAlign: "center" }]}>
            Complete activities to unlock your first badge
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const navigation = useNavigation<any>();
  const userId: string = useSelector((s: any) => s.auth.user?.id ?? "");
  const [tab, setTab] = useState<Tab>("Overview");

  const { data: dashRaw, isLoading: dashLoading, isError: dashError } = useQuery({
    queryKey: ["analytics-dash", userId],
    queryFn: () => analyticsApi.dashboard(userId).then((r) => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const { data: gamRaw, isLoading: gamLoading } = useQuery({
    queryKey: ["gam-profile", userId],
    queryFn: () => getProfile(userId).then((r) => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const { data: badgesRaw } = useQuery({
    queryKey: ["user-badges", userId],
    queryFn: () => getUserBadges(userId).then((r) => r.data),
    enabled: !!userId,
  });

  useEffect(() => {
    if (dashError) Toast.show({ type: "error", text1: "Could not load your analytics", text2: "Pull down to try again." });
  }, [dashError]);

  const loading = dashLoading || gamLoading;

  const gam: GamProfile | null = gamRaw ?? null;
  if (gam && badgesRaw) {
    gam.badges = Array.isArray(badgesRaw) ? badgesRaw : (badgesRaw?.badges ?? []);
  }

  const dash: DashData | null = dashRaw ?? null;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: spacing["2xl"] }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: palette.primary600 }]}>
        <View style={s.headerTopRow}>
          <View>
            <Text style={s.headerTitle}>My Analytics</Text>
            <Text style={s.headerSub}>Track your learning journey</Text>
          </View>
          <TouchableOpacity style={s.weeklyLinkBtn} onPress={() => navigation.navigate("WeeklyReport")} activeOpacity={0.8}>
            <Text style={s.weeklyLinkTxt}>Weekly Report</Text>
            <Ionicons name="chevron-forward" size={13} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={s.headerStats}>
          <View style={s.headerStat}>
            <Text style={s.headerStatVal}>{gam?.xp?.level ?? 0}</Text>
            <Text style={s.headerStatLbl}>Level</Text>
          </View>
          <View style={s.headerStatDivider} />
          <View style={s.headerStat}>
            <Text style={s.headerStatVal}>{(gam?.xp?.total_xp ?? 0).toLocaleString()}</Text>
            <Text style={s.headerStatLbl}>Total XP</Text>
          </View>
          <View style={s.headerStatDivider} />
          <View style={s.headerStat}>
            <Text style={s.headerStatVal}>{gam?.streak?.current ?? 0}d</Text>
            <Text style={s.headerStatLbl}>Streak</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[s.tabBtn, tab === t && s.tabBtnActive]}>
            <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <View style={s.content}>
        {tab === "Overview"  && <OverviewTab  dash={dash} gam={gam} loading={loading} />}
        {tab === "Battles"   && <BattlesTab   userId={userId} />}
        {tab === "Progress"  && <ProgressTab  userId={userId} />}
        {tab === "Badges"    && <BadgesTab    gam={gam} />}
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: palette.gray50 },
  header:         { paddingTop: spacing["5xl"] + 8, paddingBottom: spacing["2xl"], paddingHorizontal: spacing.xl },
  headerTitle:    { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  headerSub:      { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 2 },
  headerTopRow:   { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm + 2 },
  weeklyLinkBtn:  { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm - 1, marginTop: 2, minHeight: 32 },
  weeklyLinkTxt:  { color: "#fff", fontSize: 11, fontWeight: "700" },
  headerStats:    { flexDirection: "row", marginTop: spacing.lg, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.lg, padding: spacing.md },
  headerStat:     { flex: 1, alignItems: "center" },
  headerStatVal:  { color: "#fff", fontSize: 20, fontWeight: "800" },
  headerStatLbl:  { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 },
  headerStatDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: spacing.sm },

  tabRow:         { flexDirection: "row", backgroundColor: "#fff", paddingHorizontal: spacing.lg, paddingTop: spacing.xs, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  tabBtn:         { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 44, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabBtnActive:   { borderBottomColor: palette.primary600 },
  tabLabel:       { fontSize: 13, fontWeight: "600", color: palette.gray400 },
  tabLabelActive: { color: palette.primary600 },

  content:        { padding: spacing.lg },

  card:           { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.gray100 },
  cardTitle:      { fontSize: 13, fontWeight: "700", color: palette.gray800 },
  cardSub:        { fontSize: 11, color: palette.gray400, marginTop: 2 },

  xpHeader:       { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm + 2 },
  epBadge:        { backgroundColor: semantic.warning.bg, borderRadius: 10, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs },
  epText:         { fontSize: 12, fontWeight: "700", color: semantic.warning.text },
  xpToNext:       { fontSize: 10, color: palette.gray400, marginTop: spacing.xs },

  statsGrid:      { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statCard:       { flexGrow: 1, flexBasis: "45%", minWidth: 100, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md + 2, alignItems: "center", gap: spacing.sm - 2, borderWidth: 1, borderColor: palette.gray100 },
  statIcon:       { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  statValue:      { fontSize: 20, fontWeight: "800", color: palette.gray800 },
  statLabel:      { fontSize: 11, color: palette.gray500, fontWeight: "600" },

  barTrack:       { height: 6, backgroundColor: palette.gray100, borderRadius: 3, overflow: "hidden" },
  barFill:        { height: "100%", borderRadius: 3 },

  rowBetween:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  streakDots:     { flexDirection: "row", gap: 5 },
  streakDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.gray100 },
  streakDotActive:{ backgroundColor: palette.warning500 },

  weakLabel:      { fontSize: 12, color: palette.gray500 },
  weakPct:        { fontSize: 12, fontWeight: "700", color: palette.warning500 },

  badgeRow:       { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  badge:          { alignItems: "center", width: 60 },
  badgeEmoji:     { fontSize: 28 },
  badgeLabel:     { fontSize: 9, color: palette.gray400, textAlign: "center", marginTop: 3 },

  badgeGrid:          { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm + 2 },
  badgeTile:          { flexGrow: 1, flexBasis: "45%", minWidth: 100, backgroundColor: "#fff", borderRadius: radius.lg, borderWidth: 1, padding: spacing.md + 2, alignItems: "center" },
  badgeTileEarned:    { borderColor: palette.primary100 },
  badgeTileLocked:    { borderColor: palette.gray100, opacity: 0.5 },
  badgeTileEmoji:     { fontSize: 30, marginBottom: spacing.sm - 2 },
  badgeTileLabel:     { fontSize: 13, fontWeight: "700", color: palette.gray800, textAlign: "center" },
  badgeTileDesc:      { fontSize: 10, color: palette.gray400, textAlign: "center", marginTop: 2 },
  badgeTileEarnedTxt: { fontSize: 9, fontWeight: "700", color: palette.primary500, marginTop: spacing.sm - 2 },
  badgeTileLockedTxt: { fontSize: 9, fontWeight: "700", color: palette.gray300, marginTop: spacing.sm - 2 },

  histRow:        { paddingVertical: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm + 2 },
  histDivider:    { borderBottomWidth: 1, borderBottomColor: palette.gray50 },
  resultBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  resultText:     { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
});
