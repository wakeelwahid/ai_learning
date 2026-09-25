import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { battleApi, type ChallengeFriendResult } from "@/lib/api";
import { useAppSelector } from "@/store";
import { Swords, X, Copy, Check } from "lucide-react";

const SUBJECTS = ["Physics", "Chemistry", "Maths", "Biology"];
const DIFFICULTIES: ("easy" | "medium" | "hard")[] = ["easy", "medium", "hard"];
const TIME_OPTIONS_MIN = [10, 20, 30];
const STAKE_OPTIONS = [50, 100, 200, 500]; // min 50 — both players must hold the stake
// Mirrors the server's time→questions mapping (enforced backend-side)
const questionsForTime = (min: number) => (min >= 25 ? 20 : min >= 15 ? 15 : 7);

function FaceOffAvatar({ name, src, ring }: { name: string; src?: string | null; ring: string }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img src={src} alt={name} onError={() => setBroken(true)}
      className={`w-16 h-16 rounded-full object-cover ring-4 ${ring}`} />
  ) : (
    <div className={`w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xl font-black ring-4 ${ring}`}>
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

/** Both opponents' photos face-off — shown when setting up AND after sending. */
function FaceOff({ myName, myAvatar, friendName, friendAvatar }: {
  myName: string; myAvatar?: string | null; friendName: string; friendAvatar?: string | null;
}) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 mt-3">
      <div className="flex flex-col items-center gap-1.5 min-w-0">
        <FaceOffAvatar name={myName} src={myAvatar} ring="ring-violet-200 dark:ring-violet-800" />
        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">You</span>
      </div>
      <span className="text-xl font-black text-red-500 tracking-widest shrink-0">VS</span>
      <div className="flex flex-col items-center gap-1.5 min-w-0">
        <FaceOffAvatar name={friendName} src={friendAvatar} ring="ring-amber-200 dark:ring-amber-800" />
        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 max-w-[70px] sm:max-w-[90px] truncate">{friendName}</span>
      </div>
    </div>
  );
}

export default function ChallengeFriendModal({
  friend,
  onClose,
}: {
  friend: { id: string; name: string; avatarUrl?: string | null };
  onClose: () => void;
}) {
  const me = useAppSelector((s) => s.auth.user);
  const myAvatar =
    (me?.id ? localStorage.getItem(`avatar_${me.id}`) : null) ?? me?.avatar_url ?? null;
  const [subject, setSubject] = useState<string>("Physics");
  const [customSubject, setCustomSubject] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [timeMin, setTimeMin] = useState<number>(10);
  const [stakeXp, setStakeXp] = useState<number>(50);
  const [result, setResult] = useState<ChallengeFriendResult | null>(null);
  const [copied, setCopied] = useState(false);

  const effectiveSubject = (customSubject.trim() || subject).trim();

  const challengeMutation = useMutation({
    mutationFn: () =>
      battleApi
        .challengeFriend({
          friend_id: friend.id,
          ...(effectiveSubject ? { subject: effectiveSubject } : {}),
          difficulty,
          time_limit_sec: timeMin * 60,
          stake_xp: stakeXp,
        })
        .then((r) => r.data),
    onSuccess: (data) => setResult(data),
    onError: (e: any) => {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 403) {
        toast.error(typeof detail === "string" ? detail : "You can only challenge your friends.");
      } else {
        toast.error(typeof detail === "string" ? detail : "Could not send the challenge. Please try again.");
      }
    },
  });

  const copyCode = () => {
    if (!result) return;
    navigator.clipboard?.writeText(result.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    // !m-0 defeats any parent space-y margin so the fixed overlay stays at inset-0
    <div
      className="fixed inset-0 !m-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-4 sm:p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {result ? (
          /* ── Challenge sent: show the server-issued invite code ── */
          <div className="text-center animate-scale-in">
            <div className="text-5xl">⚔️</div>
            <h2 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">Challenge Sent!</h2>
            <FaceOff myName={me?.full_name ?? "You"} myAvatar={myAvatar} friendName={friend.name} friendAvatar={friend.avatarUrl} />
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Share this code — your friend also got a notification
            </p>
            <button
              onClick={copyCode}
              className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-violet-50 dark:bg-violet-900/20 border-2 border-dashed border-violet-300 dark:border-violet-700 text-2xl font-black tracking-[0.25em] text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
              title="Copy invite code"
            >
              {result.invite_code}
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 opacity-60" />}
            </button>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {result.question_count} Questions · {Math.round(result.time_limit_sec / 60)} Minutes
              {result.subject ? ` · ${result.subject}` : ""} — Win +{result.reward.win_xp} XP
              {(result.reward as any).win_edupoints ? ` & +${(result.reward as any).win_edupoints} EP` : ""}
              {(result.reward as any).loss_xp ? ` · Lose ${(result.reward as any).loss_xp} XP` : ""}
            </p>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `⚔️ I challenged you to a battle on EduLearn! Winner takes +${result.reward.win_xp} XP.\nTap to join instantly: ${window.location.origin}/battle/${result.invite_code}\n(or use code ${result.invite_code})`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex w-full items-center justify-center gap-2 py-2.5 rounded-2xl bg-green-500 hover:bg-green-600 text-white text-sm font-bold transition-colors"
            >
              Share on WhatsApp <span className="text-[11px] font-semibold opacity-80">(optional)</span>
            </a>
            <Link
              to="/battle"
              className="mt-2 block w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold hover:opacity-90 transition-opacity"
            >
              Go to Battle
            </Link>
          </div>
        ) : (
          /* ── Set up the challenge ── */
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center flex items-center justify-center gap-2">
              <Swords className="w-5 h-5 text-violet-500" /> Challenge {friend.name}
            </h2>
            <FaceOff myName={me?.full_name ?? "You"} myAvatar={myAvatar} friendName={friend.name} friendAvatar={friend.avatarUrl} />

            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Subject</p>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSubject(s); setCustomSubject(""); }}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                      subject === s && !customSubject.trim()
                        ? "bg-violet-600 text-white shadow-sm"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="Or type any subject…"
                className="input mt-2"
              />
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Difficulty</p>
              <div className="grid grid-cols-3 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${
                      difficulty === d
                        ? "bg-violet-600 text-white shadow-sm"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Time Limit</p>
              <div className="flex flex-wrap gap-2">
                {TIME_OPTIONS_MIN.map((m) => (
                  <button
                    key={m}
                    onClick={() => setTimeMin(m)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                      timeMin === m
                        ? "bg-violet-600 text-white shadow-sm"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {m} min · {questionsForTime(m)} Qs
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">XP Stake — winner takes it, loser pays it</p>
              <div className="flex flex-wrap gap-2">
                {STAKE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStakeXp(s)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                      stakeXp === s
                        ? "bg-amber-500 text-white shadow-sm"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {s} XP
                  </button>
                ))}
              </div>
            </div>

            {/* Stakes */}
            <div className="mt-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 space-y-1">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                🏆 Win: <span className="text-yellow-600 dark:text-yellow-400">+{stakeXp} XP</span> · +50 EduPoints
              </p>
              <p className="text-sm font-bold text-red-600 dark:text-red-400">📉 Lose: −{stakeXp} XP</p>
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                {questionsForTime(timeMin)} Questions · {timeMin} Minutes · Both players need at least {stakeXp} XP
              </p>
            </div>

            <button
              onClick={() => challengeMutation.mutate()}
              disabled={challengeMutation.isPending}
              className="mt-4 w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md"
            >
              {challengeMutation.isPending ? "Sending…" : "⚔️ Send Challenge"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
