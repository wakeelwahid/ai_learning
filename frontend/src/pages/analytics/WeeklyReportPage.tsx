import { Link } from "react-router-dom";
import {
  PlayCircle, CheckCircle, Target, Zap,
  Trophy, Flame, ArrowLeft, Share2, Loader2,
} from "lucide-react";
import { analyticsApi } from "@/lib/api";
import { useAppSelector } from "@/store";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui";

function fmtToday(): string {
  return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function WeeklyReportPage() {
  const userId = useAppSelector((s) => s.auth.user?.id);
  const asOfDate = fmtToday();

  // NOTE: this platform does not track per-week deltas (StudentProgress
  // stores running lifetime totals per chapter, not a daily/weekly event
  // log) — so "videos watched" / "quizzes completed" / "XP" below are
  // LIFETIME totals as of today, not this-week-only numbers. Labeled
  // honestly as a snapshot rather than claimed as a weekly report.
  const { data: summary, isLoading } = useQuery({
    queryKey: ["weekly-summary", userId],
    queryFn: () => analyticsApi.getWeeklySummary(userId!).then((r) => r.data),
    enabled: !!userId,
    retry: 1,
  });

  const loading = isLoading;

  const totalXp     = summary?.total_xp ?? 0;
  const level       = summary?.level ?? 0;
  const streak      = summary?.streak ?? 0;
  const rank        = summary?.rank ?? null;

  const videosWatched    = summary?.videos_watched    ?? 0;
  const quizzesCompleted = summary?.quizzes_completed ?? 0;
  const avgScore         = Math.round(summary?.avg_score ?? 0);

  function handleShare() {
    const msg =
      `📊 My EduLearn Progress Snapshot (as of ${asOfDate}):\n` +
      `🎬 ${videosWatched} videos watched\n` +
      `✅ ${quizzesCompleted} quizzes done\n` +
      `🎯 ${avgScore}% avg score\n` +
      `⚡ ${totalXp} XP total\n` +
      `Join me: https://edulearn.app`;
    window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
  }

  const STATS = [
    { icon: PlayCircle, label: "Videos Watched", value: videosWatched },
    { icon: CheckCircle, label: "Quizzes Done", value: quizzesCompleted },
    { icon: Target, label: "Avg Score", value: `${avgScore}%` },
    { icon: Zap, label: "XP Earned", value: totalXp },
    { icon: Trophy, label: rank != null ? "Class Rank" : "Level", value: rank != null ? `#${rank}` : `Lv ${level}` },
    { icon: Flame, label: "Study Streak", value: `${streak}d` },
  ];

  return (
    <div className="w-full pb-8 space-y-4 animate-fade-in">

      {/* Back nav */}
      <Link to="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors font-medium">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
      </Link>

      {/* Hero banner */}
      <div className="relative rounded-2xl overflow-hidden bg-primary-600 px-5 py-6 text-white">
        <div className="absolute -top-6 -right-6 w-36 h-36 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold tracking-tight">Progress Snapshot</h1>
              <p className="text-white/65 text-xs mt-0.5">Your learning journey so far</p>
            </div>
            <div className="text-3xl">📊</div>
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 bg-white/15 border border-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
            📅 As of {asOfDate}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
        </div>
      )}

      {/* Stats grid */}
      {!loading && (
        <div className="grid grid-cols-2 xs:grid-cols-3 gap-2">
          {STATS.map(({ icon: Icon, label, value }) => (
            <Card key={label} className="p-3 flex flex-col items-center text-center gap-1.5">
              <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center">
                <Icon className="w-4 h-4 text-white" />
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</p>
              <p className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Summary card */}
      {!loading && (
        <Card className="space-y-3 p-4">
          <h2 className="text-xs font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 inline-block" />
            Lifetime Totals
          </h2>
          <div className="space-y-2">
            {[
              { label: "Videos watched (lifetime)",      value: videosWatched,    max: 100 },
              { label: "Quizzes completed (lifetime)",   value: quizzesCompleted, max: 100 },
              { label: "Avg quiz accuracy",               value: avgScore,         max: 100, suffix: "%" },
              { label: "Total XP",                        value: Math.min(totalXp, 2000), max: 2000 },
            ].map(({ label, value, max, suffix }) => (
              <div key={label}>
                <div className="flex justify-between gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span className="truncate min-w-0">{label}</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0">{suffix ? `${value}${suffix}` : value}</span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary-600 transition-all duration-700"
                    style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Share */}
      <button onClick={handleShare}
        className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] active:bg-[#17a852] text-white font-bold py-3 rounded-2xl shadow-sm transition-colors text-sm">
        <Share2 className="w-4 h-4" /> Share on WhatsApp
      </button>

      <p className="text-center text-xs text-gray-400 dark:text-gray-500 pb-2">
        Lifetime totals as of {asOfDate} — this platform doesn't yet track day-by-day activity, so a true week-over-week breakdown isn't available.
      </p>
    </div>
  );
}
