import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi, gamificationApi, battleApi, contentApi } from "@/lib/api";
import { useAppSelector } from "@/store";
import {
  ArrowLeft, PlayCircle, CheckCircle, Target, Trophy,
  Swords, BookOpen, TrendingUp, AlertTriangle, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Legend, Cell, PieChart, Pie,
} from "recharts";
import { Card, Tabs } from "@/components/ui";

const PIE_COLORS = ["#4F46E5", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6"];

const TABS = ["Overview", "Battles", "Progress", "Badges"] as const;
type Tab = typeof TABS[number];

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: React.ReactNode; icon: any; color: string }) {
  return (
    <Card className="flex flex-col items-center gap-1.5 text-center p-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + "22" }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</p>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</p>
    </Card>
  );
}


// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ dash: dashData, gam: gamData }: { dash: any; gam: any }) {
  const totalXp     = gamData?.xp?.total_xp    ?? gamData?.total_xp    ?? 0;
  const level       = gamData?.xp?.level        ?? gamData?.level       ?? 0;
  const xpToNext    = gamData?.xp?.xp_to_next_level ?? 500;
  const streak      = gamData?.streak?.current  ?? gamData?.streak      ?? 0;
  const longest     = gamData?.streak?.longest  ?? 0;
  const ep          = gamData?.edupoints?.balance ?? 0;
  const progressPct = gamData?.xp?.progress_percent ?? Math.round(((totalXp % xpToNext) / xpToNext) * 100);

  const videos    = dashData?.total_videos_watched    ?? 0;
  const quizzes   = dashData?.total_quizzes_completed ?? 0;
  const avgScore  = Math.round(dashData?.avg_quiz_score ?? 0);
  const chapters  = dashData?.chapters_in_progress ?? 0;
  const weakTopics: { topic_id: string; accuracy: number; attempts: number }[] = dashData?.weak_topics ?? [];

  const radarData = [
    { subject: "Videos",  A: Math.min(100, videos * 5) },
    { subject: "Quizzes", A: Math.min(100, quizzes * 7) },
    { subject: "Score",   A: avgScore },
    { subject: "Streak",  A: Math.min(100, streak * 14) },
    { subject: "Level",   A: Math.min(100, level * 10) },
  ];

  return (
    <div className="space-y-5">
      {/* XP / Level hero */}
      <div className="bg-primary-600 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-white/60 font-semibold uppercase tracking-wide">Current Level</p>
            <p className="text-4xl font-extrabold">Lv {level}</p>
            <p className="text-white/70 text-xs mt-0.5">{totalXp.toLocaleString()} XP total</p>
          </div>
          <div className="text-right">
            <div className="bg-white/15 border border-white/20 rounded-full px-3 py-1.5 text-xs font-bold">
              ⚡ {ep.toLocaleString()} EP
            </div>
            <p className="text-white/60 text-[10px] mt-1.5">🔥 {streak}-day streak (longest: {longest}d)</p>
          </div>
        </div>
        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="text-white/60 text-[10px] mt-1.5">{xpToNext - (totalXp % xpToNext)} XP to Level {level + 1}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Videos Watched"    value={videos}          icon={PlayCircle}   color="#4F46E5" />
        <StatCard label="Quizzes Completed" value={quizzes}         icon={CheckCircle}  color="#22c55e" />
        <StatCard label="Avg Quiz Score"    value={`${avgScore}%`}  icon={Target}       color="#f59e0b" />
        <StatCard label="Chapters Active"   value={chapters}        icon={BookOpen}     color="#14b8a6" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Engagement radar */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Learning Engagement</h3>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#f1f5f9" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
              <Radar dataKey="A" stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.25} name="Score" />
              <Legend iconType="circle" iconSize={8} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>

        {/* Weak topics */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-danger-400" /> Needs Improvement
          </h3>
          {weakTopics.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">No weak topics — great performance!</p>
          ) : (
            <div className="space-y-3">
              {weakTopics.slice(0, 5).map((t, i) => (
                <div key={t.topic_id}>
                  <div className="flex justify-between text-xs mb-1">
                    {/* analytics_service's WeakTopicItem only stores a raw
                        topic_id (uuid), never a name — showing the id
                        itself is unreadable, so fall back to a neutral
                        ordinal label until a real content_service lookup
                        enriches this with the topic's actual title. */}
                    <span className="text-gray-600 dark:text-gray-400 font-medium truncate max-w-[65%]">Topic {i + 1}</span>
                    <span className={`font-bold ${t.accuracy < 40 ? "text-danger-500" : "text-warning-600 dark:text-warning-400"}`}>
                      {Math.round(t.accuracy)}%
                    </span>
                  </div>
                  <ProgressBar value={t.accuracy} max={100} color={t.accuracy < 40 ? "#ef4444" : "#f59e0b"} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Week in Review */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Week in Review</h3>
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Videos",    value: videos,         max: 20,  color: "#4F46E5", suffix: "" },
            { label: "Quizzes",   value: quizzes,        max: 15,  color: "#22c55e", suffix: "" },
            { label: "Accuracy",  value: avgScore,       max: 100, color: "#f59e0b", suffix: "%" },
            { label: "XP",        value: Math.min(totalXp, 1000), max: 1000, color: "#14b8a6", suffix: "" },
          ].map(({ label, value, max, color, suffix }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1.5">{value}{suffix}</p>
              <ProgressBar value={value} max={max} color={color} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Battles Tab ──────────────────────────────────────────────────────────────

function BattlesTab({ userId }: { userId: string }) {
  const { data: statsRaw, isLoading } = useQuery({
    queryKey: ["battle-stats", userId],
    queryFn: () => battleApi.stats(userId).then((r) => r.data),
    enabled: !!userId,
    retry: 0,
  });

  const { data: histRaw } = useQuery({
    queryKey: ["battle-history", userId],
    queryFn: () => battleApi.history(userId).then((r) => r.data),
    enabled: !!userId,
    retry: 0,
  });

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary-500" /></div>;

  const stats = statsRaw ?? {};
  const wins    = stats.wins    ?? 0;
  const losses  = stats.losses  ?? 0;
  const draws   = stats.draws   ?? 0;
  const total   = stats.total_battles ?? (wins + losses + draws);
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const history: any[] = Array.isArray(histRaw) ? histRaw
    : Array.isArray(histRaw?.battles) ? histRaw.battles
    : [];

  const resultDist = [
    { name: "Wins",   value: wins,   fill: "#22c55e" },
    { name: "Losses", value: losses, fill: "#ef4444" },
    { name: "Draws",  value: draws,  fill: "#9ca3af" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Battles" value={total}         icon={Swords}    color="#4F46E5" />
        <StatCard label="Wins"          value={wins}          icon={Trophy}    color="#22c55e" />
        <StatCard label="Losses"        value={losses}        icon={Target}    color="#ef4444" />
        <StatCard label="Win Rate"      value={`${winRate}%`} icon={TrendingUp} color="#f59e0b" />
      </div>

      {total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Battle Results</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={resultDist} cx="50%" cy="50%" outerRadius={75} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {resultDist.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Win Rate Progress</h3>
            <div className="mt-6">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                <span>Win rate</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">{winRate}%</span>
              </div>
              <ProgressBar value={winRate} max={100} color="#22c55e" />
              <div className="grid grid-cols-3 gap-3 mt-5 text-center">
                <div>
                  <p className="text-xl font-bold text-success-600 dark:text-success-400">{wins}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Wins</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-400 dark:text-gray-500">{draws}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Draws</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-danger-500 dark:text-danger-400">{losses}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Losses</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {history.length > 0 && (
        <Card noPadding>
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent Battles</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {history.slice(0, 10).map((b: any, i: number) => (
              <div key={i} className="px-5 py-3 flex items-center gap-4">
                <Swords className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{b.subject ?? b.topic ?? "Battle"}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{b.battle_type ?? b.mode ?? "—"}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${
                  b.result === "win" ? "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-300" :
                  b.result === "loss" ? "bg-danger-50 text-danger-600 dark:bg-danger-900/30 dark:text-danger-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                }`}>{b.result ?? "—"}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {total === 0 && history.length === 0 && (
        <Card className="p-10 text-center">
          <Swords className="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-gray-700" />
          <p className="font-semibold text-gray-500 dark:text-gray-400">No battles yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start a battle to track your performance here</p>
          <Link to="/battle" className="mt-4 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            Start a Battle
          </Link>
        </Card>
      )}
    </div>
  );
}

// ─── Progress Tab ─────────────────────────────────────────────────────────────

function ProgressTab({ userId }: { userId: string }) {
  const { data: progressRaw, isLoading: progressLoading } = useQuery({
    queryKey: ["student-progress-full", userId],
    queryFn: () => analyticsApi.studentProgress(userId).then((r) => r.data),
    enabled: !!userId,
    retry: 0,
  });

  // Real per-subject avg_score/quizzes_completed come from analytics_service
  // keyed by subject_id; resolve display names from the student's own
  // profile-driven catalog (contentApi.myCatalog) rather than duplicating
  // subject metadata in analytics_service.
  const { data: catalogRaw, isLoading: catalogLoading } = useQuery({
    queryKey: ["my-catalog-for-analytics", userId],
    queryFn: () => contentApi.myCatalog().then((r) => r.data),
    enabled: !!userId,
    retry: 0,
    staleTime: 5 * 60_000,
  });

  if (progressLoading || catalogLoading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary-500" /></div>;

  const subjectNameById: Record<string, string> = {};
  for (const s of catalogRaw?.subjects ?? []) subjectNameById[s.id] = s.name;

  // Only show subjects that resolve to a name in the student's current
  // board/class catalog. A subject_id with quiz history but no catalog match
  // is stale data from a prior board/class (e.g. after a profile change) —
  // showing it unnamed would be more confusing than omitting it.
  const subjects: { subject_id: string; avg_score: number; quizzes_completed: number }[] =
    (progressRaw?.subjects ?? []).filter((s: { subject_id: string }) => subjectNameById[s.subject_id]);

  return (
    <div className="space-y-4">
      {subjects.length === 0 ? (
        <Card className="p-10 text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-gray-700" />
          <p className="font-semibold text-gray-500 dark:text-gray-400">No subject progress yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Complete quizzes to see subject-wise breakdown</p>
        </Card>
      ) : (
        <>
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Subject-wise Quiz Average</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={subjects.map((s) => ({
                name: subjectNameById[s.subject_id] ?? "Unknown subject",
                score: Math.round(s.avg_score),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v: number) => [`${v}%`, "Avg score"]} />
                <Bar dataKey="score" fill="#4F46E5" radius={[4, 4, 0, 0]} name="Avg score %" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {subjects.map((s, i) => (
            <Card key={s.subject_id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{subjectNameById[s.subject_id] ?? "Unknown subject"}</p>
                <span className="text-sm font-bold" style={{ color: PIE_COLORS[i % PIE_COLORS.length] }}>
                  {Math.round(s.avg_score)}%
                </span>
              </div>
              <ProgressBar value={s.avg_score} max={100} color={PIE_COLORS[i % PIE_COLORS.length]} />
              <div className="grid grid-cols-2 gap-3 mt-3 text-center">
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{s.quizzes_completed}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Quizzes</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{Math.round(s.avg_score)}%</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Avg Score</p>
                </div>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Badges Tab ───────────────────────────────────────────────────────────────

const BADGE_INFO: Record<string, { emoji: string; label: string; desc: string }> = {
  first_login:    { emoji: "🎉", label: "First Login",    desc: "Welcome to EduLearn!" },
  quiz_master:    { emoji: "🧠", label: "Quiz Master",    desc: "Completed 10+ quizzes" },
  streak_7:       { emoji: "🔥", label: "7-Day Streak",   desc: "Studied 7 days in a row" },
  streak_30:      { emoji: "🚀", label: "30-Day Streak",  desc: "30 days of dedication" },
  top_scorer:     { emoji: "🏆", label: "Top Scorer",     desc: "Scored 90%+ in a quiz" },
  battle_winner:  { emoji: "⚔️",  label: "Battle Winner",  desc: "Won your first battle" },
  video_star:     { emoji: "🎬", label: "Video Star",     desc: "Watched 20+ videos" },
};

function BadgesTab({ gam }: { gam: any }) {
  const userBadges: { type: string; earned_at: string }[] = gam?.badges ?? [];
  const earnedTypes = new Set(userBadges.map((b) => b.type));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-3">
        {Object.entries(BADGE_INFO).map(([key, info]) => {
          const earned = earnedTypes.has(key);
          const earnedAt = userBadges.find((b) => b.type === key)?.earned_at;
          return (
            <Card key={key} className={`text-center transition-all ${
              earned ? "border-primary-100 dark:border-primary-800" : "opacity-50"
            }`}>
              <p className="text-3xl mb-2">{info.emoji}</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{info.label}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{info.desc}</p>
              {earned && earnedAt && (
                <p className="text-[11px] text-primary-500 dark:text-primary-400 font-semibold mt-1.5">
                  Earned {new Date(earnedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </p>
              )}
              {!earned && <p className="text-[11px] text-gray-300 dark:text-gray-600 font-semibold mt-1.5">Locked</p>}
            </Card>
          );
        })}
      </div>

      {userBadges.length === 0 && (
        <Card className="p-8 text-center">
          <Trophy className="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-gray-700" />
          <p className="font-semibold text-gray-500 dark:text-gray-400">No badges yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Complete activities to unlock your first badge</p>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsDashboardPage() {
  const userId = useAppSelector((s) => s.auth.user?.id);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ["analytics-dashboard", userId],
    queryFn: () => analyticsApi.dashboard(userId!).then((r) => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const { data: gamData, isLoading: gamLoading } = useQuery({
    queryKey: ["gam-profile", userId],
    queryFn: () => gamificationApi.profile(userId!).then((r) => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const loading = dashLoading || gamLoading;

  return (
    <div className="w-full pb-8 space-y-4 animate-fade-in">
      {/* Back nav */}
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors font-medium">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Analytics</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Track every aspect of your learning journey</p>
        </div>
        <Link to="/analytics/weekly" className="text-xs text-primary-600 dark:text-primary-400 font-semibold hover:underline">
          Weekly Report →
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
          {/* Tabs */}
          <Tabs
            tabs={TABS.map((tab) => ({ key: tab, label: tab }))}
            active={activeTab}
            onChange={(key) => setActiveTab(key as Tab)}
            className="overflow-x-auto"
          />

          {activeTab === "Overview"  && <OverviewTab  dash={dashData} gam={gamData} />}
          {activeTab === "Battles"   && <BattlesTab   userId={userId!} />}
          {activeTab === "Progress"  && <ProgressTab  userId={userId!} />}
          {activeTab === "Badges"    && <BadgesTab     gam={gamData} />}
        </>
      )}
    </div>
  );
}
