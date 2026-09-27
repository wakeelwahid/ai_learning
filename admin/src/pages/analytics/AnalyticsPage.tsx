import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi, battleApi, quizApi, referralApi, paymentApi } from "@/lib/api";
import StatsCard from "@/components/ui/StatsCard";
import { Card } from "@/components/ui";
import {
  TrendingUp, Target, BookOpen, AlertTriangle, RefreshCw,
  DollarSign, Users, Activity, Zap, Swords, BarChart2, Trophy,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Legend, PieChart, Pie, Cell,
} from "recharts";

// Single indigo-led categorical palette for charts (pies/bars with multiple
// series) — semantic colors (success/warning/danger/info) reused in that
// fixed order rather than ad-hoc decorative hues.
const PIE_COLORS = ["#4f46e5", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6"];

// StatsCard icon-tile colors: every icon tile uses the same neutral tile
// (see NEUTRAL_TILE) except where the number itself is a genuine semantic
// signal (revenue = success, failures = danger).
const NEUTRAL_TILE = "bg-primary-600";

const TABS = ["Overview", "Revenue", "Engagement", "Battles", "Quizzes"] as const;
type Tab = typeof TABS[number];

function fmt(n: number | undefined | null, prefix = "") {
  if (n == null) return "—";
  return `${prefix}${n.toLocaleString()}`;
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-gray-300 dark:text-gray-600 gap-2">
      <BarChart2 className="w-8 h-8" />
      <p className="text-xs">{label}</p>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ overview, isLoading }: { overview: any; isLoading: boolean }) {
  const { data: dailyData } = useQuery({
    queryKey: ["admin-daily-active"],
    queryFn: () => analyticsApi.adminDailyActive(7).then((r) => r.data),
    retry: 0,
  });

  const trend: { date: string; students: number }[] = dailyData?.trend ?? [];

  // Feature radar derived from real overview ratios
  const total = Math.max(
    (overview?.total_videos_watched ?? 0) +
    (overview?.total_quizzes_completed ?? 0) +
    1,
    1,
  );
  const featureRadar = [
    { subject: "Videos",   A: Math.min(100, Math.round(((overview?.total_videos_watched ?? 0) / total) * 120)) },
    { subject: "Quizzes",  A: Math.min(100, Math.round(((overview?.total_quizzes_completed ?? 0) / total) * 120)) },
    { subject: "Students", A: Math.min(100, Math.round(((overview?.total_active_students ?? 0) / 500) * 100)) },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatsCard label="Active Students"    value={isLoading ? "…" : fmt(overview?.total_active_students)}    icon={Target}    color={NEUTRAL_TILE} />
        <StatsCard label="Videos Watched"     value={isLoading ? "…" : fmt(overview?.total_videos_watched)}     icon={BookOpen}  color={NEUTRAL_TILE} />
        <StatsCard label="Quizzes Completed"  value={isLoading ? "…" : fmt(overview?.total_quizzes_completed)}  icon={AlertTriangle} color={NEUTRAL_TILE} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Daily Active Students (last 7 days)</h3>
          {trend.length === 0 ? (
            <EmptyChart label="Activity data collecting — updates as students use the platform" />
          ) : (
            <ResponsiveContainer width="100%" minHeight={200} height={220}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="students" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 4 }} name="Students" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Feature Engagement</h3>
          <ResponsiveContainer width="100%" minHeight={200} height={220}>
            <RadarChart data={featureRadar}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar dataKey="A" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.25} name="Usage %" />
              <Legend iconType="circle" iconSize={8} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-gray-400 dark:text-gray-500" /> Platform-Wide Topic Accuracy
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Not available at the platform level yet — accuracy per topic is only aggregated per-student (see a student's own Progress tab). A cross-student topic-accuracy rollup would need a new aggregation query against weak_topic_analysis.
        </p>
      </Card>
    </div>
  );
}

// ─── Revenue Tab ──────────────────────────────────────────────────────────────

