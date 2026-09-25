import { useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "@/lib/api";
import { Card, EmptyState } from "@/components/ui";
import { SkeletonCard } from "@/components/ui/Skeleton";
import Pagination from "@/components/ui/Pagination";
import {
  ArrowLeft, BarChart2, Clock, AlertTriangle, BookOpen, Trophy, Target,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// Reuses the exact endpoint parents call (backend's role check lets
// admin/super_admin through without a parent-link check) — one summary,
// one cache, no separate admin-only re-derivation to drift out of sync.
interface SubjectScoreItem { subject_id: string; avg_score: number; quizzes_completed: number }
interface WeakTopicItem { topic_id: string; accuracy: number; attempts: number }
interface StudentSummary {
  total_videos_watched: number;
  total_quizzes_completed: number;
  avg_quiz_score: number;
  subjects: SubjectScoreItem[];
  weak_topics: WeakTopicItem[];
  attendance: number | null;
  study_hours_week: number | null;
  rank_percentile: number | null;
  activity_week: { day: string; minutes: number }[] | null;
  activity_today: { videos_watched: number; quizzes_completed: number; study_minutes: number } | null;
  exam_readiness: Record<string, number> | null;
  ai_insights: string[] | null;
  insufficient_data_fields: Record<string, string>;
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-gray-300 dark:text-gray-600 gap-2">
      <BarChart2 className="w-8 h-8" />
      <p className="text-xs">{label}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
  );
}

const DAYS_OPTIONS: { value: 1 | 7 | 30 | 90 | 365; label: string }[] = [
  { value: 1,   label: "Today" },
  { value: 7,   label: "7d" },
  { value: 30,  label: "30d" },
  { value: 90,  label: "90d" },
  { value: 365, label: "1Y" },
];

const PAGE_SIZE = 10;

export default function UserAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [days, setDays] = useState<1 | 7 | 30 | 90 | 365>(7);
  const [weakTopicsPage, setWeakTopicsPage] = useState(0);

  // Passed via navigation state from UsersPage's row click — no dedicated
  // get-single-user endpoint exists, and the list page already has the
  // full row in hand, so re-fetching it here would be a redundant round
  // trip. Falls back to a bare "Student" header if the page is opened
  // directly (e.g. a refreshed/bookmarked URL) rather than erroring.
  const user = (location.state as { user?: { full_name?: string; email?: string; role?: string; school_name?: string } } | null)?.user;

  const { data: summary, isLoading, isError } = useQuery({
    queryKey: ["admin-user-analytics", id, days],
    queryFn: () => analyticsApi.studentSummary(id!, days).then((r) => r.data as StudentSummary),
    enabled: !!id,
  });

  const reasons = summary?.insufficient_data_fields ?? {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate("/users")}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
            {user?.full_name || user?.email || "Student"} — Analytics
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : ""}
            {user?.school_name ? ` · ${user.school_name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 flex-shrink-0">
          {DAYS_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setDays(value); setWeakTopicsPage(0); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                days === value
                  ? "bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-300 shadow-sm"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      )}

      {isError && (
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Could not load analytics"
            description="This student may not have a linkable analytics profile yet, or the analytics service is unreachable."
          />
        </Card>
      )}

      {!isLoading && !isError && summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat label="Videos Watched (all-time)" value={summary.total_videos_watched} />
            <Stat label="Quizzes Completed (all-time)" value={summary.total_quizzes_completed} />
            <Stat label="Avg Quiz Score" value={`${Math.round(summary.avg_quiz_score)}%`} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat
              label={`Attendance (last ${days}d)`}
              value={summary.attendance !== null ? `${summary.attendance}%` : "N/A"}
            />
            <Stat
              label={`Study Hours (last ${days}d)`}
              value={summary.study_hours_week !== null ? `${summary.study_hours_week}h` : "N/A"}
            />
            <Stat
              label="Class Rank"
              value={summary.rank_percentile !== null ? `Top ${Math.round(summary.rank_percentile)}%` : "N/A"}
            />
          </div>

          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" /> Study Time — last {days} days
            </h3>
            {!summary.activity_week || summary.activity_week.length === 0 ? (
              <EmptyChart label={reasons.activity_week ?? "No activity recorded in this window."} />
            ) : (
              <ResponsiveContainer width="100%" minHeight={200} height={240}>
                <BarChart data={summary.activity_week.map((d) => ({ day: d.day, minutes: d.minutes }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={summary.activity_week.length > 14 ? Math.ceil(summary.activity_week.length / 14) : 0} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="minutes" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Minutes studied" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-gray-400" /> Subject Performance
              </h3>
              {summary.subjects.length === 0 ? (
                <EmptyChart label={reasons.subjects ?? "No quiz attempts recorded for any subject yet."} />
              ) : (
                <div className="space-y-3">
                  {summary.subjects.map((s) => (
                    <div key={s.subject_id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-300 font-mono text-xs">{s.subject_id.slice(0, 8)}</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{Math.round(s.avg_score)}% · {s.quizzes_completed} quizzes</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-600 rounded-full" style={{ width: `${Math.min(100, s.avg_score)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-gray-400" /> Weak Topics
              </h3>
              {summary.weak_topics.length === 0 ? (
                <EmptyChart label="No weak topics identified — either not enough attempts yet, or performance is solid everywhere." />
              ) : (
                <>
                  <div className="space-y-2">
                    {summary.weak_topics
                      .slice(weakTopicsPage * PAGE_SIZE, weakTopicsPage * PAGE_SIZE + PAGE_SIZE)
                      .map((w) => (
                        <div key={w.topic_id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{w.topic_id.slice(0, 8)}</span>
                          <span className="text-gray-600 dark:text-gray-300">{w.attempts} attempts</span>
                          <span className="font-semibold text-danger-600">{Math.round(w.accuracy)}%</span>
                        </div>
                      ))}
                  </div>
                  <Pagination
                    page={weakTopicsPage}
                    totalPages={Math.max(1, Math.ceil(summary.weak_topics.length / PAGE_SIZE))}
                    onPageChange={setWeakTopicsPage}
                    summary={`${weakTopicsPage * PAGE_SIZE + 1}–${Math.min(summary.weak_topics.length, (weakTopicsPage + 1) * PAGE_SIZE)} of ${summary.weak_topics.length}`}
                  />
                </>
              )}
            </Card>
          </div>

          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-gray-400" /> Exam Readiness
            </h3>
            {!summary.exam_readiness ? (
              <EmptyChart label={reasons.exam_readiness ?? "Not enough data to compute exam readiness."} />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(summary.exam_readiness).map(([subject, score]) => (
                  <div key={subject} className="text-center bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{score}%</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">{subject}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {summary.ai_insights && summary.ai_insights.length > 0 && (
            <Card>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-gray-400" /> Insights
              </h3>
              <ul className="space-y-2">
                {summary.ai_insights.map((line, i) => (
                  <li key={i} className="text-sm text-gray-600 dark:text-gray-300 flex gap-2">
                    <span className="text-primary-500">•</span> {line}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
