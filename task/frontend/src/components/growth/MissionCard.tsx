import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { gamificationApi } from "@/lib/api";
import { Target, Zap, ChevronRight, Trophy, Sparkles, PlayCircle, Flame } from "lucide-react";

// ── Backend contract (rendered verbatim — no client-side goal logic) ──────────
// v2: a student gets up to 4 of these per day (one per `slot`), not 1 random
// goal — see gamification_service's GoalService. `assigned_video_ids` /
// `assigned_quiz_id` are the SPECIFIC personalized content chosen for the
// video/quiz slot when the admin has personalization on; null/[] means "any
// video/quiz of that type counts" and the CTA falls back to a generic page.
// STREAK auto-completes the instant it's assigned (opening the app that day
// IS the goal), so it's effectively never seen "incomplete" here — wired up
// anyway for consistency and to cover any timing edge case.
export interface DailyGoal {
  id: string;
  user_id: string;
  goal_date: string;
  slot: "video" | "quiz" | "ai_doubt" | "streak";
  goal_type: "quiz" | "video" | "questions" | "practice_minutes" | "ai_doubt" | "streak";
  title: string;
  target_count: number;
  progress: number;
  completed: boolean;
  completed_at: string | null;
  xp_reward: number;
  ep_reward: number;
  assigned_video_ids?: string[] | null;
  assigned_quiz_id?: string | null;
}

const SLOT_ICON: Record<DailyGoal["slot"], typeof Target> = {
  video: PlayCircle,
  quiz: Trophy,
  ai_doubt: Sparkles,
  streak: Flame,
};

const SLOT_LABEL: Record<DailyGoal["slot"], string> = {
  video: "Watch",
  quiz: "Quiz",
  ai_doubt: "Ask AI",
  streak: "Streak",
};

// Route the "Continue" CTA — a pinned video/quiz id deep-links straight to
// it; otherwise falls back to the generic page for that goal_type.
function goalRoute(goal: DailyGoal): string {
  if (goal.slot === "video" && goal.assigned_video_ids?.length) {
    return `/learn/video/${goal.assigned_video_ids[0]}`;
  }
  if (goal.slot === "quiz" && goal.assigned_quiz_id) {
    return `/quiz/${goal.assigned_quiz_id}`;
  }
  if (goal.slot === "ai_doubt") return "/ai-assistant";
  if (goal.slot === "streak") return "/dashboard";
  return goal.goal_type === "video" || goal.goal_type === "practice_minutes" ? "/learn" : "/revision";
}

function GoalRow({ goal, compact }: { goal: DailyGoal; compact?: boolean }) {
  const pct = goal.target_count > 0
    ? Math.min(100, Math.round((goal.progress / goal.target_count) * 100))
    : 0;
  const Icon = SLOT_ICON[goal.slot] ?? Target;

  return (
    <div className={compact ? "" : "flex-1 min-w-0"}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-white/90 ${compact ? "text-[10px]" : "text-[11px]"}`}>
          <span className={`flex items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20 flex-shrink-0 ${compact ? "w-5 h-5" : "w-5 h-5"}`}>
            <Icon className="w-3 h-3" />
          </span>
          {SLOT_LABEL[goal.slot]}
        </span>
        <span className={`flex items-center gap-1 font-bold text-amber-200 bg-amber-400/15 ring-1 ring-amber-300/25 rounded-full flex-shrink-0 ${compact ? "text-[10px] px-2 py-1" : "text-[11px] px-2.5 py-1"}`}>
          <Zap className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} fill="currentColor" /> +{goal.xp_reward}{!compact && " XP"}
        </span>
      </div>

      <h3 className={`mt-2 font-extrabold tracking-tight leading-snug break-words ${compact ? "text-sm" : "text-base sm:text-lg"}`}>
        {goal.title}
      </h3>

      <div className={compact ? "mt-2.5" : "mt-3 max-w-md"}>
        <div className={`flex items-center justify-between font-semibold text-white/70 mb-1 ${compact ? "text-[10px]" : "text-xs"}`}>
          <span>Progress</span>
          <span className="tabular-nums text-white/90">{goal.progress}/{goal.target_count}</span>
        </div>
        <div className={`rounded-full bg-black/20 ring-1 ring-white/10 overflow-hidden ${compact ? "h-1.5" : "h-2"}`}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-300 shadow-[0_0_8px_rgba(252,211,77,0.6)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <Link
        to={goalRoute(goal)}
        className={`group flex items-center justify-center gap-1.5 bg-white text-primary-700 font-bold rounded-xl hover:bg-primary-50 active:scale-[0.98] transition-all shadow-md ${
          compact ? "mt-3 w-full text-xs py-2" : "mt-3 w-full sm:w-auto text-sm px-5 py-2.5"
        }`}
      >
        Continue
        <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

export default function MissionCard({ userId, compact }: { userId?: string; compact?: boolean }) {
  const { data: goals } = useQuery<DailyGoal[]>({
    queryKey: ["today-goal", userId],
    queryFn: () => gamificationApi.todayGoal(userId!).then((r) => r.data ?? []),
    enabled: !!userId,
  });

  // Server-driven visibility: hidden when the feature is disabled (empty
  // list) or every slot is already completed — the backend issues a fresh
  // set next day, so it reappears automatically.
  const incomplete = (goals ?? []).filter((g) => !g.completed);
  if (incomplete.length === 0) return null;

  return (
    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary-600 via-primary-600 to-primary-800 p-[1px] shadow-lg shadow-primary-900/20">
      {/* Hairline gradient border for extra depth without a heavy outline */}
      <div className={`relative rounded-2xl bg-gradient-to-br from-primary-600 via-primary-600 to-primary-800 text-white overflow-hidden ${compact ? "p-4" : "p-4 sm:p-5 md:p-6"}`}>
        {/* Soft radial glow accents */}
        <div className="absolute -top-14 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 left-1/4 w-32 h-32 rounded-full bg-amber-300/10 blur-2xl pointer-events-none" />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 mb-3">
            <Target className="w-3 h-3" /> Today's Goals ({incomplete.length})
          </span>

          <div className={compact ? "space-y-4 divide-y divide-white/10" : "flex flex-col sm:flex-row sm:items-start gap-5 sm:gap-6"}>
            {incomplete.map((g, i) => (
              <div key={g.id} className={compact && i > 0 ? "pt-4" : undefined}>
                <GoalRow goal={g} compact={compact} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