function RevenueTab() {
  const { data: revenue, isLoading, isError } = useQuery({
    queryKey: ["admin-revenue"],
    queryFn: () => analyticsApi.adminRevenue().then((r) => r.data),
    retry: 1,
  });

  const { data: dailyRevenue } = useQuery({
    queryKey: ["admin-daily-revenue"],
    queryFn: () => paymentApi.adminDailyRevenue(14).then((r) => r.data),
    retry: 0,
  });
  const dailyTrend: { date: string; revenue_paise: number }[] = dailyRevenue?.trend ?? [];

  if (isLoading) return <div className="py-20 text-center text-gray-400 dark:text-gray-500 text-sm">Loading revenue data…</div>;

  // Real fields from payment_service's captured-payment sums (see
  // payment_crud.get_revenue_stats) — amounts are in paise (₹1 = 100 paise).
  const totalRevenue      = (revenue?.total_revenue_paise ?? 0) / 100;
  const todayRevenue      = (revenue?.today_revenue_paise ?? 0) / 100;
  const newSubsToday      = revenue?.new_subscriptions_today ?? 0;
  const cancellationsToday = revenue?.cancellations_today ?? 0;
  const successfulPayments = revenue?.successful_payments ?? 0;
  const failedPayments    = revenue?.failed_payments ?? 0;
  const refunds           = revenue?.refunds ?? 0;

  if (isError) {
    return (
      <Card className="p-10 text-center text-gray-500 dark:text-gray-400 text-sm">
        <DollarSign className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
        <p className="font-medium text-gray-700 dark:text-gray-300">Revenue data unavailable</p>
        <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">Could not reach payment_service. Try refreshing.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Total Revenue (all-time)" value={`₹${totalRevenue.toLocaleString()}`} icon={DollarSign} color="bg-success-600" />
        <StatsCard label="Revenue Today"            value={`₹${todayRevenue.toLocaleString()}`} icon={TrendingUp} color={NEUTRAL_TILE} />
        <StatsCard label="Successful Payments"      value={fmt(successfulPayments)}              icon={Users}      color={NEUTRAL_TILE} />
        <StatsCard label="Failed / Refunded"        value={`${fmt(failedPayments)} / ${fmt(refunds)}`} icon={Activity} color="bg-danger-600" />
      </div>

      <Card>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Daily Revenue Trend (last 14 days)</h3>
        {dailyTrend.length === 0 || dailyTrend.every((d) => d.revenue_paise === 0) ? (
          <EmptyChart label="No captured payments in this range yet" />
        ) : (
          <ResponsiveContainer width="100%" minHeight={200} height={220}>
            <BarChart data={dailyTrend.map((d) => ({ date: d.date, revenue: d.revenue_paise / 100 }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
              <Tooltip formatter={(v: number) => [`₹${v.toLocaleString()}`, "Revenue"]} />
              <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Today's Subscription Activity</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">New subscriptions today</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{newSubsToday}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Cancellations today</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{cancellationsToday}</span>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Trial Conversions</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {revenue?.trial_conversions_note ?? "No trial tracking exists on this platform yet."}
          </p>
        </Card>
      </div>
    </div>
  );
}

// ─── Engagement Tab ───────────────────────────────────────────────────────────

const ENGAGEMENT_DAYS_OPTIONS = [7, 30, 90] as const;

function EngagementTab() {
  const [days, setDays] = useState<7 | 30 | 90>(7);

  const { data: engagement, isLoading } = useQuery({
    queryKey: ["admin-engagement-trends", days],
    queryFn: () => analyticsApi.adminEngagementTrends(days).then((r) => r.data),
    retry: 1,
  });

  const { data: dailyData } = useQuery({
    queryKey: ["admin-daily-active", days],
    queryFn: () => analyticsApi.adminDailyActive(days).then((r) => r.data),
    retry: 0,
  });

  // Real fields: daily_active_users, weekly_active_users, trend — all from
  // StudentProgress.updated_at. avg_session_minutes is always null (no
  // session-duration tracking exists on this platform). There is no MAU
  // (monthly active users) computation anywhere — not shown rather than faked.
  const dau = engagement?.daily_active_users ?? 0;
  const wau = engagement?.weekly_active_users ?? 0;
  const avgSession = engagement?.avg_session_minutes ?? null;
  const trend: { date: string; students: number }[] = dailyData?.trend ?? engagement?.trend ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-1.5 flex-wrap">
        {ENGAGEMENT_DAYS_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`btn btn-sm ${days === d ? "btn-primary" : "btn-secondary"}`}
          >
            {d}d
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatsCard label="DAU"         value={isLoading ? "…" : fmt(dau)}                      icon={Users}      color={NEUTRAL_TILE} />
        <StatsCard label="WAU (7-day)" value={isLoading ? "…" : fmt(wau)}                      icon={Zap}        color={NEUTRAL_TILE} />
        <StatsCard label="Avg Session" value={isLoading ? "…" : "N/A"} icon={TrendingUp} color={NEUTRAL_TILE} />
      </div>
      {avgSession == null && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {engagement?.avg_session_minutes_note ?? "Session duration is not tracked on this platform yet."}
        </p>
      )}

      <Card>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Daily Active Users (last {days} days)</h3>
        {trend.length === 0 ? (
          <EmptyChart label="Activity data collecting — updates daily as students use the platform" />
        ) : (
          <ResponsiveContainer width="100%" minHeight={200} height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="students" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3 }} name="Active Users" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Today's Activity</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Per-day video/quiz completion counts aren't tracked — StudentProgress stores lifetime running totals per chapter, not a daily event log. See total lifetime counts on the Overview tab instead.
          </p>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Session Quality</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Avg session length</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">N/A</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Daily / Weekly ratio</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {wau > 0 ? `${((dau / wau) * 100).toFixed(0)}%` : "—"}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Battles Tab ──────────────────────────────────────────────────────────────

function BattlesTab() {
  const { data: statsRaw, isLoading } = useQuery({
    queryKey: ["admin-battle-stats"],
    queryFn: () => battleApi.adminStats().then((r) => r.data),
    retry: 1,
  });

  const { data: leaderboard = [] } = useQuery({
    queryKey: ["battle-leaderboard"],
    queryFn: () => battleApi.leaderboard().then((r) => {
      const d = r.data;
      if (Array.isArray(d)) return d;
      if (Array.isArray(d?.leaderboard)) return d.leaderboard;
      return [];
    }),
    retry: 1,
  });

  // Real field names from battle_service's BattleStatus enum: waiting,
  // starting, active, completed, cancelled, abandoned (see
  // BattleService.get_admin_stats — analytics_service delegates to this).
  const totalBattles  = statsRaw?.total ?? 0;
  const byStatusMap: Record<string, number> = statsRaw?.by_status ?? {};
  const byTypeMap:   Record<string, number> = statsRaw?.by_type   ?? {};

  const activeBattles = (byStatusMap["active"] ?? 0) + (byStatusMap["waiting"] ?? 0) + (byStatusMap["starting"] ?? 0);
  const doneBattles   = statsRaw?.completed_battles ?? byStatusMap["completed"] ?? 0;
  const avgDurationMin = statsRaw?.avg_duration_sec != null ? Math.round(statsRaw.avg_duration_sec / 60) : null;
  const totalXpExchanged = statsRaw?.total_xp_exchanged ?? 0;
  const winLoss = statsRaw?.win_loss ?? { battles_played: 0, battles_won: 0, battles_lost: 0 };
  const winRate = winLoss.battles_played > 0 ? Math.round((winLoss.battles_won / winLoss.battles_played) * 100) : 0;

  const typeData   = Object.entries(byTypeMap).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  const statusData = Object.entries(byStatusMap).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Total Battles"     value={isLoading ? "…" : fmt(totalBattles)}    icon={Swords}    color={NEUTRAL_TILE} />
        <StatsCard label="Active / Live"     value={isLoading ? "…" : fmt(activeBattles)}   icon={Activity}  color="bg-success-600" />
        <StatsCard label="Completed"         value={isLoading ? "…" : fmt(doneBattles)}     icon={Target}    color={NEUTRAL_TILE} />
        <StatsCard label="Avg Duration"      value={isLoading ? "…" : (avgDurationMin != null ? `${avgDurationMin} min` : "—")} icon={TrendingUp} color="bg-warning-600" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatsCard label="Total XP Exchanged" value={isLoading ? "…" : fmt(totalXpExchanged)} icon={Zap}       color={NEUTRAL_TILE} />
        <StatsCard label="Total Participants" value={isLoading ? "…" : fmt(statsRaw?.total_participants ?? 0)} icon={Users} color={NEUTRAL_TILE} />
        <StatsCard label="Overall Win Rate"   value={isLoading ? "…" : `${winRate}%`}         icon={Trophy}    color={NEUTRAL_TILE} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Battles by Type</h3>
          {typeData.length === 0 ? (
            <EmptyChart label="No battles yet" />
          ) : (
            <ResponsiveContainer width="100%" minHeight={200} height={220}>
              <PieChart>
                <Pie data={typeData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Battles by Status</h3>
          {statusData.length === 0 ? (
            <EmptyChart label="No battle status data" />
          ) : (
            <ResponsiveContainer width="100%" minHeight={200} height={220}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#4f46e5" name="Count" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {leaderboard.length > 0 && (
        <Card noPadding className="overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Global Battle Leaderboard (Top {Math.min(leaderboard.length, 10)})</h3>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {leaderboard.slice(0, 10).map((entry: any, i: number) => (
              <div key={i} className="px-5 py-3 flex items-center gap-4">
                <span className={`text-sm font-bold w-6 ${i < 3 ? "text-primary-600 dark:text-primary-400" : "text-gray-400 dark:text-gray-500"}`}>#{i + 1}</span>
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 font-medium truncate">{entry.user_id ?? entry.student_id ?? "—"}</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{entry.wins ?? entry.score ?? 0} wins</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Quizzes Tab ──────────────────────────────────────────────────────────────

function QuizzesTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-quiz-stats"],
    queryFn: () => quizApi.adminStats().then((r) => r.data),
    retry: 1,
  });

  const { data: quizzes = [] } = useQuery<any[]>({
    queryKey: ["admin-quizzes", ""],
    queryFn: () => quizApi.adminList({}).then((r) => r.data),
    retry: 1,
  });

  const byType: Record<string, number> = {};
  quizzes.forEach((q) => { byType[q.quiz_type] = (byType[q.quiz_type] ?? 0) + 1; });
  const typeData = Object.entries(byType).map(([name, value]) => ({
    name: name.replace("_", " "),
    value,
  }));

  const premiumCount = quizzes.filter((q) => q.is_premium).length;
  const freeCount = quizzes.length - premiumCount;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Total Quizzes"    value={isLoading ? "…" : fmt(stats?.total_quizzes)}   icon={BookOpen}    color={NEUTRAL_TILE} />
        <StatsCard label="Chapter Quizzes"  value={isLoading ? "…" : fmt(stats?.chapter_quizzes)} icon={Target}      color={NEUTRAL_TILE} />
        <StatsCard label="Mock Tests"       value={isLoading ? "…" : fmt(stats?.mock_tests)}       icon={Swords}      color={NEUTRAL_TILE} />
        <StatsCard label="Total Questions"  value={isLoading ? "…" : fmt(stats?.total_questions)}  icon={BarChart2}   color={NEUTRAL_TILE} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Quizzes by Type</h3>
          {typeData.length === 0 ? (
            <EmptyChart label="No quizzes created yet" />
          ) : (
            <ResponsiveContainer width="100%" minHeight={200} height={220}>
              <PieChart>
                <Pie data={typeData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Premium vs Free</h3>
          {quizzes.length === 0 ? (
            <EmptyChart label="No quizzes yet" />
          ) : (
            <ResponsiveContainer width="100%" minHeight={200} height={220}>
              <PieChart>
                <Pie
                  data={[{ name: "Free", value: freeCount }, { name: "Premium", value: premiumCount }]}
                  cx="50%" cy="50%" outerRadius={80} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  <Cell fill="#4f46e5" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Quiz Type Breakdown</h3>
        {typeData.length === 0 ? (
          <EmptyChart label="No quiz data" />
        ) : (
          <ResponsiveContainer width="100%" minHeight={200} height={200}>
            <BarChart data={typeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Quizzes" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  const { data: overview, isLoading, refetch } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => analyticsApi.adminOverview().then((r) => r.data),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Analytics</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Platform-wide learning insights — live data from all services</p>
        </div>
        <button onClick={() => refetch()} className="btn btn-sm btn-secondary" aria-label="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mb-1 border-b border-gray-200 dark:border-gray-700" style={{ minWidth: 0 }}>
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={[
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              activeTab === tab
                ? "border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
            ].join(" ")}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Overview"    && <OverviewTab    overview={overview} isLoading={isLoading} />}
      {activeTab === "Revenue"     && <RevenueTab />}
      {activeTab === "Engagement"  && <EngagementTab />}
      {activeTab === "Battles"     && <BattlesTab />}
      {activeTab === "Quizzes"     && <QuizzesTab />}
    </div>
  );
}
