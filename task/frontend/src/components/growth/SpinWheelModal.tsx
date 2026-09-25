import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { gamificationApi } from "@/lib/api";
import { X, Zap, Coins, Flame } from "lucide-react";

// ── Backend contract (same shapes as DailyRewardPopup — server decides all rewards) ──
interface CalendarDay { day: number; xp: number; ep: number; label: string; claimed: boolean }
interface NextReward  { day: number; xp: number; ep: number; label: string }

export interface DailyRewardStatus {
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

// ── SVG wheel (pure presentation — the landed segment is dictated by the server) ──
const SEG_COLORS = ["#7c3aed", "#8b5cf6", "#6d28d9", "#a78bfa", "#7c3aed", "#8b5cf6", "#f59e0b"];
const R = 96;
const CX = 100;
const CY = 100;

function polar(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // 0° = 12 o'clock
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

function segmentPath(startDeg: number, endDeg: number) {
  const a = polar(startDeg, R);
  const b = polar(endDeg, R);
  return `M ${CX} ${CY} L ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} Z`;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Wheel({ calendar, rotation, spinning }: { calendar: CalendarDay[]; rotation: number; spinning: boolean }) {
  const seg = 360 / Math.max(1, calendar.length);
  return (
    <div className="relative w-full max-w-[220px] aspect-square sm:max-w-none sm:w-72 sm:h-72 mx-auto">
      {/* Pointer */}
      <div className="absolute left-1/2 -top-1.5 -translate-x-1/2 z-10 w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-pink-500 drop-shadow" />
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full drop-shadow-xl"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 3s cubic-bezier(0.12, 0.8, 0.22, 1)" : "none",
        }}
      >
        {calendar.map((d, i) => {
          const start = i * seg;
          const mid = start + seg / 2;
          const labelPos = polar(mid, 60);
          const dayPos = polar(mid, 84);
          return (
            <g key={d.day}>
              <path d={segmentPath(start, start + seg)} fill={SEG_COLORS[i % SEG_COLORS.length]} stroke="#fff" strokeWidth="1.5" opacity={d.claimed ? 0.45 : 1} />
              <text
                x={labelPos.x} y={labelPos.y}
                transform={`rotate(${mid} ${labelPos.x} ${labelPos.y})`}
                textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700"
              >
                <tspan x={labelPos.x} dy="-2">{truncate(d.label, 14)}</tspan>
                <tspan x={labelPos.x} dy="9">+{d.xp} XP</tspan>
              </text>
              <text
                x={dayPos.x} y={dayPos.y}
                transform={`rotate(${mid} ${dayPos.x} ${dayPos.y})`}
                textAnchor="middle" fill="#fff" fontSize="6" fontWeight="600" opacity="0.75"
              >
                {d.claimed ? "✓" : `Day ${d.day}`}
              </text>
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r="14" fill="#fff" />
        <circle cx={CX} cy={CY} r="10" fill="#7c3aed" />
      </svg>
    </div>
  );
}

// ── Spin modal (default export — opened by the DailySpinFab) ──────────────────
export default function SpinWheelModal({ userId, status, onClose }: { userId: string; status: DailyRewardStatus; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const claimMutation = useMutation({
    // Claim FIRST — the server decides the reward; the wheel then animates to it
    mutationFn: () => gamificationApi.dailyRewardClaim(userId).then((r) => r.data as ClaimResult),
    onSuccess: (data) => {
      setResult(data);
      const seg = 360 / Math.max(1, status.calendar.length);
      const idx = Math.max(0, status.calendar.findIndex((d) => d.day === data.day));
      const segmentCenter = idx * seg + seg / 2;
      // 5 full turns, then land the awarded day's segment center under the top pointer
      setSpinning(true);
      setRotation(5 * 360 - segmentCenter);
      timerRef.current = setTimeout(() => setShowResult(true), 3200);
    },
    onSettled: () => {
      // Same keys as DailyRewardPopup so both stay consistent
      queryClient.invalidateQueries({ queryKey: ["daily-reward-status", userId] });
      queryClient.invalidateQueries({ queryKey: ["edupoints-balance", userId] });
    },
  });

  const alreadyClaimed = status.claimed_today && !result;
  const claimError = (claimMutation.error as any)?.response?.data?.detail;

  return (
    // !m-0 defeats any parent space-y margin so the fixed overlay stays at inset-0
    <div
      className="fixed inset-0 !m-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={() => { if (!spinning || showResult) onClose(); }}
    >
      <div
        className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-4 sm:p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">Daily Rewards</h2>
        <p className="text-xs text-gray-400 text-center mt-0.5">Come every day &amp; earn!</p>

        <div className="mt-5">
          <Wheel calendar={status.calendar} rotation={rotation} spinning={spinning} />
        </div>

        {showResult && result ? (
          /* ── Server-awarded reward, revealed after the wheel lands ── */
          <div className="mt-5 text-center animate-scale-in">
            <div className="text-4xl animate-bounce-soft">🎉</div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-sm font-bold">
                <Zap className="w-4 h-4" /> +{result.xp_awarded} XP
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm font-bold">
                <Coins className="w-4 h-4" /> +{result.ep_awarded} EP
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{result.reward_label}</p>
            <p className="mt-1.5 text-sm font-semibold text-orange-600 dark:text-orange-400 flex items-center justify-center gap-1.5">
              <Flame className="w-4 h-4" /> {result.current_streak}-day streak
            </p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Next reward in <Countdown seconds={result.next_claim_in_seconds} />
            </p>
            <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold hover:opacity-90 transition-opacity">
              Awesome!
            </button>
          </div>
        ) : spinning ? (
          <p className="mt-5 text-center text-sm font-semibold text-violet-600 dark:text-violet-400">Spinning…</p>
        ) : alreadyClaimed ? (
          <div className="mt-5 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ✅ Already claimed today. Next spin in <Countdown seconds={status.next_claim_in_seconds} />
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <button
              onClick={() => claimMutation.mutate()}
              disabled={claimMutation.isPending || !status.can_claim}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md"
            >
              {claimMutation.isPending ? "Spinning…" : "Spin"}
            </button>
            {claimMutation.isError && (
              <p className="mt-2 text-xs text-red-500 text-center">
                {typeof claimError === "string" ? claimError : "Could not spin right now. Please try again."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
