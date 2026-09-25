import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { gamificationApi } from "@/lib/api";
import { Gift, Check, X, Flame, Zap, Coins, Crown, CheckCircle } from "lucide-react";

// ── Types (backend contract — rendered verbatim, no client-side eligibility) ──
interface CalendarDay { day: number; xp: number; ep: number; label: string; claimed: boolean }
interface NextReward  { day: number; xp: number; ep: number; label: string }

interface DailyRewardStatus {
  claimed_today: boolean;
  current_day: number;
  reward: { xp?: number; ep?: number; label?: string };
  calendar: CalendarDay[];
  can_claim: boolean;
  should_show_popup: boolean;
  current_streak: number;
  next_claim_in_seconds: number;
  next_reward: NextReward | null;
}

interface ClaimResult {
  day: number;
  xp_awarded: number;
  ep_awarded: number;
  reward_label: string;
  next_day: number;
  current_streak: number;
  next_claim_in_seconds: number;
  next_reward: NextReward | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtHMS(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

// Display-only countdown ticking down from the backend-provided seconds
function Countdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => setLeft(seconds), [seconds]);
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums font-semibold">{fmtHMS(left)}</span>;
}

// 7-day progression strip: claimed days checked, today highlighted, Day 7 premium
function DayStrip({ calendar, currentDay }: { calendar: CalendarDay[]; currentDay: number }) {
  return (
    <div className="flex gap-1.5">
      {calendar.map((d) => {
        const isCurrent = d.day === currentDay;
        const isPremium = d.day === 7;
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={d.label}>
            <div
              className={`w-full aspect-square max-w-[40px] rounded-xl flex items-center justify-center text-xs font-bold transition-colors ${
                d.claimed
                  ? "bg-emerald-500 text-white"
                  : isCurrent
                    ? "bg-gradient-to-br from-pink-500 to-rose-600 text-white ring-2 ring-pink-300 dark:ring-pink-700 shadow-md"
                    : isPremium
                      ? "bg-gradient-to-br from-amber-400 to-yellow-500 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-400"
              }`}
            >
              {d.claimed ? <Check className="w-4 h-4" /> : isPremium ? <Crown className="w-4 h-4" /> : d.day}
            </div>
            <span className={`text-[9px] font-medium ${isCurrent ? "text-pink-600 dark:text-pink-400" : "text-gray-400"}`}>
              D{d.day}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main popup ────────────────────────────────────────────────────────────────
export default function DailyRewardPopup({ userId }: { userId?: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);

  // Closing after collecting always lands the student on the dashboard
  // (no-op when they are already there).
  const close = () => {
    setOpen(false);
    if (claimResult) navigate("/dashboard");
  };

  const { data: status } = useQuery<DailyRewardStatus>({
    queryKey: ["daily-reward-status", userId],
    queryFn: () => gamificationApi.dailyRewardStatus(userId!).then((r) => r.data),
    enabled: !!userId,
  });

  // Open only when the backend says so, and only once per browser session per day
  useEffect(() => {
    if (!status?.should_show_popup) return;
    const guardKey = `dr_popup_${new Date().toDateString()}`;
    if (sessionStorage.getItem(guardKey)) return;
    sessionStorage.setItem(guardKey, "1");
    setOpen(true);
  }, [status?.should_show_popup]);

  const claimMutation = useMutation({
    mutationFn: () => gamificationApi.dailyRewardClaim(userId!).then((r) => r.data as ClaimResult),
    onSuccess: (data) => setClaimResult(data),
    onSettled: () => {
      // On 409 (cooldown race) the refetched status flips the modal to the claimed state
      queryClient.invalidateQueries({ queryKey: ["daily-reward-status", userId] });
      queryClient.invalidateQueries({ queryKey: ["edupoints-balance", userId] });
    },
  });

  if (!open || !status) return null;

  const alreadyClaimed = status.claimed_today && !claimResult;
  const claimError = (claimMutation.error as any)?.response?.data?.detail;

  return (
    // !m-0 defeats the parent's space-y margin so the fixed overlay stays at inset-0
    <div
      className="fixed inset-0 !m-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      onClick={close}
    >
      <div
        className="relative w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-4 sm:p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {claimResult ? (
          /* ── Claimed just now: success animation + what was earned ── */
          <div className="text-center animate-scale-in">
            <div className="text-5xl animate-bounce-soft">🎉</div>
            <h2 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
              Day {claimResult.day} Reward Claimed!
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{claimResult.reward_label}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-sm font-bold">
                <Zap className="w-4 h-4 flex-shrink-0" /> +{claimResult.xp_awarded} XP
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm font-bold">
                <Coins className="w-4 h-4 flex-shrink-0" /> +{claimResult.ep_awarded} EP
              </span>
            </div>
            <p className="mt-4 text-sm font-semibold text-orange-600 dark:text-orange-400 flex items-center justify-center gap-1.5">
              <Flame className="w-4 h-4" /> {claimResult.current_streak}-day streak
            </p>
            {claimResult.next_reward && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Next: {claimResult.next_reward.label}
              </p>
            )}
            <p className="mt-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Come back tomorrow!
            </p>
          </div>
        ) : alreadyClaimed ? (
          /* ── Already claimed today (e.g. race): countdown to next reward ── */
          <div className="text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
              ✅ You've already claimed today's reward.
            </h2>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Next reward in <Countdown seconds={status.next_claim_in_seconds} />
            </p>
            <div className="mt-5">
              <DayStrip calendar={status.calendar} currentDay={status.current_day} />
            </div>
          </div>
        ) : (
          /* ── Claimable: reward card ── */
          <div className="text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-md">
              <Gift className="w-7 h-7 text-white" />
            </div>
            <h2 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">Daily Reward</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {status.reward?.label ?? `Day ${status.current_day} reward`}
            </p>

            <div className="mt-4">
              <DayStrip calendar={status.calendar} currentDay={status.current_day} />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-sm font-bold">
                <Zap className="w-4 h-4 flex-shrink-0" /> +{status.reward?.xp ?? 0} XP
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm font-bold">
                <Coins className="w-4 h-4 flex-shrink-0" /> +{status.reward?.ep ?? 0} EP
              </span>
            </div>

            <p className="mt-3 text-sm font-semibold text-orange-600 dark:text-orange-400 flex items-center justify-center gap-1.5">
              🔥 {status.current_streak}-day streak
            </p>
            {status.next_reward && (
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                Next: {status.next_reward.label}
              </p>
            )}

            <button
              onClick={() => claimMutation.mutate()}
              disabled={claimMutation.isPending || !status.can_claim}
              className="mt-5 w-full py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md"
            >
              {claimMutation.isPending ? "Claiming…" : "Claim Reward"}
            </button>
            {claimMutation.isError && (
              <p className="mt-2 text-xs text-red-500">
                {typeof claimError === "string" ? claimError : "Could not claim reward. Please try again."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
