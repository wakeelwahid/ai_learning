import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, Modal, ActivityIndicator, Image,
  useWindowDimensions,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import { useStudyTime } from "@/hooks/useStudyTime";
import { contentApi } from "@/api/content";
import { quizApi } from "@/api/quiz";
import { analyticsApi } from "@/api/analytics";
import { getEduPointsBalance, getLevelInfo, getTodaysGoal, getFriendsLeaderboard, getTodayChallenge, claimChallengeReward, getWeeklyChallengeStats, getMonthlyChallengeStats } from "@/api/gamification";
import { announcementApi } from "@/api/announcement";
import Toast from "react-native-toast-message";
import DailyRewardPopup from "@/components/DailyRewardPopup";
import GoalsModal from "@/components/ui/Modal";
import AssignmentsCard from "@/components/AssignmentsCard";
import DailySpinFab from "@/components/DailySpinFab";
import GrowthDashboard from "@/components/GrowthDashboard";
import UsageTodayCard from "@/components/UsageTodayCard";
import { palette, accentSolid, semantic, cardShadowElevated } from "@/theme/colors";

// `tint` = flat solid fill for each action's icon badge — the design system
// drops decorative gradients everywhere, so every badge below renders as a
// solid-color View instead of a LinearGradient.
const QUICK_ACTIONS = [
  { icon: "play",          label: "Start Quiz",   tint: palette.primary600 },
  { icon: "flash",         label: "Battle",       tint: semantic.danger.solid },
  { icon: "sparkles",      label: "AI Tutor",     tint: palette.primary600 },
  { icon: "document-text", label: "PYP Papers",   tint: accentSolid.cyan },
  { icon: "refresh-circle",label: "Revision",     tint: accentSolid.violet },
  { icon: "rocket",        label: "Career Guide", tint: semantic.warning.solid },
  { icon: "briefcase",     label: "Career Hub",   tint: semantic.warning.solid },
  { icon: "map",           label: "Roadmap",      tint: accentSolid.teal },
  { icon: "flag",          label: "Challenges",   tint: semantic.success.solid },
  { icon: "library",       label: "Knowledge",    tint: "#DB2777" },
  { icon: "trophy",        label: "Leaderboard",  tint: "#CA8A04" },
  { icon: "bar-chart",     label: "Analytics",    tint: palette.primary700 },
];

// Announcement type config — mirrors web AnnouncementBanner's CFG map
const ANNOUNCE_COLORS: Record<string, string> = {
  feature: accentSolid.violet, update: semantic.info.solid, maintenance: semantic.warning.solid, exam: semantic.success.solid, general: palette.gray500,
};
const ANNOUNCE_LABELS: Record<string, string> = {
  feature: "New Feature", update: "Update", maintenance: "Maintenance", exam: "Exam Info", general: "Info",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "goodMorning";
  if (h < 17) return "goodAfternoon";
  return "goodEvening";
}

function ytThumb(ytId: string) {
  return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
}

