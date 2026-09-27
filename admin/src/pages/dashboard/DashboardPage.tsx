import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  analyticsApi, paymentApi, gamificationApi,
  quizApi, authApi, ragApi, contentApi,
} from "@/lib/api";
import StatsCard from "@/components/ui/StatsCard";
import Alert from "@/components/ui/Alert";
import {
  Users, TrendingUp,
  DollarSign, Brain, Activity, Zap,
  FolderOpen, Cpu, ScrollText,
  ArrowRight, Clock, BarChart2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const SUBJECT_FALLBACK = [
  { name: "Mathematics", value: 35, color: "#4f46e5" },
  { name: "Science", value: 28, color: "#22c55e" },
  { name: "English", value: 20, color: "#f59e0b" },
  { name: "History", value: 10, color: "#ef4444" },
  { name: "Others", value: 7, color: "#94a3b8" },
];

const PAPER_TYPE_COLOR: Record<string, string> = {
  quiz_paper:     "badge-info",
  revision_paper: "badge-primary",
  practice_paper: "badge-warning",
  mock_test:      "badge-danger",
};

const QUICK_ACTIONS = [
  {
    label: "Manage Users",
    description: "View, activate or change user roles",
    to: "/users",
    icon: Users,
  },
  {
    label: "Generated Papers",
    description: "Browse AI-generated question papers",
    to: "/generated-papers",
    icon: ScrollText,
  },
  {
    label: "Content Manager",
    description: "Boards, subjects, chapters & videos",
    to: "/content",
    icon: FolderOpen,
  },
  {
    label: "AI Generator",
    description: "Generate new papers with AI",
    to: "/ai-generate",
    icon: Cpu,
  },
];

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function DashboardPage() {
  // ── Existing queries ──────────────────────────────────────────────────────
  const overviewQuery = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => analyticsApi.adminOverview().then((r) => r.data),
  });
  const { data: overview, isLoading: overviewLoading } = overviewQuery;

  const paymentsQuery = useQuery({
    queryKey: ["admin-subscriptions-stats"],
    queryFn: () => paymentApi.adminSubscriptions({ page: 1 }).then((r) => r.data),
  });
  const { data: paymentsData, isLoading: paymentsLoading } = paymentsQuery;

  const { data: leaderboard = [] } = useQuery({
    queryKey: ["gamification-leaderboard-admin"],
    queryFn: () => gamificationApi.leaderboard(5).then((r) => r.data),
  });

  const { data: quizStats } = useQuery({
    queryKey: ["admin-quiz-stats"],
    queryFn: () => quizApi.adminStats().then((r) => r.data),
  });

  // ── New queries ───────────────────────────────────────────────────────────
  const { data: allUsers = [], isLoading: usersLoading } = useQuery<any[]>({
    queryKey: ["admin-users-count"],
    queryFn: () => authApi.getUsers({}).then((r) => r.data),
    // graceful: if this 404s or errors, treat as empty
    retry: 1,
  });

  const { data: papersData, isLoading: papersLoading } = useQuery({
    queryKey: ["admin-recent-papers"],
    queryFn: () => ragApi.getPapers({ limit: 5 }).then((r) => r.data),
    retry: 1,
  });

  const { data: boards = [] } = useQuery<any[]>({
    queryKey: ["content-boards-count"],
    queryFn: () => contentApi.boards().then((r) => r.data),
    retry: 1,
  });

  // ── Derived values ────────────────────────────────────────────────────────
  const stats = paymentsData?.stats;
  const monthlyRevenuePaise = stats?.monthly_revenue_paise ?? 0;
  const revenueDisplay = monthlyRevenuePaise > 0
    ? `₹${Math.round(monthlyRevenuePaise / 100).toLocaleString("en-IN")}`
    : "₹0";

  const totalUsers = allUsers.length > 0 ? allUsers.length : (overview?.total_active_students ?? 0);

  // Count students specifically
  const totalStudents = allUsers.filter((u: any) => u.role === "student").length
    || overview?.total_active_students
    || 0;

  // Papers: array or paginated response
  const recentPapers: any[] = Array.isArray(papersData)
    ? papersData.slice(0, 5)
    : (papersData?.papers ?? papersData?.items ?? []).slice(0, 5);

  const totalPapers: number = Array.isArray(papersData)
    ? papersData.length
    : (papersData?.total ?? recentPapers.length);

  // Active users today: from analytics overview or fallback
  const activeToday: number = overview?.active_users_today
    ?? overview?.daily_active_users
    ?? 0;

  // Content items = boards count (rough proxy; graceful)
  const contentItems: number = boards.length > 0 ? boards.length : 0;

  const isLoading = overviewLoading || paymentsLoading;
  // A single top-level banner rather than an isError check on each of the
  // 7 independent queries this page renders — each feeds one stat tile/
  // section, and a failed fetch on any of them previously just left that
  // tile showing "—" with no indication anything actually broke.
  const criticalQueriesFailed = overviewQuery.isError || paymentsQuery.isError;

  return (
    <div className="space-y-6">
      {criticalQueriesFailed && (
        <Alert variant="danger" title="Some dashboard metrics couldn't load">
          <button
            onClick={() => { overviewQuery.refetch(); paymentsQuery.refetch(); }}
            className="underline font-semibold"
          >
            Retry
          </button>
        </Alert>
      )}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Platform overview and key metrics</p>
      </div>

      {/* ── KPI Cards (top row) ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          label="Total Students"
          value={usersLoading ? "…" : totalStudents.toLocaleString()}
          icon={Users}
          color="bg-blue-500"
        />
        <StatsCard
          label="Papers Generated"
          value={papersLoading ? "…" : totalPapers > 0 ? totalPapers.toLocaleString() : "0"}
          icon={ScrollText}
          color="bg-indigo-500"
        />
        <StatsCard
          label="Content Items"
          value={contentItems > 0 ? contentItems.toLocaleString() : (isLoading ? "…" : "—")}
          icon={FolderOpen}
          color="bg-teal-500"
        />
        <StatsCard
          label="Active Users Today"
          value={isLoading ? "…" : activeToday > 0 ? activeToday.toLocaleString() : "—"}
          icon={Activity}
          color="bg-green-500"
        />
      </div>

      {/* ── Second stats row (existing) ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          label="Active Subscriptions"
          value={isLoading ? "…" : String(stats?.total_active ?? 0)}
          icon={TrendingUp}
          color="bg-yellow-500"
        />
        <StatsCard
          label="Monthly Revenue"
          value={isLoading ? "…" : revenueDisplay}
          icon={DollarSign}
          color="bg-emerald-500"
        />
        <StatsCard
          label="Total Quizzes"
          value={quizStats ? String(quizStats.total_quizzes) : "…"}
          icon={Brain}
          color="bg-pink-500"
        />
        <StatsCard
          label="Annual Plans"
          value={isLoading ? "…" : String(stats?.total_annual ?? 0)}
          icon={Zap}
          color="bg-teal-500"
        />
      </div>

      {/* ── Quick Actions ───────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map(({ label, description, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="card-hover p-4 flex flex-col gap-3 group"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary-50 dark:bg-primary-900/30">
                <Icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm group-hover:text-primary-700 dark:group-hover:text-primary-400 transition-colors">
                  {label}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">{description}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 transition-colors mt-auto" />
            </Link>
          ))}
        </div>
      </div>

      {/* ── Recent Generated Papers + User Growth ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent papers table */}
        <div className="card p-5 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Recent Generated Papers</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Last 5 AI-generated papers</p>
            </div>
            <Link
              to="/generated-papers"
              className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 font-medium transition-colors"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {papersLoading ? (
            <div className="flex items-center justify-center py-10 text-gray-400 dark:text-gray-500 text-sm">
              Loading papers…
            </div>
          ) : recentPapers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500 gap-2">
              <ScrollText className="w-8 h-8 opacity-30" />
              <p className="text-sm">No papers generated yet.</p>
              <Link to="/ai-generate" className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                Generate your first paper →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left pb-2 font-medium">Title</th>
                    <th className="text-left pb-2 font-medium hidden md:table-cell">Type</th>
                    <th className="text-left pb-2 font-medium hidden md:table-cell">Subject</th>
                    <th className="text-left pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {recentPapers.map((paper: any) => (
                    <tr key={paper.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                      <td className="py-2.5 pr-3 max-w-[200px]">
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate" title={paper.title}>
                          {paper.title ?? "Untitled"}
                        </p>
                        {paper.class_num && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">Class {paper.class_num}</p>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 hidden md:table-cell">
                        {paper.paper_type ? (
                          <span className={`badge ${PAPER_TYPE_COLOR[paper.paper_type] ?? "badge-gray"}`}>
                            {paper.paper_type.replace(/_/g, " ")}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                        {paper.subject ?? "—"}
                      </td>
                      <td className="py-2.5 text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(paper.created_at)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* User Growth chart placeholder */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="w-4 h-4 text-primary-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">User Growth</h3>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Registration trend over time</p>
          <div className="flex flex-col items-center justify-center h-[180px] bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 gap-3">
            <BarChart2 className="w-10 h-10 text-gray-200 dark:text-gray-700" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-400 dark:text-gray-500">Charts coming soon</p>
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">
                Time-series data will appear here
              </p>
            </div>
          </div>
          {totalUsers > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Total registered</span>
              <span className="font-bold text-gray-900 dark:text-gray-100">{totalUsers.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Charts row (existing) ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Subscription Breakdown</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Active plan distribution</p>
          {isLoading ? (
            <div className="h-[220px] flex items-center justify-center text-gray-400 dark:text-gray-500">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={[
                  { plan: "Monthly", count: stats?.total_monthly ?? 0 },
                  { plan: "Quarterly", count: stats?.total_quarterly ?? 0 },
                  { plan: "Annual", count: stats?.total_annual ?? 0 },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="plan" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Subscribers" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Subject Distribution</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Relative engagement by subject (estimated)</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={SUBJECT_FALLBACK}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {SUBJECT_FALLBACK.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Legend iconType="circle" iconSize={8} />
              <Tooltip formatter={(v) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Platform Health + Leaderboard (existing) ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary-600 dark:text-primary-400" /> Platform Health
          </h3>
          <div className="space-y-3">
            {[
              { label: "Total Students", value: usersLoading ? "…" : totalStudents.toLocaleString() },
              { label: "Videos Watched (all-time)", value: isLoading ? "…" : (overview?.total_videos_watched ?? 0).toLocaleString() },
              { label: "Quizzes Completed (all-time)", value: isLoading ? "…" : (overview?.total_quizzes_completed ?? 0).toLocaleString() },
              { label: "Papers Generated", value: papersLoading ? "…" : totalPapers.toLocaleString() },
              { label: "Active Subscriptions", value: isLoading ? "…" : String(stats?.total_active ?? 0) },
              { label: "Est. Monthly Revenue", value: isLoading ? "…" : revenueDisplay },
              { label: "Total Questions in Bank", value: quizStats ? quizStats.total_questions.toLocaleString() : "…" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center py-1.5 border-b border-gray-50 dark:border-gray-800 text-sm">
                <span className="text-gray-500 dark:text-gray-400">{label}</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5 col-span-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Top XP Leaderboard</h3>
          {leaderboard.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 py-8">No leaderboard data yet.</div>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry: { rank: number; user_id: string; total_xp: number; level: number }) => (
                <div key={entry.user_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/60">
                  <span className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    #{entry.rank}
                  </span>
                  <span className="font-mono text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{entry.user_id}</span>
                  <span className="text-sm font-bold text-primary-600 dark:text-primary-400">{entry.total_xp.toLocaleString()} XP</span>
                  <span className="badge-info">Lv.{entry.level}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
