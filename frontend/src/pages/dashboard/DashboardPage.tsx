import { useRef, useState } from "react";
import OnboardingTour from "@/components/ui/OnboardingTour";
import { Alert } from "@/components/ui";
import Modal from "@/components/ui/Modal";
import AnnouncementBanner from "@/components/announcements/AnnouncementBanner";
import MissionCard from "@/components/growth/MissionCard";
import CircularProgressRing from "@/components/ui/CircularProgressRing";
import AssignmentsCard from "@/components/content/AssignmentsCard";
import DailySpinFab from "@/components/growth/DailySpinFab";
import FriendsLeaderboard from "@/components/growth/FriendsLeaderboard";
import UsageTodayCard from "@/components/growth/UsageTodayCard";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { analyticsApi, gamificationApi, contentApi, api } from "@/lib/api";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Brain, Target, ChevronRight,
  ChevronLeft, Rocket, BarChart2, Play, PlayCircle, Sparkles,
  ShieldCheck, Flame, Clock, AlertTriangle, Zap, Trophy, GraduationCap,
  Swords, Gift,
} from "lucide-react";

// ── Backend contract for the round-button row's live badges (mirrors
//    MissionCard.tsx's DailyGoal — kept minimal since the buttons only need
//    slot/progress/completed; full detail renders inside the popup via
//    MissionCard) ──
interface DailyGoalSummary {
  slot: "video" | "quiz" | "ai_doubt" | "streak";
  title: string;
  progress: number;
  target_count: number;
  completed: boolean;
  xp_reward: number;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface FeedVideo {
  id: string; title: string; youtube_id: string; thumbnail_url: string | null;
  duration_seconds: number; subject: string | null; chapter: string | null;
  class_num: number | null; board: string | null; watch_count: number;
}

const SUBJECT_GRADIENT: Record<string, string> = {
  Physics: "from-blue-400 to-indigo-500", Mathematics: "from-purple-400 to-pink-500",
  Chemistry: "from-green-400 to-teal-500", Biology: "from-emerald-400 to-green-600",
  Science: "from-cyan-400 to-blue-500", "Social Science": "from-amber-400 to-orange-500",
};

function fmtDuration(s: number) {
  if (!s) return "";
  const m = Math.floor(s / 60), sec = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

const thumb = (v: FeedVideo) =>
  v.thumbnail_url || (v.youtube_id ? `https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg` : "");

const subjectLabel = (s?: string | null) =>
  !s ? "Lesson" : /math/i.test(s) ? "Maths" : /social/i.test(s) ? "SST" : s;

// ── Video card ────────────────────────────────────────────────────────────────
function VideoCard({ v, rank, badge, progress }: { v: FeedVideo; rank?: number; badge?: string; progress?: number }) {
  const navigate = useNavigate();
  const grad = SUBJECT_GRADIENT[v.subject ?? ""] ?? "from-gray-400 to-gray-600";
  const img = thumb(v);
  const hasProgress = progress !== undefined && progress > 0;
  return (
    <button
      onClick={() => navigate(`/learn/video/${v.id}`)}
      className="group relative w-44 sm:w-52 lg:w-64 xl:w-72 2xl:w-80 flex-shrink-0 text-left snap-start"
    >
      <div className="relative aspect-video rounded-xl lg:rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 shadow-sm group-hover:shadow-xl transition-all group-hover:-translate-y-1 ring-1 ring-black/5 dark:ring-white/5">
        {img ? (
          <img src={img} alt={v.title} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center`}>
            <PlayCircle className="w-8 h-8 lg:w-12 lg:h-12 text-white/90" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all">
            <Play className="w-4 h-4 lg:w-6 lg:h-6 text-gray-900 ml-0.5" fill="currentColor" />
          </div>
        </div>
        {rank !== undefined && (
          <span className="absolute -left-1 bottom-0 text-5xl lg:text-7xl font-black text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)] leading-none">{rank}</span>
        )}
        {badge && (
          <span className="absolute top-2 left-2 text-[9px] lg:text-[11px] font-bold uppercase tracking-wide bg-primary-600 text-white px-1.5 lg:px-2 py-0.5 rounded">{badge}</span>
        )}
        {v.duration_seconds > 0 && (
          <span className={`absolute ${hasProgress ? "bottom-3" : "bottom-2"} right-2 text-[10px] lg:text-xs font-semibold bg-black/75 text-white px-1.5 py-0.5 rounded flex items-center gap-1`}>
            <Clock className="w-2.5 h-2.5 lg:w-3 lg:h-3" /> {fmtDuration(v.duration_seconds)}
          </span>
        )}
        {/* Netflix-style progress bar */}
        {hasProgress && (
          <div className="absolute bottom-0 inset-x-0">
            <div className="h-1 bg-white/20">
              <div className="h-full bg-red-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm lg:text-base font-semibold text-gray-900 dark:text-white line-clamp-2 leading-tight group-hover:text-primary-600 dark:group-hover:text-primary-400">{v.title}</p>
      <p className="text-xs lg:text-sm text-gray-400 mt-0.5">
        {[subjectLabel(v.subject), v.watch_count > 0 ? `${v.watch_count.toLocaleString()} watched` : null].filter(Boolean).join(" · ")}
        {hasProgress ? ` · ${progress}%` : ""}
      </p>
    </button>
  );
}

// ── Horizontal scroll row ─────────────────────────────────────────────────────
function VideoRow({ title, icon: Icon, accent, subtitle, videos, numbered, badge, viewAll }: {
  title: string; icon: React.ElementType; accent: string; subtitle?: string;
  videos: FeedVideo[]; numbered?: boolean; badge?: string; viewAll?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  if (!videos.length) return null;
  const scroll = (dir: 1 | -1) =>
    ref.current?.scrollBy({ left: dir * Math.max(320, ref.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-5 h-5 flex-shrink-0 ${accent}`} />
          <h2 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg truncate">{title}</h2>
          {subtitle && <span className="text-xs text-gray-400 hidden sm:inline">· {subtitle}</span>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {viewAll && (
            <Link to={viewAll} className="text-xs text-primary-600 dark:text-primary-400 hover:underline mr-1">View all</Link>
          )}
          <button onClick={() => scroll(-1)} className="hidden sm:flex w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 items-center justify-center text-gray-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => scroll(1)} className="hidden sm:flex w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 items-center justify-center text-gray-500">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div ref={ref} className="flex gap-3 xl:gap-4 overflow-x-auto no-scrollbar pb-2 snap-x scroll-pl-1">
        {videos.map((v, i) => <VideoCard key={v.id + title} v={v} rank={numbered ? i + 1 : undefined} badge={badge} />)}
      </div>
    </section>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const cwScrollRef = useRef<HTMLDivElement>(null);

  const analyticsQuery = useQuery({
    queryKey: ["analytics", user?.id],
    queryFn: () => analyticsApi.dashboard(user!.id).then((r) => r.data),
    enabled: !!user?.id,
  });
  const { data: analytics } = analyticsQuery;
  const gamificationQuery = useQuery({
    queryKey: ["gamification", user?.id],
    queryFn: () => gamificationApi.profile(user!.id).then((r) => r.data),
    enabled: !!user?.id,
  });
  const { data: gamification } = gamificationQuery;
  const { data: edupoints } = useQuery({
    queryKey: ["edupoints-balance", user?.id],
    queryFn: () => gamificationApi.eduPointsBalance(user!.id).then((r) => r.data),
    enabled: !!user?.id,
  });
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => api.get(`/v1/users/profile/${user!.id}`).then((r) => r.data),
    enabled: !!user?.id,
  });
  const continueQuery = useQuery({
    queryKey: ["continue-watching", user?.id],
    queryFn: () => contentApi.continueWatching(user!.id, 12).then((r) => r.data),
    enabled: !!user?.id,
  });
  const { data: continueData } = continueQuery;
  const { data: streakData } = useQuery({
    queryKey: ["streak", user?.id],
    queryFn: () => gamificationApi.streak(user!.id).then((r) => r.data),
    enabled: !!user?.id,
  });

  // Same query key as MissionCard.tsx's internal useQuery — React Query
  // dedupes this into a single request/cache entry, so the round buttons'
  // live progress and the popup's full MissionCard never disagree or
  // double-fetch. v2: up to 3 goals (one per slot: video/quiz/ai_doubt).
  const { data: goalsSummary } = useQuery<DailyGoalSummary[]>({
    queryKey: ["today-goal", user?.id],
    queryFn: () => gamificationApi.todayGoal(user!.id).then((r) => r.data ?? []),
    enabled: !!user?.id,
  });
  const { data: friendsLbSummary } = useQuery({
    queryKey: ["friends-leaderboard", user?.id],
    queryFn: () => gamificationApi.friendsLeaderboard(user!.id).then((r) => r.data),
    enabled: !!user?.id,
  });
  // Single admin-published Daily Challenge — distinct from the 3-slot Today's
  // Goals above (which are per-student, auto-assigned); this is one global
  // challenge everyone sees, null if the admin hasn't published one today.
  const { data: dailyChallenge, refetch: refetchDailyChallenge } = useQuery({
    queryKey: ["today-challenge", user?.id],
    queryFn: () => gamificationApi.todayChallenge(user!.id).then((r) => r.data),
    enabled: !!user?.id,
  });
  const { data: weeklyChallengeStats } = useQuery({
    queryKey: ["weekly-challenge-stats", user?.id],
    queryFn: () => gamificationApi.weeklyChallengeStats(user!.id).then((r) => r.data),
    enabled: !!user?.id,
  });
  const { data: monthlyChallengeStats } = useQuery({
    queryKey: ["monthly-challenge-stats", user?.id],
    queryFn: () => gamificationApi.monthlyChallengeStats(user!.id).then((r) => r.data),
    enabled: !!user?.id,
  });
  const [showMissionModal, setShowMissionModal] = useState(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  // Session-only "seen" flag — clears the badge dot the moment the user
  // opens the Mission popup; reappears if a fresh unseen signal shows up
  // later (a slot resets next day), since it's derived from live query data
  // each render rather than a one-time dismissal flag. One shared flag for
  // all 3 slots — opening the popup shows (and thus "sees") all of them.
  const [leaderboardSeen, setLeaderboardSeen] = useState(false);
  const leaderboardHasUnseen = !!friendsLbSummary && friendsLbSummary.friend_count > 0 && !leaderboardSeen;
  const goalBySlot = (slot: DailyGoalSummary["slot"]) => goalsSummary?.find((g) => g.slot === slot);

  const [claimingChallenge, setClaimingChallenge] = useState(false);
  const handleClaimChallenge = async () => {
    if (!user?.id || !dailyChallenge?.challenge?.id || claimingChallenge) return;
    setClaimingChallenge(true);
    try {
      await gamificationApi.claimChallengeReward(user.id, dailyChallenge.challenge.id);
      await refetchDailyChallenge();
    } finally {
      setClaimingChallenge(false);
    }
  };

  // A dashboard failure banner, not a per-widget one: this page renders 10+
  // independent queries as separate cards/sections, so an isError check on
  // every single one would be noisy without adding real clarity. Instead,
  // surface one unobtrusive banner (with a single retry-everything action)
  // when any of the primary, most-visible sections fails to load — replacing
  // the previous behavior where a failed fetch just rendered as an empty
  // section with no indication anything went wrong.
  const criticalQueriesFailed = analyticsQuery.isError || gamificationQuery.isError || continueQuery.isError;
  const retryFailedQueries = () => {
    analyticsQuery.refetch();
    gamificationQuery.refetch();
    continueQuery.refetch();
  };

  // No auto-seeding — show real data only; empty Continue Watching shows feed content

  const classNum = Number(profile?.class_number) || undefined;
  const board = profile?.board || undefined;

  const { data: recent } = useQuery({
    queryKey: ["feed-recent"],
    queryFn: () => contentApi.videoFeed({ sort: "recent", limit: 24 }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: popular } = useQuery({
    queryKey: ["feed-popular"],
    queryFn: () => contentApi.videoFeed({ sort: "popular", limit: 24 }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: recommendedData } = useQuery({
    queryKey: ["feed-recommended"],
    queryFn: () => contentApi.recommendedVideos(14).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: classFeed } = useQuery({
    queryKey: ["feed-class", classNum, board],
    queryFn: () => contentApi.videoFeed({ class_num: classNum, board, sort: "popular", limit: 24 }).then((r) => r.data),
    enabled: !!classNum,
    staleTime: 5 * 60 * 1000,
  });

  const recentVids: FeedVideo[]  = recent?.videos ?? [];
  const popularVids: FeedVideo[] = popular?.videos ?? [];
  const classVids: FeedVideo[]   = classFeed?.videos ?? [];

  // Real in-progress videos (from video_progress), most-recent first
  const continueWatching: (FeedVideo & { progress: number })[] =
    (continueData?.videos ?? []).map((v: any) => ({ ...v, progress: Math.round(v.progress ?? 0) }));

  const weakTopics = analytics?.weak_topics ?? [];
  const weakSubject = weakTopics[0]?.subject as string | undefined;
  // Real, backend-personalized recommendations (weak-topic-driven via
  // analytics_service) — falls back to popular server-side when the
  // student has no quiz signal yet, so no client-side heuristic needed here.
  const recommended: FeedVideo[] = recommendedData?.videos ?? [];
  const recommendedIsPersonalized: boolean = !!recommendedData?.personalized;

  const totalXP = gamification?.xp?.total_xp ?? 0;
  const level = Math.floor(totalXP / 500) + 1;
  const videosWatched = analytics?.total_videos_watched ?? null;
  const chaptersInProgress = analytics?.chapters_in_progress ?? null;
  const currentStreak = streakData?.current_streak ?? streakData?.streak ?? null;
  const displayName = user?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "Student";
  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? t("goodMorning") : h < 17 ? t("goodAfternoon") : t("goodEvening");
  };

  // flex-1 + justify-center: below `xs` every chip is icon-only, so an equal
  // flex share centers each icon in its slot instead of clumping them left;
  // at `xs`+ the label reappears and the row reads left-aligned as before.
  // Soft-gradient card treatment: a subtle diagonal tint + hairline ring +
  // shadow (instead of flat solid bg) plus a small white icon-badge inside,
  // for a layered "premium edtech" feel instead of a flat pill.
  const chip = "flex-1 xs:flex-initial flex items-center justify-center xs:justify-start gap-1.5 xs:gap-2 text-xs px-2 xs:px-3 py-1.5 rounded-xl font-semibold shadow-sm ring-1 ring-black/[0.04] dark:ring-white/5 active:scale-95 transition-all";
  const chipIconBadge = "flex items-center justify-center w-6 h-6 rounded-full bg-white/70 dark:bg-black/20 shadow-sm flex-shrink-0";

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <OnboardingTour />
      {criticalQueriesFailed && (
        <Alert variant="danger" title="Some dashboard data couldn't load">
          <button onClick={retryFailedQueries} className="underline font-semibold">Retry</button>
        </Alert>
      )}
      {/* Floating Daily Spin — server-driven: rendered only while can_claim is true */}
      <DailySpinFab userId={user?.id} />

      {/* ── Greeting + chips ──
          Stacks vertically below xs (400px) so the greeting text never
          fights the chip row for space; the chip row itself always stays
          exactly 4 items on ONE line down to a 270px viewport — each chip
          is flex-1 (equal share of the row) and drops its text label below
          xs, showing only the icon, so 4 icon-chips + gaps always fit even
          at the narrowest supported width. */}
      <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-3 xs:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight">
            {greeting()}, <span className="capitalize text-primary-600 dark:text-primary-400">{displayName}</span>{" "}
            <span className="inline-block animate-wave">👋</span>
          </h1>
          <p className="text-sm font-medium text-gray-400 dark:text-gray-500 mt-1 tracking-wide">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-1 xs:gap-1.5">
          {/* EduPoints moved into the header (always-visible chip there now)
              — Friends takes its old slot here, in an always-fixed position
              independent of whether Announcements is showing. */}
          <button
            onClick={() => { setLeaderboardSeen(true); setShowLeaderboardModal(true); }}
            title="Friends"
            className={`relative ${chip} bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-900/10 text-amber-700 dark:text-amber-400 hover:from-amber-200 dark:hover:from-amber-900/60`}
          >
            <span className={chipIconBadge}><Trophy className="w-3.5 h-3.5" /></span> <span className="hidden xs:inline truncate">Friends</span>
            {leaderboardHasUnseen && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900 flex items-center justify-center text-[9px] font-bold text-white">
                {Math.min(9, friendsLbSummary?.friend_count ?? 0)}
              </span>
            )}
          </button>
          <Link to="/level" title={`Level ${level}`} className={`${chip} bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900/40 dark:to-primary-900/10 text-primary-700 dark:text-primary-400 hover:from-primary-200 dark:hover:from-primary-900/60`}>
            <span className={chipIconBadge}><ShieldCheck className="w-3.5 h-3.5" /></span> <span className="hidden xs:inline truncate">Lv {level}</span>
          </Link>
          <Link to="/analytics/weekly" title="Weekly Progress" className={`${chip} bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/40 dark:to-indigo-900/10 text-indigo-700 dark:text-indigo-400 hover:from-indigo-200 dark:hover:from-indigo-900/60`}>
            <span className={chipIconBadge}><BarChart2 className="w-3.5 h-3.5" /></span> <span className="hidden xs:inline truncate">Weekly</span>
          </Link>
          <Link to="/roadmap" title="Upcoming" className={`${chip} bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-900/10 text-emerald-700 dark:text-emerald-400 hover:from-emerald-200 dark:hover:from-emerald-900/60`}>
            <span className={chipIconBadge}><Rocket className="w-3.5 h-3.5" /></span> <span className="hidden xs:inline truncate">Upcoming</span>
          </Link>
        </div>
      </div>

      {/* ── Announcements ── */}
      <AnnouncementBanner />

      {/* ── Admin-assigned work, if any (hidden when there are none) ── */}
      <AssignmentsCard studentId={user?.id} />

      {/* ── 2-column at xl: left feed | right sticky panel ── */}
      <div className="xl:flex xl:gap-8 xl:items-start">

        {/* ════ LEFT: main feed ════ */}
        <div className="flex-1 min-w-0 space-y-7">

          {/* Today's Goals — mobile / tablet only (right panel shows the
              full MissionCard at xl+). 3 REAL backend-driven goals (video/
              quiz/ai_doubt — see gamification_service's GoalService),
              personalized per student when the admin has that on — not a
              hardcoded list. Wrapped in its own card (instead of floating
              buttons on the bare page background) so 3 items reads as one
              deliberately-sized complete widget rather than a sparse/
              unfinished row — the completed-count in the header reinforces
              that "3" is the whole set, not a partial one. Each is a round
              icon button with a progress ring that opens the same Mission
              popup. Friends moved into the header's chip row — see the
              greeting section above — so its position stays fixed
              regardless of whether Announcements is showing. */}
          {/* Hidden entirely once every slot is complete for today — no
              "all done" placeholder card left behind. Since UserDailyGoal
              rows are scoped to today's date (goal_date), tomorrow's read
              creates a fresh set with progress=0, so the card reappears
              automatically without any client-side date bookkeeping. */}
          {goalsSummary && goalsSummary.length > 0 && !goalsSummary.every((g) => g.completed) && (
            <div className="xl:hidden rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary-500" /> {t("todaysGoals")}
                </h3>
                <span className="text-xs font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-full px-2.5 py-1">
                  {goalsSummary.filter((g) => g.completed).length}/{goalsSummary.length} done
                </span>
              </div>
              <div className="flex items-center justify-center xs:justify-start gap-6 xs:gap-8">
                {([
                  { slot: "video" as const, icon: PlayCircle, label: "Videos", from: "from-primary-400", to: "to-primary-600" },
                  { slot: "quiz" as const, icon: Trophy, label: "Quiz", from: "from-amber-400", to: "to-amber-600" },
                  { slot: "ai_doubt" as const, icon: Brain, label: "Ask AI", from: "from-violet-400", to: "to-violet-600" },
                  { slot: "streak" as const, icon: Flame, label: "Streak", from: "from-orange-400", to: "to-red-500" },
                ]).map(({ slot, icon: Icon, label, from, to }) => {
                  const g = goalBySlot(slot);
                  if (!g) return null;
                  const pct = g.target_count > 0 ? Math.min(100, Math.round((g.progress / g.target_count) * 100)) : 0;
                  return (
                    <button
                      key={slot}
                      onClick={() => setShowMissionModal(true)}
                      className="flex-shrink-0 flex flex-col items-center gap-1.5 group"
                    >
                      <CircularProgressRing pct={g.completed ? 100 : pct} completed={g.completed} size={56} strokeWidth={3}>
                        <span className={`flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-br ${from} ${to} shadow-md ring-1 ring-black/5 group-hover:shadow-lg group-active:scale-95 transition-all`}>
                          {g.completed ? (
                            <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.6 3.6 6.7-6.7a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
                          ) : (
                            <Icon className="w-5 h-5 text-white" />
                          )}
                        </span>
                      </CircularProgressRing>
                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Today's Challenge — one admin-published global challenge/day
              (distinct from the personalized 3-slot Today's Goals above);
              null until the admin publishes one, so this simply doesn't
              render on days with nothing published. */}
          {dailyChallenge?.challenge && (
            <div className="rounded-2xl border border-amber-100 dark:border-amber-900/40 bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/10 dark:to-gray-900 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-amber-500 shadow-md flex-shrink-0">
                  <Swords className="w-5 h-5 text-white" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">Today's Challenge</p>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{dailyChallenge.challenge.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 overflow-hidden max-w-[160px]">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${Math.min(100, Math.round((dailyChallenge.progress / dailyChallenge.target) * 100))}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums">
                      {dailyChallenge.progress}/{dailyChallenge.target}
                    </span>
                  </div>
                </div>
                {dailyChallenge.completed && !dailyChallenge.rewarded && (
                  <button
                    onClick={handleClaimChallenge}
                    disabled={claimingChallenge}
                    className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    <Gift className="w-3.5 h-3.5" /> Claim
                  </button>
                )}
                {dailyChallenge.rewarded && (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex-shrink-0">Claimed ✓</span>
                )}
              </div>

              {/* Weekly/monthly challenge completion — informational streak-style
                  counters (5/week, 20/month "bonus earned" flags are backend-
                  computed, not yet tied to an actual reward grant). */}
              {(weeklyChallengeStats || monthlyChallengeStats) && (
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-amber-100 dark:border-amber-900/30 text-xs">
                  {weeklyChallengeStats && (
                    <span className={`flex items-center gap-1 font-medium ${weeklyChallengeStats.weekly_bonus_earned ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}`}>
                      This week: <span className="font-bold">{weeklyChallengeStats.completed_this_week}/{weeklyChallengeStats.weekly_target}</span>
                      {weeklyChallengeStats.weekly_bonus_earned && " ✓"}
                    </span>
                  )}
                  {monthlyChallengeStats && (
                    <span className={`flex items-center gap-1 font-medium ${monthlyChallengeStats.monthly_bonus_earned ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}`}>
                      This month: <span className="font-bold">{monthlyChallengeStats.completed_this_month}/{monthlyChallengeStats.monthly_target}</span>
                      {monthlyChallengeStats.monthly_bonus_earned && " ✓"}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Continue Watching ── Netflix-style horizontal scroll ── */}
          {(() => {
            const hasProgress = continueWatching.length > 0;
            const fallbackVids = recommended.length > 0 ? recommended.slice(0, 8) : popularVids.slice(0, 8);
            const displayVideos = hasProgress ? continueWatching : fallbackVids;
            if (!displayVideos.length) return null;
            const scroll = (dir: 1 | -1) =>
              cwScrollRef.current?.scrollBy({ left: dir * Math.max(320, cwScrollRef.current.clientWidth * 0.8), behavior: "smooth" });
            return (
              <section>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <PlayCircle className={`w-5 h-5 flex-shrink-0 ${hasProgress ? "text-red-500" : "text-blue-500"}`} />
                    <h2 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg truncate">
                      {hasProgress ? t("continueWatching") : "Start Watching"}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Link to="/revision"
                      className="text-xs text-primary-600 dark:text-primary-400 hover:underline mr-1">
                      See all
                    </Link>
                    <button onClick={() => scroll(-1)} className="hidden sm:flex w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 items-center justify-center text-gray-500">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => scroll(1)} className="hidden sm:flex w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 items-center justify-center text-gray-500">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div ref={cwScrollRef} className="flex gap-3 xl:gap-4 overflow-x-auto no-scrollbar pb-2 snap-x scroll-pl-1">
                  {hasProgress
                    ? continueWatching.map((v) => <VideoCard key={v.id + "cw"} v={v} progress={v.progress} />)
                    : fallbackVids.map((v) => <VideoCard key={v.id + "cw"} v={v} />)}
                </div>
              </section>
            );
          })()}

          {showMissionModal && (
            <Modal title="Today's Mission" onClose={() => setShowMissionModal(false)} size="sm">
              <MissionCard userId={user?.id} />
            </Modal>
          )}
          {showLeaderboardModal && (
            <Modal title="Friends Leaderboard" onClose={() => setShowLeaderboardModal(false)} size="sm">
              <FriendsLeaderboard userId={user?.id} />
            </Modal>
          )}

          {/* ── Recommended ── */}
          <VideoRow title="Recommended for You" icon={Sparkles} accent="text-primary-500"
            subtitle={recommendedIsPersonalized ? "Based on your weak topics" : "Popular picks"}
            badge={recommendedIsPersonalized ? "AI Pick" : undefined}
            videos={recommended} viewAll="/learn" />

          {/* ── AI Tutor strip ── */}
          <div className="rounded-2xl bg-primary-600 p-4 sm:p-5 text-white flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">Stuck on something?</p>
                <p className="text-primary-100 text-xs mt-0.5 line-clamp-1">
                  {weakSubject ? `Ask the AI Tutor for help with ${weakSubject}, or any chapter.` : "Ask the AI Tutor any syllabus question — instant, step-by-step answers."}
                </p>
              </div>
            </div>
            <Link to="/ai-assistant" className="flex items-center justify-center gap-1.5 bg-white text-primary-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-primary-50 transition-colors flex-shrink-0 sm:self-auto">
              Ask AI <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {/* ── Trending ── */}
          {(() => {
            const trendingVids = popularVids.filter((v) => v.watch_count > 0);
            return (
              <VideoRow title="Trending This Week" icon={Flame} accent="text-orange-500"
                subtitle="Most watched by students"
                videos={trendingVids.length > 0 ? trendingVids : popularVids}
                numbered viewAll="/learn" />
            );
          })()}

          {/* ── New Uploads ── */}
          <VideoRow title="New Uploads" icon={Zap} accent="text-blue-500"
            subtitle="Fresh content" videos={recentVids} badge="New" viewAll="/learn" />

          {/* ── Weak Topics ── */}
          {weakTopics.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2.5">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h2 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg">Watch Your Weak Topics</h2>
                <span className="text-xs text-gray-400 hidden sm:inline">· Boost your lowest scores</span>
              </div>
              <div className="flex gap-3 xl:gap-4 overflow-x-auto no-scrollbar pb-2">
                {weakTopics.slice(0, 8).map((wt: any, i: number) => (
                  <button key={wt.topic_id ?? i} onClick={() => navigate("/learn")}
                    className="w-44 lg:w-56 xl:w-64 flex-shrink-0 card !p-4 lg:!p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all border-2 border-transparent hover:border-red-200 dark:hover:border-red-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                        <Target className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        {(wt.accuracy ?? 0).toFixed?.(0) ?? wt.accuracy ?? 0}%
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">{wt.topic ?? wt.subject ?? `Weak Topic ${i + 1}`}</p>
                    <p className="text-xs text-primary-600 dark:text-primary-400 font-medium mt-2 flex items-center gap-1">
                      <Play className="w-3 h-3" /> Practice now
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Popular in Class ── */}
          {classNum && (
            <VideoRow title={`Popular in Class ${classNum}${board ? ` — ${board}` : ""}`} icon={GraduationCap}
              accent="text-teal-500" subtitle="What your classmates watch"
              videos={(classVids.length ? classVids : popularVids)} viewAll="/learn" />
          )}

          {/* ── Exam Prep ── */}
          <VideoRow title="Exam Prep" icon={Trophy} accent="text-amber-500"
            subtitle="High-yield revision" videos={(classVids.length ? classVids : recentVids).slice().reverse()} viewAll="/pyps" />

          {/* ── CTA ── */}
          <div className="rounded-2xl bg-primary-600 p-4 sm:p-6 text-white flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2"><Sparkles className="w-5 h-5 text-yellow-300 flex-shrink-0" /> Keep learning today!</h3>
              <p className="text-primary-200 text-sm mt-0.5">Pick up where you left off or explore something new.</p>
            </div>
            <div className="flex flex-wrap gap-3 w-full md:w-auto md:flex-shrink-0">
              <Link to="/learn" className="px-5 py-2 bg-white text-primary-700 font-semibold text-sm rounded-xl hover:bg-primary-50 transition-colors text-center flex-1 md:flex-initial">Continue Learning</Link>
              <Link to="/analytics/weekly" className="px-5 py-2 bg-primary-500 text-white font-semibold text-sm rounded-xl hover:bg-primary-400 transition-colors flex items-center justify-center gap-2 flex-1 md:flex-initial">
                <BarChart2 className="w-4 h-4" /> View Progress
              </Link>
            </div>
          </div>

        </div>{/* end left col */}

        {/* ════ RIGHT: sticky sidebar (xl+) ════ */}
        <aside className="hidden xl:flex flex-col w-72 2xl:w-80 flex-shrink-0 sticky top-6 space-y-4 self-start">

          {/* Today's Mission — compact, backend-driven, all 3 real goals
              (video/quiz/ai_doubt) in one card. The old separate static
              "Today's Goals" vertical list was removed — it duplicated this
              exact information with a hardcoded, non-personalized copy. */}
          <MissionCard userId={user?.id} compact />

          {/* Friends Leaderboard */}
          <FriendsLeaderboard userId={user?.id} />

          {/* Usage Today — proactive daily-quota snapshot, hidden for premium */}
          <UsageTodayCard userId={user?.id} />

          {/* Mini stats */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" /> Your Progress
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Total XP</span>
                <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" /> {totalXP.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Level</span>
                <span className="text-sm font-bold text-primary-600 dark:text-primary-400">Lv {level}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">EduPoints</span>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{(edupoints?.balance ?? 0).toLocaleString()} EP</span>
              </div>
              {videosWatched !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Videos Watched</span>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{videosWatched.toLocaleString()}</span>
                </div>
              )}
              {currentStreak !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Day Streak</span>
                  <span className="text-sm font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" /> {currentStreak}d
                  </span>
                </div>
              )}
              {chaptersInProgress !== null && chaptersInProgress > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Chapters Active</span>
                  <span className="text-sm font-bold text-teal-600 dark:text-teal-400">{chaptersInProgress}</span>
                </div>
              )}
            </div>
            <Link to="/analytics"
              className="mt-4 flex items-center justify-center gap-1.5 w-full text-xs font-semibold py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-300 hover:text-primary-600 dark:hover:border-primary-600 dark:hover:text-primary-400 transition-colors">
              <BarChart2 className="w-3.5 h-3.5" /> Full Analytics
            </Link>
          </div>

        </aside>

      </div>{/* end 2-col */}
    </div>
  );
}