// Mirrors web DashboardPage.tsx's fmtDuration exactly
function fmtDuration(s: number) {
  if (!s) return "";
  const m = Math.floor(s / 60), sec = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

// Mirrors web DashboardPage.tsx's subject-color map — flat solid tint per
// subject (design system drops decorative gradients) instead of a 2-stop grad.
const SUBJECT_TINT: Record<string, string> = {
  Physics:         palette.primary500,
  Mathematics:     "#DB2777",
  Chemistry:       semantic.success.solid,
  Biology:         semantic.success.solid,
  Science:         accentSolid.cyan,
  "Social Science":semantic.warning.solid,
};
const DEFAULT_VIDEO_TINT = palette.primary500;
function videoTint(subject?: string | null): string {
  return (subject && SUBJECT_TINT[subject]) || DEFAULT_VIDEO_TINT;
}

// Shared horizontal list-row video card — used by Continue/Start Watching,
// Recommended, Trending, and New Uploads so all 4 rows share one visual pattern.
function VideoListCard({
  video, onPress, badgeText, badgeColor, progress, metaExtra,
}: {
  video: any;
  onPress: () => void;
  badgeText?: string;
  badgeColor?: string;
  progress?: number;
  metaExtra?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const subject = video.subject_name ?? video.subject ?? "Video";
  const ytId = video.youtube_id ?? "d_S4LiGALwk";
  const completed = (progress ?? 0) >= 100;

  return (
    <TouchableOpacity style={styles.vRowCard} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.vRowIconWrap}>
        {imgFailed ? (
          <View style={[styles.vRowIconBox, { backgroundColor: videoTint(video.subject_name ?? video.subject) }]}>
            <Ionicons name="play" size={18} color="#fff" />
          </View>
        ) : (
          <View style={styles.vRowIconBox}>
            <Image
              source={{ uri: ytThumb(ytId) }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
              onError={() => setImgFailed(true)}
            />
            <View style={styles.vRowPlayOverlay}>
              <Ionicons name="play" size={13} color="#fff" />
            </View>
          </View>
        )}
        {!!badgeText && (
          <View style={[styles.vRowBadge, badgeColor ? { backgroundColor: badgeColor } : null]}>
            <Text style={styles.vRowBadgeTxt} numberOfLines={1}>{badgeText}</Text>
          </View>
        )}
      </View>
      <View style={styles.vRowBody}>
        <Text style={styles.vRowTitle} numberOfLines={1}>{video.title}</Text>
        <Text style={styles.vRowSubject} numberOfLines={1}>
          {subject}{metaExtra && progress === undefined ? `  ·  ${metaExtra}` : ""}
        </Text>
        {progress !== undefined && (
          <>
            {/* Completion row */}
            <View style={styles.vRowCompletionRow}>
              <Ionicons
                name={completed ? "checkmark-circle" : "play-circle-outline"}
                size={12}
                color={completed ? semantic.success.solid : palette.primary600}
              />
              <Text style={[styles.vRowCompletionTxt, completed && { color: semantic.success.solid }]}>
                {completed ? "Completed" : `${Math.round(progress)}% complete`}
              </Text>
            </View>
            <View style={styles.vRowBarTrack}>
              <View style={[styles.vRowBarFill, { width: `${progress}%` as any }, completed && { backgroundColor: semantic.success.solid }]} />
            </View>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

// Circular progress ring wrapping an icon badge — used by the Today's Goals
// row to show each goal's completion state at a glance (thin track + solid-
// color progress arc, per the design system's no-decorative-gradients rule
// for strokes — the gradient the user asked for lives on the icon badge
// fill inside the ring, not the ring stroke itself).
function ProgressRing({
  color, pct, size = 56, strokeWidth = 3, children,
}: {
  color: string;
  pct: number;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(1, Math.max(0, pct / 100));
  const dashOffset = circumference * (1 - progress);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={palette.primary50} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}

export default function DashboardScreen() {
  const user = useAppSelector(s => s.auth.user);
  const { t } = useLanguage();
  const { blocked: studyBlocked, limitMinutes: studyLimitMinutes } = useStudyTime();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const firstName = user?.full_name?.split(" ")[0] || "Student";
  const userId = user?.id ?? user?.user_id ?? "";
  // Below this width the header chip row (Friends/Lv/Weekly/Upcoming) drops
  // its text labels to icon-only so all 4 always fit on one line — RN has
  // no media queries, so this mirrors web's `xs:` breakpoint switch via a
  // live width read instead. Chosen to match web's xs=400 cutover exactly.
  const { width: screenWidth } = useWindowDimensions();
  const chipsCompact = screenWidth < 400;
  // Icon-only chips (compact width) show their label in a small floating
  // tooltip on long-press — the touch equivalent of web's mouse-hover title.
  const [chipTooltip, setChipTooltip] = useState<string | null>(null);

  // "Today's Mission" (and XP/EduPoints/level chips) are stale-cached client
  // side (see GrowthDashboard's staleTime) so they don't hammer the API on
  // every render. That means finishing a quiz or watching a video WON'T show
  // up here on its own — refresh them explicitly whenever the student could
  // plausibly have made progress: closing the in-screen Quiz modal, and
  // regaining focus on this tab (covers video-watching progress made on the
  // separate Learn screen, which stays mounted in the background otherwise).
  const refreshMissionState = useCallback(() => {
    if (!userId) return;
    queryClient.invalidateQueries({ queryKey: ["today-goal", userId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats", userId] });
    queryClient.invalidateQueries({ queryKey: ["edupoints-balance", userId] });
    queryClient.invalidateQueries({ queryKey: ["level-info", userId] });
    queryClient.invalidateQueries({ queryKey: ["friends-leaderboard", userId] });
  }, [queryClient, userId]);

  useFocusEffect(
    useCallback(() => {
      refreshMissionState();
    }, [refreshMissionState])
  );

  const [quizLoading,    setQuizLoading]    = useState(false);
  const [showAllActions, setShowAllActions] = useState(false);

  const openVideoPlayer = (video: any) => {
    navigation.navigate("VideoPlayer", { video });
  };

  // Fetch live continue watching
  const { data: cwData, isLoading: cwLoading } = useQuery({
    queryKey: ["continue-watching", userId],
    queryFn: () => contentApi.continueWatching(userId, 10).then(r => r.data),
    enabled: !!userId,
    staleTime: 30_000,
  });

  // Fetch dashboard stats from analytics API
  const { data: dashData } = useQuery({
    queryKey: ["dashboard-stats", userId],
    queryFn: () => analyticsApi.dashboard(userId).then(r => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });

  // Trending videos (popular sort) — distinct from Continue Watching (in-progress only)
  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ["trending-videos"],
    queryFn: () => contentApi.popularVideos().then(r => r.data),
    staleTime: 5 * 60_000,
  });

  // New Uploads (recent sort) — mirrors web DashboardPage's "recent" video-feed query
  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ["recent-videos"],
    queryFn: () => contentApi.popularVideos().then(r => r.data), // popular-sort feed, same fallback source as web's recentVids row
    staleTime: 5 * 60_000,
  });

  // Real, backend-personalized recommendations (weak-topic-driven via
  // analytics_service) — falls back to popular server-side when the
  // student has no quiz signal yet, so no client-side heuristic needed here.
  const { data: recommendedData } = useQuery({
    queryKey: ["recommended-videos", userId],
    queryFn: () => contentApi.recommendedVideos().then(r => r.data),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  // Weak topics — dashboard API already includes weak_topics; fall back to dedicated
  // endpoint only if that field is missing from the dashboard payload.
  const dashboardWeakTopics: any[] | undefined = dashData?.weak_topics;
  const { data: weakTopicsData } = useQuery({
    queryKey: ["weak-topics", userId],
    queryFn: () => analyticsApi.weakTopics(userId).then(r => r.data),
    enabled: !!userId && dashboardWeakTopics === undefined,
    staleTime: 60_000,
  });

  // EduPoints balance + Level — power the quick-nav chip row (mirrors web
  // DashboardPage's header chips: EP / Level / Weekly / Upcoming)
  const { data: eduPointsData } = useQuery({
    queryKey: ["edupoints-balance", userId],
    queryFn: () => getEduPointsBalance(userId).then((r: any) => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });
  const { data: levelData } = useQuery({
    queryKey: ["level-info", userId],
    queryFn: () => getLevelInfo(userId).then((r: any) => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });


  // Announcements — mirrors web's AnnouncementBanner component
  const { data: announcementsData } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => announcementApi.list(true).then((r: any) => r.data),
    staleTime: 5 * 60_000,
  });
  const [activeAnnouncement, setActiveAnnouncement] = useState<any | null>(null);

  // Same query keys as GrowthDashboard.tsx's internal queries — React Query
  // dedupes these into one shared cache entry, so the notification-badge
  // buttons below never disagree with the popup they open. v2: up to 3
  // goals/day (one per slot: video/quiz/ai_doubt).
  const { data: goalsForBadge } = useQuery<any[]>({
    queryKey: ["today-goal", userId],
    queryFn: () => getTodaysGoal(userId).then((r: any) => r.data ?? []),
    enabled: !!userId,
    staleTime: 60_000,
  });
  const { data: friendsLbForBadge } = useQuery({
    queryKey: ["friends-leaderboard", userId],
    queryFn: () => getFriendsLeaderboard(userId).then((r: any) => r.data),
    enabled: !!userId,
    staleTime: 45_000,
  });
  // Single admin-published Daily Challenge — distinct from the 3-slot Today's
  // Goals above (per-student, auto-assigned); this is one global challenge
  // everyone sees, null if the admin hasn't published one today.
  const { data: dailyChallenge, refetch: refetchDailyChallenge } = useQuery({
    queryKey: ["today-challenge", userId],
    queryFn: () => getTodayChallenge(userId).then((r: any) => r.data),
    enabled: !!userId,
  });
  const [claimingChallenge, setClaimingChallenge] = useState(false);
  const handleClaimChallenge = async () => {
    if (!userId || !dailyChallenge?.challenge?.id || claimingChallenge) return;
    setClaimingChallenge(true);
    try {
      await claimChallengeReward(userId, dailyChallenge.challenge.id);
      await refetchDailyChallenge();
    } finally {
      setClaimingChallenge(false);
    }
  };
  const { data: weeklyChallengeStats } = useQuery({
    queryKey: ["weekly-challenge-stats", userId],
    queryFn: () => getWeeklyChallengeStats(userId).then((r: any) => r.data),
    enabled: !!userId,
  });
  const { data: monthlyChallengeStats } = useQuery({
    queryKey: ["monthly-challenge-stats", userId],
    queryFn: () => getMonthlyChallengeStats(userId).then((r: any) => r.data),
    enabled: !!userId,
  });
  // Session-only "seen" flags — clears the red badge the moment the user
  // opens that popup; reappears if a fresh unseen event shows up later
  // (e.g. goal resets next day, or leaderboard rank changes), since it's
  // derived from live data each render rather than a one-time dismissal.
  const [leaderboardSeen, setLeaderboardSeen] = useState(false);
  const [showGoalsSheet, setShowGoalsSheet] = useState(false);
  const growthTriggersRef = useRef<{ openMission: () => void; openLeaderboard: () => void } | null>(null);

  const goalBySlot = (slot: string) => goalsForBadge?.find((g) => g.slot === slot);
  // "Unseen" for the leaderboard = there's at least one friend to compete
  // with — a real signal (not a fabricated random count) that there's
  // something new to check out.
  const leaderboardHasUnseen = !!friendsLbForBadge && friendsLbForBadge.friend_count > 0 && !leaderboardSeen;

  const cwVideos: any[] = cwData?.videos ?? [];
  const trendingVideos: any[] = trendingData?.videos ?? [];
  const recentVideos: any[] = recentData?.videos ?? [];
  const weakTopics: any[] = dashboardWeakTopics ?? weakTopicsData?.weak_topics ?? [];
  // Real, backend-personalized recommendations (weak-topic-driven via
  // analytics_service) — falls back to popular server-side when the
  // student has no quiz signal yet, so no client-side heuristic needed here.
  const recommendedVideos: any[] = recommendedData?.videos ?? [];
  const recommendedIsPersonalized: boolean = !!recommendedData?.personalized;
  const eduPointsBalance: number = eduPointsData?.balance ?? 0;
  const levelNumber: number = levelData?.level ?? levelData?.current_level ?? 1;

  const announcements: any[] = announcementsData?.data ?? announcementsData ?? [];

  // Daily Goals progress now comes straight from gamification_service (see
  // goalsForBadge/GrowthDashboard's Mission popup) — content_service already
  // calls record_goal_progress on every real video completion, so this
  // screen no longer needs its own local AsyncStorage tally of the same
  // thing (the old client-side count, kept in sync with `dailyProgress`,
  // was never rendered anywhere once the round buttons dropped their
  // progress rings — the backend is the single source of truth now).

  // "Quick Quiz" / daily-goal shortcuts don't have a specific quiz picked
  // out — resolve a REAL quiz scoped to the student's board & class (set at
  // registration) instead of the old hardcoded "demo" id, which the backend
  // has always rejected (quiz_id is a UUID column) and just 422'd.
  const startQuickQuiz = async (onStarted?: () => void) => {
    if (quizLoading) return;
    setQuizLoading(true);
    try {
      let board: string | undefined;
      let classNum: number | undefined;
      try {
        const { data } = await contentApi.myCatalog();
        board = data?.board;
        classNum = data?.class_num;
      } catch {
        // Profile not set yet — fall through and let /quizzes/random try
        // an unscoped pick rather than blocking Quick Quiz entirely.
      }
      const { data: quiz } = await quizApi.random({ board, class_num: classNum });
      navigation.navigate("Quiz", { quizId: quiz.id, title: "Quick Quiz" });
      onStarted?.();
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "No quiz available",
        text2: e?.response?.data?.detail || "Please try again in a moment.",
      });
    } finally {
      setQuizLoading(false);
    }
  };

  const handleQuickAction = (label: string) => {
    if      (label === "Start Quiz")  startQuickQuiz();
    else if (label === "Battle")      navigation.navigate("Battle");
    else if (label === "AI Tutor")    navigation.navigate("AITutor");
    else if (label === "Career Guide") navigation.navigate("Career");
    else if (label === "Career Hub")  navigation.navigate("CareerHub");
    else if (label === "Roadmap")     navigation.navigate("Roadmap");
    else if (label === "PYP Papers")  navigation.navigate("PreviousYearPapers");
    else if (label === "Revision")    navigation.navigate("Revision");
    else if (label === "Knowledge")   navigation.navigate("KnowledgeHub");
    else if (label === "Challenges")  navigation.navigate("Challenges");
    else if (label === "Leaderboard") navigation.navigate("Leaderboard");
    else if (label === "Analytics")   navigation.navigate("Analytics");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={[styles.header, { backgroundColor: palette.primary600 }]}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>{t(greeting() as any)},</Text>
              <Text style={styles.userName}>{firstName} 👋</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {/* EP moved up here (mirrors web's header EP chip) — always
                  visible regardless of screen width, freeing the chip row
                  below for Friends/Lv/Weekly/Upcoming. */}
              <TouchableOpacity style={styles.epHeaderPill} onPress={() => navigation.navigate("EduPointsShop")}>
                <Ionicons name="logo-bitcoin" size={13} color="#FDE68A" />
                <Text style={styles.epHeaderPillTxt} numberOfLines={1}>{eduPointsBalance.toLocaleString()}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate("Search")}>
                <Ionicons name="search-outline" size={22} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate("Notifications")}>
                <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.9)" />
                <View style={styles.notifDot} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.motiveLine}>Keep pushing — success is just ahead! 🚀</Text>

          {/* Quick-nav chips — mirrors web DashboardPage's header chip row
              exactly: Friends / Lv / Weekly / Upcoming (EP moved up to the
              header icons row above). Each chip is flex:1 (equal share of
              the row width) so all 4 always sit on one line on any screen
              size down to ~270px wide — below 400px (chipsCompact) the text
              label drops and only the icon shows, same cutover web uses via
              its `xs:` breakpoint. */}
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={styles.chipTouchable}
              onPress={() => { setLeaderboardSeen(true); growthTriggersRef.current?.openLeaderboard(); }}
              onLongPress={() => setChipTooltip("Friends")}
              onPressOut={() => setChipTooltip(null)}
              delayLongPress={250}
              accessibilityLabel="Friends"
            >
              <LinearGradient colors={["#FDE68A", "#FEF3C7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chip}>
                <View style={styles.chipIconBadge}>
                  <Ionicons name="trophy" size={12} color={semantic.warning.text} />
                  {leaderboardHasUnseen && <View style={styles.chipNotifDot} />}
                </View>
                {!chipsCompact && (
                  <Text style={[styles.chipTxt, { color: semantic.warning.text }]} numberOfLines={1}>Friends</Text>
                )}
              </LinearGradient>
              {chipsCompact && chipTooltip === "Friends" && (
                <View style={styles.chipTooltip}><Text style={styles.chipTooltipTxt}>Friends</Text></View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chipTouchable}
              onPress={() => navigation.navigate("LevelProgress")}
              onLongPress={() => setChipTooltip("Lv")}
              onPressOut={() => setChipTooltip(null)}
              delayLongPress={250}
              accessibilityLabel={`Level ${levelNumber}`}
            >
              <LinearGradient colors={["#DDD6FE", "#EDE9FE"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chip}>
                <View style={styles.chipIconBadge}>
                  <Ionicons name="shield-checkmark" size={12} color="#6D28D9" />
                </View>
                {!chipsCompact && (
                  <Text style={[styles.chipTxt, { color: "#6D28D9" }]} numberOfLines={1}>Lv {levelNumber}</Text>
                )}
              </LinearGradient>
              {chipsCompact && chipTooltip === "Lv" && (
                <View style={styles.chipTooltip}><Text style={styles.chipTooltipTxt}>Lv {levelNumber}</Text></View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chipTouchable}
              onPress={() => navigation.navigate("WeeklyReport")}
              onLongPress={() => setChipTooltip("Weekly")}
              onPressOut={() => setChipTooltip(null)}
              delayLongPress={250}
              accessibilityLabel="Weekly Progress"
            >
              <LinearGradient colors={["#C7D2FE", "#E0E7FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chip}>
                <View style={styles.chipIconBadge}>
                  <Ionicons name="bar-chart" size={12} color={palette.primary700} />
                </View>
                {!chipsCompact && (
                  <Text style={[styles.chipTxt, { color: palette.primary700 }]} numberOfLines={1}>Weekly</Text>
                )}
              </LinearGradient>
              {chipsCompact && chipTooltip === "Weekly" && (
                <View style={styles.chipTooltip}><Text style={styles.chipTooltipTxt}>Weekly</Text></View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chipTouchable}
              onPress={() => navigation.navigate("Roadmap")}
              onLongPress={() => setChipTooltip("Upcoming")}
              onPressOut={() => setChipTooltip(null)}
              delayLongPress={250}
              accessibilityLabel="Upcoming"
            >
              <LinearGradient colors={["#A7F3D0", "#D1FAE5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chip}>
                <View style={styles.chipIconBadge}>
                  <Ionicons name="rocket" size={12} color={semantic.success.text} />
                </View>
                {!chipsCompact && (
                  <Text style={[styles.chipTxt, { color: semantic.success.text }]} numberOfLines={1}>Upcoming</Text>
                )}
              </LinearGradient>
              {chipsCompact && chipTooltip === "Upcoming" && (
                <View style={styles.chipTooltip}><Text style={styles.chipTooltipTxt}>Upcoming</Text></View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.body}>

          {/* Announcements */}
          {announcements.length > 0 && (
            <View style={[styles.section, { marginTop: 4 }]}>
              <View style={styles.sectionRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="megaphone" size={16} color={palette.primary600} />
                  <Text style={styles.sectionTitle}>Announcements</Text>
                  <View style={styles.announceCountPill}>
                    <Text style={styles.announceCountTxt}>{announcements.length}</Text>
                  </View>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {announcements.map((a: any) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.announceCard, { borderLeftColor: ANNOUNCE_COLORS[a.type as string] ?? ANNOUNCE_COLORS.general }]}
                    activeOpacity={0.85}
                    onPress={() => setActiveAnnouncement(a)}
                  >
                    <View style={styles.announceTypeRow}>
                      <View style={[styles.announceDot, { backgroundColor: ANNOUNCE_COLORS[a.type as string] ?? ANNOUNCE_COLORS.general }]} />
                      <Text style={[styles.announceType, { color: ANNOUNCE_COLORS[a.type as string] ?? ANNOUNCE_COLORS.general }]}>
                        {ANNOUNCE_LABELS[a.type as string] ?? "Info"}
                      </Text>
                    </View>
                    <Text style={styles.announceTitle} numberOfLines={2}>{a.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Quick Actions — compact preview of the first 4, "View all" opens the full grid */}
          <View style={styles.section}>
            <View style={styles.qaCard}>
              <View style={styles.qaHeader}>
                <Text style={styles.qaTitle}>Quick Actions</Text>
                <TouchableOpacity onPress={() => setShowAllActions(true)}>
                  <Text style={styles.qaViewAll}>View all</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.qaRow}>
                {QUICK_ACTIONS.slice(0, 4).map((a, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.qaItem}
                    activeOpacity={0.75}
                    onPress={() => handleQuickAction(a.label)}
                  >
                    <View style={[styles.qaIconBadge, { backgroundColor: a.tint }]}>
                      <Ionicons name={a.icon as any} size={26} color="#fff" />
                    </View>
                    <Text style={styles.qaLabel} numberOfLines={2}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Continue Watching — falls back to Recommended/Trending videos when
              there's no watch progress yet, mirroring web DashboardPage.tsx's
              hasProgress / fallbackVids / "Start Watching" behavior exactly */}
          {(() => {
            const hasProgress = cwVideos.length > 0;
            const fallbackVids = recommendedVideos.length > 0 ? recommendedVideos.slice(0, 8) : trendingVideos.slice(0, 8);
            const displayVideos = hasProgress ? cwVideos : fallbackVids;

            if (cwLoading) {
              return (
                <View style={styles.section}>
                  <View style={styles.sectionRow}>
                    <Text style={styles.sectionTitle}>Continue Watching</Text>
                  </View>
                  <ActivityIndicator color={palette.primary600} style={{ marginTop: 16 }} />
                </View>
              );
            }
            if (displayVideos.length === 0) return null;

            return (
              <View style={styles.section}>
                <View style={styles.sectionRow}>
                  <View style={styles.rowCenter}>
                    <Ionicons name="play-circle" size={18} color={hasProgress ? semantic.danger.solid : semantic.info.solid} />
                    <Text style={[styles.sectionTitle, { marginLeft: 6 }]}>
                      {hasProgress ? "Continue Watching" : "Start Watching"}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate("Revision")}>
                    <Text style={styles.seeAll}>See all</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                  {displayVideos.map((v: any, i: number) => {
                    const pct = v.progress ?? 0;
                    const duration = fmtDuration(v.duration_seconds ?? 0);
                    return (
                      <VideoListCard
                        key={v.id ?? v.video_id ?? i}
                        video={v}
                        onPress={() => openVideoPlayer(v)}
                        progress={hasProgress ? pct : undefined}
                        metaExtra={hasProgress ? `${Math.round(pct)}%` : duration || undefined}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            );
          })()}

          {/* Today's Challenge — one admin-published global challenge/day
              (distinct from the personalized 3-slot Today's Goals below);
              null until the admin publishes one, so this simply doesn't
              render on days with nothing published. */}
          {!!dailyChallenge?.challenge && (
            <View style={styles.section}>
              <View style={styles.challengeCard}>
                <View style={styles.challengeCardRow}>
                  <View style={styles.challengeIconWrap}>
                    <Ionicons name="flag" size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.challengeEyebrow}>Today's Challenge</Text>
                    <Text style={styles.challengeTitle} numberOfLines={1}>{dailyChallenge.challenge.title}</Text>
                    <View style={styles.challengeProgressRow}>
                      <View style={styles.challengeProgressTrack}>
                        <View style={[styles.challengeProgressFill, { width: `${Math.min(100, Math.round((dailyChallenge.progress / dailyChallenge.target) * 100))}%` }]} />
                      </View>
                      <Text style={styles.challengeProgressTxt}>{dailyChallenge.progress}/{dailyChallenge.target}</Text>
                    </View>
                  </View>
                  {dailyChallenge.completed && !dailyChallenge.rewarded && (
                    <TouchableOpacity style={styles.challengeClaimBtn} onPress={handleClaimChallenge} disabled={claimingChallenge} activeOpacity={0.85}>
                      <Ionicons name="gift" size={14} color="#fff" />
                      <Text style={styles.challengeClaimTxt}>Claim</Text>
                    </TouchableOpacity>
                  )}
                  {dailyChallenge.rewarded && (
                    <Text style={styles.challengeClaimedTxt}>Claimed ✓</Text>
                  )}
                </View>

                {/* Weekly/monthly challenge completion — informational
                    streak-style counters (bonus-earned flags are backend-
                    computed, not yet tied to an actual reward grant). */}
                {(weeklyChallengeStats || monthlyChallengeStats) && (
                  <View style={styles.challengeStatsRow}>
                    {weeklyChallengeStats && (
                      <Text style={[styles.challengeStatsTxt, weeklyChallengeStats.weekly_bonus_earned && styles.challengeStatsTxtDone]}>
                        This week: <Text style={styles.challengeStatsBold}>{weeklyChallengeStats.completed_this_week}/{weeklyChallengeStats.weekly_target}</Text>
                        {weeklyChallengeStats.weekly_bonus_earned ? " ✓" : ""}
                      </Text>
                    )}
                    {monthlyChallengeStats && (
                      <Text style={[styles.challengeStatsTxt, monthlyChallengeStats.monthly_bonus_earned && styles.challengeStatsTxtDone]}>
                        This month: <Text style={styles.challengeStatsBold}>{monthlyChallengeStats.completed_this_month}/{monthlyChallengeStats.monthly_target}</Text>
                        {monthlyChallengeStats.monthly_bonus_earned ? " ✓" : ""}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Today's Goals + Friends quick-access — one unified row of small
              round icon buttons with a label underneath (matches the web
              dashboard exactly). 3 REAL backend-driven goals (video/quiz/
              ai_doubt — see gamification_service's GoalService),
              personalized per student when the admin has that on — not a
              hardcoded list, plus Friends. Given a solid card background/
              border and a fixed (non-scrolling) centered row — a bare-
              background horizontally-scrollable row of just 4 fixed items
              read as sparse/unfinished, as if items were missing off-screen,
              since nothing ever actually scrolls. The completed-count badge
              in the header reinforces that this is the whole set. Each
              carries a progress ring; Friends carries a real unseen-count
              badge. */}
          {/* Hidden entirely once every slot is complete for today — no
              "all done" placeholder card left behind. Since UserDailyGoal
              rows are scoped to today's date (goal_date), tomorrow's read
              creates a fresh set with progress=0, so the card reappears
              automatically without any client-side date bookkeeping. */}
          <GoalsModal
            visible={showGoalsSheet}
            onClose={() => setShowGoalsSheet(false)}
            title="Today's Goals"
          >
            <View style={styles.qaDonePillRow}>
              <View style={styles.qaDonePill}>
                <Text style={styles.qaDonePillTxt}>
                  {(goalsForBadge ?? []).filter((g) => g.completed).length}/{(goalsForBadge ?? []).length} done
                </Text>
              </View>
            </View>
            <View style={styles.qaFixedRow}>
              {([
                { slot: "video", icon: "play-circle" as const, label: "Videos", from: palette.primary400, to: palette.primary600, ring: palette.primary500 },
                { slot: "quiz", icon: "trophy" as const, label: "Quiz", from: "#FBBF24", to: "#D97706", ring: "#D97706" },
                { slot: "ai_doubt", icon: "sparkles" as const, label: "Ask AI", from: "#A78BFA", to: "#7C3AED", ring: "#7C3AED" },
                { slot: "streak", icon: "flame" as const, label: "Streak", from: "#FB923C", to: "#EF4444", ring: "#EF4444" },
              ]).map(({ slot, icon, label, from, to, ring }) => {
                const g = goalBySlot(slot);
                if (!g) return null;
                const pct = g.target_count > 0 ? Math.min(100, Math.round((g.progress / g.target_count) * 100)) : 0;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={styles.qaItem}
                    activeOpacity={0.75}
                    onPress={() => {
                      setShowGoalsSheet(false);
                      growthTriggersRef.current?.openMission();
                    }}
                  >
                    <ProgressRing color={g.completed ? semantic.success.solid : ring} pct={g.completed ? 100 : pct}>
                      <LinearGradient colors={[from, to]} style={styles.qaIconBadge}>
                        <Ionicons name={g.completed ? "checkmark" : icon} size={22} color="#fff" />
                      </LinearGradient>
                    </ProgressRing>
                    <Text style={styles.qaLabel} numberOfLines={2}>{label}</Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={styles.qaItem}
                activeOpacity={0.75}
                onPress={() => {
                  setShowGoalsSheet(false);
                  setLeaderboardSeen(true);
                  growthTriggersRef.current?.openLeaderboard();
                }}
              >
                <View style={styles.badgeIconWrap}>
                  <View style={[styles.qaIconBadge, { backgroundColor: "#F59E0B" }]}>
                    <Ionicons name="trophy" size={24} color="#fff" />
                  </View>
                  {leaderboardHasUnseen && (
                    <View style={styles.notifCountBadge}>
                      <Text style={styles.notifCountBadgeTxt}>
                        {Math.min(9, friendsLbForBadge?.friend_count ?? 0)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.qaLabel} numberOfLines={2}>Friends</Text>
              </TouchableOpacity>
            </View>
          </GoalsModal>

          {/* Growth Dashboard — Mission / Spin Wheel / Streak / Friends Leaderboard
              (all backend-driven; see components/GrowthDashboard.tsx). On
              phones it renders nothing inline (see isWide inside that file) —
              the buttons above open its popups via onRegisterTriggers. */}
          <View style={styles.section}>
            <GrowthDashboard
              userId={userId}
              onStartQuiz={() => startQuickQuiz()}
              onOpenLearn={() => navigation.navigate("Learn")}
              onViewLeaderboard={() => navigation.navigate("Leaderboard")}
              onRegisterTriggers={(t) => { growthTriggersRef.current = t; }}
            />
          </View>

          {/* Usage Today — proactive daily-quota snapshot, hidden for premium */}
          <View style={styles.section}>
            <UsageTodayCard userId={userId} />
          </View>

          {/* Recommended for You */}
          {recommendedVideos.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>✨ Recommended for You</Text>
                <Text style={styles.seeAll} onPress={() => navigation.navigate("Learn")}>View all</Text>
              </View>
              {recommendedIsPersonalized && (
                <Text style={styles.recommendedSubtitle}>Based on your weak topics</Text>
              )}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {recommendedVideos.map((v: any, i: number) => (
                  <VideoListCard
                    key={v.id ?? i}
                    video={v}
                    onPress={() => openVideoPlayer(v)}
                    badgeText={recommendedIsPersonalized ? "AI PICK" : undefined}
                    badgeColor={palette.primary600}
                    metaExtra={v.watch_count > 0 ? `${v.watch_count} watched` : undefined}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* AI Tutor strip */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate("AITutor")}
            style={styles.aiTutorStrip}
          >
            <View style={[styles.aiTutorStripBg, { backgroundColor: palette.primary600 }]}>
              <View style={styles.aiTutorStripIcon}>
                <Ionicons name="bulb-outline" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.aiTutorStripTitle}>Stuck on something?</Text>
                <Text style={styles.aiTutorStripSub} numberOfLines={1}>
                  Ask the AI Tutor any syllabus question — instant, step-by-step answers.
                </Text>
              </View>
              <View style={styles.aiTutorStripBtn}>
                <Text style={styles.aiTutorStripBtnTxt}>Ask AI</Text>
                <Ionicons name="chevron-forward" size={14} color={palette.primary600} />
              </View>
            </View>
          </TouchableOpacity>

          {/* Trending This Week */}
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>🔥 Trending This Week</Text>
            </View>

            {trendingLoading ? (
              <ActivityIndicator color={palette.primary600} style={{ marginTop: 16 }} />
            ) : trendingVideos.length === 0 ? null : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {trendingVideos.map((v: any, i: number) => (
                  <VideoListCard
                    key={v.id ?? i}
                    video={v}
                    onPress={() => openVideoPlayer(v)}
                    badgeText={String(i + 1)}
                    badgeColor={semantic.warning.solid}
                    metaExtra={v.watch_count > 0 ? `${v.watch_count} watched` : undefined}
                  />
                ))}
              </ScrollView>
            )}
          </View>

          {/* New Uploads */}
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>⚡ New Uploads</Text>
              <Text style={styles.seeAll}>Fresh content</Text>
            </View>

            {recentLoading ? (
              <ActivityIndicator color={palette.primary600} style={{ marginTop: 16 }} />
            ) : recentVideos.length === 0 ? null : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {recentVideos.slice(0, 10).map((v: any, i: number) => (
                  <VideoListCard
                    key={v.id ?? i}
                    video={v}
                    onPress={() => openVideoPlayer(v)}
                    badgeText="NEW"
                    badgeColor={semantic.info.solid}
                  />
                ))}
              </ScrollView>
            )}
          </View>

          {/* My Assignments — real, backend-derived completion; renders nothing if none */}
          <AssignmentsCard studentId={userId} />

          {/* Weak Topics */}
          {weakTopics.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>⚠️ Watch Your Weak Topics</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {weakTopics.slice(0, 5).map((wt: any, i: number) => {
                  const acc = Math.round(wt.accuracy ?? 0);
                  return (
                    <TouchableOpacity
                      key={wt.topic_id ?? i}
                      style={styles.weakTopicCard}
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate("Learn")}
                    >
                      <Text style={styles.weakTopicTitle} numberOfLines={2}>{wt.topic ?? wt.topic_id ?? `Topic ${i + 1}`}</Text>
                      <View style={styles.weakTopicBarTrack}>
                        <View style={[styles.weakTopicBarFill, { width: `${acc}%` as any }]} />
                      </View>
                      <Text style={styles.weakTopicPct}>{acc}% accuracy</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

        </View>
      </ScrollView>

      {/* Daily Reward popup — renders nothing unless the BACKEND says the
          popup should open (should_show_popup on /daily-reward/status, i.e.
          24h+ since the last successful claim). All eligibility, streak and
          countdown values come from the server; no client-side timers. */}
      {!!userId && <DailyRewardPopup userId={userId} />}

      {/* Today's Goals — floating bottom-right button, stacked above the
          Daily Spin FAB's footprint (bottom:24, 62px tall) so the two never
          overlap whether or not the spin FAB is currently visible. Hidden
          entirely once every slot is complete for today — same auto-hide
          gate the old inline card used, so a fully-done day leaves no
          floating button behind either. */}
      {!!goalsForBadge?.length && !goalsForBadge.every((g) => g.completed) && (
        <TouchableOpacity
          style={styles.goalsFabWrap}
          activeOpacity={0.85}
          onPress={() => setShowGoalsSheet(true)}
        >
          <View style={styles.goalsFab}>
            <ProgressRing
              color="#fff"
              pct={Math.round((goalsForBadge.filter((g) => g.completed).length / goalsForBadge.length) * 100)}
              size={40}
              strokeWidth={3}
            >
              <Text style={styles.goalsFabTxt}>
                {goalsForBadge.filter((g) => g.completed).length}/{goalsForBadge.length}
              </Text>
            </ProgressRing>
          </View>
          <Text style={styles.goalsFabLabel}>Goals</Text>
        </TouchableOpacity>
      )}

      {/* Daily Spin — floating bottom-right button, visible ONLY while the
          backend says can_claim; auto-hides after the spin is claimed and
          reappears when the server flips can_claim back on (24h later). */}
      {!!userId && <DailySpinFab userId={userId} />}

      {/* All Quick Actions Modal — declared first so it always renders
          underneath every other quick-action modal below, regardless of
          which specific action is opened from it (Modal stacking follows
          mount/declaration order). */}
      <Modal visible={showAllActions} animationType="slide" onRequestClose={() => setShowAllActions(false)} statusBarTranslucent>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.gray50 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAllActions(false)} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={24} color={palette.gray700} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTxt}>⚡ Quick Actions</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View style={styles.qaGrid}>
              {QUICK_ACTIONS.map((a, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.qaGridItem}
                  activeOpacity={0.8}
                  onPress={() => {
                    // Every action now navigates to a real Stack.Screen, so
                    // this grid always closes first — its own back button
                    // would otherwise sit stranded underneath the pushed screen.
                    setShowAllActions(false);
                    handleQuickAction(a.label);
                  }}
                >
                  <View style={[styles.qaGridIconBadge, { backgroundColor: a.tint }]}>
                    <Ionicons name={a.icon as any} size={24} color="#fff" />
                  </View>
                  <Text style={styles.qaGridLabel} numberOfLines={2}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Announcement detail modal — mirrors web's AnnouncementModal */}
      <Modal visible={activeAnnouncement !== null} transparent animationType="fade" onRequestClose={() => setActiveAnnouncement(null)}>
        <TouchableOpacity style={styles.announceBackdrop} activeOpacity={1} onPress={() => setActiveAnnouncement(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.announceModalCard} onPress={() => {}}>
            {activeAnnouncement && (
              <>
                <View style={[styles.announceModalHeader, { backgroundColor: ANNOUNCE_COLORS[activeAnnouncement.type] ?? ANNOUNCE_COLORS.general }]}>
                  <View style={styles.announceModalIcon}>
                    <Ionicons name="megaphone" size={16} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.announceModalLabel}>{ANNOUNCE_LABELS[activeAnnouncement.type] ?? "Info"}</Text>
                    <Text style={styles.announceModalTitle} numberOfLines={2}>{activeAnnouncement.title}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setActiveAnnouncement(null)} style={styles.announceModalClose}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
                <View style={styles.announceModalBody}>
                  <Text style={styles.announceModalBodyTxt}>{activeAnnouncement.body}</Text>
                  <TouchableOpacity style={styles.announceModalBtn} onPress={() => setActiveAnnouncement(null)}>
                    <Text style={styles.announceModalBtnTxt}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: palette.gray50 },
  header:         { paddingTop: 16, paddingHorizontal: 20, paddingBottom: 32 },
  headerTop:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  greeting:       { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600", letterSpacing: 0.2 },
  userName:       { color: "#fff", fontSize: 19, fontWeight: "800", letterSpacing: -0.3, marginTop: 1 },
  notifBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  notifDot:       { position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: semantic.warning.solid },
  // EP pill — mirrors web's header EP chip (always visible, independent of
  // the Friends/Lv/Weekly/Upcoming row below which needs the space).
  epHeaderPill: {
    flexDirection: "row", alignItems: "center", gap: 4, height: 40, paddingHorizontal: 10,
    borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)",
  },
  epHeaderPillTxt: { color: "#FDE68A", fontSize: 12.5, fontWeight: "800" },
  motiveLine:     { color: "rgba(255,255,255,0.75)", fontSize: 12 },
  body:           { marginTop: -16, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: palette.gray50, paddingTop: 20 },
  section:        { paddingHorizontal: 16, marginBottom: 16 },
  sectionRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle:   { fontSize: 14, fontWeight: "700", color: palette.gray900 },
  seeAll:         { fontSize: 12, fontWeight: "600", color: palette.primary600 },
  rowCenter:      { flexDirection: "row", alignItems: "center" },

  // Today's Challenge — single admin-published global challenge card
  challengeCard: {
    borderRadius: 18, padding: 14,
    backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A",
  },
  challengeCardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  challengeStatsRow: { flexDirection: "row", gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#FDE68A" },
  challengeStatsTxt: { fontSize: 11.5, fontWeight: "500", color: palette.gray500 },
  challengeStatsTxtDone: { color: semantic.success.solid },
  challengeStatsBold: { fontWeight: "800" },
  challengeIconWrap: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: semantic.warning.solid,
    alignItems: "center", justifyContent: "center",
  },
  challengeEyebrow: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5, color: "#B45309", textTransform: "uppercase" },
  challengeTitle:   { fontSize: 13.5, fontWeight: "700", color: palette.gray900, marginTop: 1 },
  challengeProgressRow:   { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  challengeProgressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "#FEF3C7", overflow: "hidden", maxWidth: 140 },
  challengeProgressFill:  { height: "100%", borderRadius: 3, backgroundColor: semantic.warning.solid },
  challengeProgressTxt:   { fontSize: 11, fontWeight: "600", color: palette.gray500 },
  challengeClaimBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: semantic.warning.solid,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  challengeClaimTxt:   { color: "#fff", fontWeight: "800", fontSize: 12 },
  challengeClaimedTxt: { fontSize: 12, fontWeight: "700", color: semantic.success.solid },

  // Quick Actions / Daily Goals — unified dark gradient card, 4-item preview row
  qaCard: {
    borderRadius: 22, paddingHorizontal: 18, paddingVertical: 14,
    backgroundColor: "#fff", borderWidth: 1, borderColor: palette.gray100,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  qaHeader:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  qaTitle:        { fontSize: 15, fontWeight: "800", color: palette.gray900 },
  qaViewAll:      { fontSize: 12, fontWeight: "600", color: palette.primary600 },
  qaRow:          { flexDirection: "row", justifyContent: "space-between" },
  qaDonePill:     { backgroundColor: palette.primary50, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  qaDonePillTxt:  { fontSize: 11.5, fontWeight: "800", color: palette.primary600 },
  qaDonePillRow:  { flexDirection: "row", justifyContent: "flex-end", marginBottom: 14 },
  qaFixedRow:     { flexDirection: "row", justifyContent: "space-around" },

  // Floating "Today's Goals" button — same fabWrap/fab shape as
  // DailySpinFab.tsx, stacked directly above its footprint (bottom:24,
  // 62px tall + 12px gap = 98) so the two float independently without
  // overlapping regardless of which one is currently visible. Tapping it
  // opens the full 4-item breakdown (same content, same styles.qa* below)
  // inside a Modal — replaces the old always-expanded qaCard row that used
  // to sit inline right under Quick Actions.
  goalsFabWrap: {
    position: "absolute",
    right: 18,
    bottom: 88,
    zIndex: 40,
    alignItems: "center",
    gap: 3,
    ...cardShadowElevated,
  },
  goalsFab: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    backgroundColor: semantic.success.solid,
  },
  goalsFabTxt:   { fontSize: 10, fontWeight: "800", color: "#fff" },
  goalsFabLabel: { fontSize: 10.5, fontWeight: "800", color: palette.gray700 },
  qaItem:         { width: 72, alignItems: "center", gap: 8 },
  qaIconBadge:    { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  qaLabel:        { fontSize: 11, fontWeight: "700", textAlign: "center", color: palette.gray700, lineHeight: 14 },
  qaXpPill:       { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: -2 },
  qaXpTxt:        { color: "#fff", fontSize: 10, fontWeight: "800" },

  // Mission/Friends notification-badge buttons (round icon + red count badge)
  badgeIconWrap:  { position: "relative" },
  notifCountBadge: {
    position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  notifCountBadgeTxt: { color: "#fff", fontSize: 10, fontWeight: "800" },

  // Daily Goals progress ring

  // Daily Goals progress ring

  // "View all" Quick Actions modal grid
  qaGrid:          { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  qaGridItem:      { flexBasis: "28%", flexGrow: 1, maxWidth: "31.5%", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 16, paddingVertical: 16, borderWidth: 1, borderColor: palette.gray100, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  qaGridIconBadge: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  qaGridLabel:     { fontSize: 11.5, fontWeight: "700", textAlign: "center", color: palette.gray700 },

  // Shared horizontal list-row video card (Continue/Start Watching, Recommended,
  // Trending, New Uploads all use this one pattern via <VideoListCard/>)
  vRowCard:       { width: 250, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 16, padding: 10, borderWidth: 1, borderColor: palette.gray100, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  vRowIconWrap:   { position: "relative" },
  vRowIconBox:    { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: palette.primary50 },
  vRowPlayOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center" },
  vRowBadge:      { position: "absolute", top: -6, left: -6, maxWidth: 60, backgroundColor: semantic.warning.solid, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  vRowBadgeTxt:   { color: "#fff", fontSize: 9, fontWeight: "800" },
  vRowBody:       { flex: 1, minWidth: 0, gap: 4 },
  vRowCompletionRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  vRowCompletionTxt: { fontSize: 10.5, fontWeight: "700", color: palette.primary600 },
  vRowTitle:      { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  vRowSubject:    { fontSize: 11, color: palette.gray500 },
  vRowBarTrack:   { height: 4, borderRadius: 2, backgroundColor: palette.primary50, overflow: "hidden", marginTop: 2 },
  vRowBarFill:    { height: "100%", borderRadius: 2, backgroundColor: palette.primary600 },

  // Continue Watching empty state
  cwEmpty:        { alignItems: "center", justifyContent: "center", paddingVertical: 32, gap: 8 },
  cwEmptyTitle:   { fontSize: 14, fontWeight: "700", color: palette.gray500 },
  cwEmptyDesc:    { fontSize: 12, color: palette.gray400, textAlign: "center", lineHeight: 17 },

  // Weak Topics cards
  weakTopicCard:      { width: 160, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: semantic.danger.bg, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  weakTopicTitle:     { fontSize: 12, fontWeight: "700", color: palette.gray900, marginBottom: 10, lineHeight: 16, minHeight: 32 },
  weakTopicBarTrack:  { height: 6, borderRadius: 3, backgroundColor: semantic.danger.bg, overflow: "hidden", marginBottom: 6 },
  weakTopicBarFill:   { height: "100%", borderRadius: 3, backgroundColor: semantic.danger.solid },
  weakTopicPct:       { fontSize: 11, fontWeight: "700", color: semantic.danger.solid },

  // AI Tutor promotional strip
  aiTutorStrip:       { marginHorizontal: 16, marginBottom: 24, borderRadius: 18, overflow: "hidden" },
  aiTutorStripBg:     { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  aiTutorStripIcon:   { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  aiTutorStripTitle:  { color: "#fff", fontSize: 14, fontWeight: "800" },
  aiTutorStripSub:    { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  aiTutorStripBtn:    { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  aiTutorStripBtnTxt: { color: palette.primary600, fontSize: 13, fontWeight: "700" },

  // Recommended for You
  recommendedSubtitle:{ fontSize: 11, color: palette.gray400, marginTop: -6, marginBottom: 10 },

  // Quick-nav chip row (header) — wraps onto additional lines on narrow
  // screens instead of clipping/hiding chips off-screen.
  // Single line, always — chips are sized compactly enough (small icon/text/
  // padding) that all 4 reliably fit side by side on any phone width without
  // wrapping, clipping, or needing to scroll.
  chipRow:      { flexDirection: "row", gap: 6, paddingTop: 12 },
  chipTouchable:{ flex: 1, position: "relative" },
  chip:         {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    borderRadius: 11, paddingHorizontal: 6, paddingVertical: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  chipIconBadge: {
    width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.7)", position: "relative",
  },
  chipTxt:      { fontSize: 10.5, fontWeight: "700" },
  chipNotifDot: {
    position: "absolute", top: -2, right: -3, width: 6, height: 6, borderRadius: 3,
    backgroundColor: "#EF4444",
  },
  // Long-press label tooltip for icon-only (compact) chips — touch
  // equivalent of web's mouse-hover `title` attribute.
  chipTooltip: {
    position: "absolute", bottom: "100%", left: "50%", marginLeft: -30, marginBottom: 6,
    width: 60, backgroundColor: "rgba(17,24,39,0.95)", borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 4, alignItems: "center", zIndex: 10, elevation: 6,
  },
  chipTooltipTxt: { color: "#fff", fontSize: 10, fontWeight: "700", textAlign: "center" },

  // Announcements
  announceCountPill: { backgroundColor: palette.primary50, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1.5 },
  announceCountTxt:  { fontSize: 10, fontWeight: "800", color: palette.primary600 },
  announceCard:      { width: 158, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: palette.gray100, borderLeftWidth: 3, padding: 9, elevation: 1, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  announceTypeRow:   { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  announceDot:       { width: 5, height: 5, borderRadius: 2.5 },
  announceType:      { fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  announceTitle:     { fontSize: 11, fontWeight: "700", color: palette.gray900, lineHeight: 14 },

  // Announcement detail modal
  announceBackdrop:    { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 },
  announceModalCard:   { width: "100%", maxWidth: 380, backgroundColor: "#fff", borderRadius: 20, overflow: "hidden" },
  announceModalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 16 },
  announceModalIcon:   { width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  announceModalLabel:  { color: "rgba(255,255,255,0.8)", fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  announceModalTitle:  { color: "#fff", fontSize: 14, fontWeight: "800", marginTop: 2 },
  announceModalClose:  { width: 26, height: 26, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  announceModalBody:    { padding: 16, gap: 14 },
  announceModalBodyTxt: { fontSize: 13, color: palette.gray600, lineHeight: 20 },
  announceModalBtn:     { backgroundColor: palette.gray100, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  announceModalBtnTxt:  { fontSize: 13, fontWeight: "700", color: palette.gray700 },

  // Modal header (still used by the All Quick Actions modal)
  modalHeader:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.gray100, backgroundColor: "#fff" },
  modalHeaderTxt: { fontSize: 16, fontWeight: "700", color: palette.gray800 },
});
