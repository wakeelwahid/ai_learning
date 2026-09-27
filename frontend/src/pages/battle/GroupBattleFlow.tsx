import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { battleApi } from "@/lib/api";
import { store } from "@/store";
import { ArrowLeft, CheckCircle2, XCircle, Trophy, Zap, Users, Copy, Crown, RefreshCcw, BookOpen, Swords } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import UserAvatar from "@/components/UserAvatar";
import { Button } from "@/components/ui";

interface Props {
  battle: any;
  userId: string;
  displayName: string;
  onExit: () => void;
  isSpectator?: boolean;
}

interface Player {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  score: number;
  xp: number;
  correct_answers: number;
  rank?: number;
}

export default function GroupBattleFlow({ battle, userId, displayName, onExit, isSpectator = false }: Props) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"lobby" | "battle" | "finished">("lobby");
  const [players, setPlayers] = useState<Player[]>(
    (battle.participants ?? [])
      .filter((p: any) => !p.is_ai && p.user_id)
      .map((p: any, i: number) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url ?? null,
        score: p.score ?? 0,
        xp: p.xp_earned ?? 0,
        correct_answers: p.correct ?? 0,
        rank: p.rank ?? i + 1,
      }))
  );
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(battle.time_limit_sec ?? 300);
  const [results, setResults] = useState<any>(null);
  const [questionStart, setQuestionStart] = useState(0);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const phaseRef = useRef<"lobby" | "battle" | "finished">("lobby");

  // State (not a const) — the host can reroll the set in the lobby, and the
  // server pushes the fresh answer-stripped list via "questions_regenerated".
  const [questions, setQuestions] = useState<any[]>(battle.questions ?? []);
  const totalQ = questions.length;
  const q = questions[currentQ];
  const inviteCode = battle.invite_code;
  const isHost = battle.host_user_id === userId;

  const regenerateMutation = useMutation({
    mutationFn: () => battleApi.regenerateQuestions(battle.id).then((r) => r.data),
    onSuccess: (data: any) => {
      setQuestions(data?.questions ?? []);
      toast.success("🎲 New random questions ready!");
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Could not generate questions"),
  });

  // Keep phaseRef in sync so ws onclose can read it without stale closure
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Countdown timer during battle
  useEffect(() => {
    if (phase !== "battle") return;
    const t = setInterval(() => setTimeLeft((prev: number) => {
      if (prev <= 1) { clearInterval(t); return 0; }
      return prev - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // WebSocket connection — silent retry, inline status badge instead of toast
  useEffect(() => {
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      setWsStatus("connecting");
      const wsBase = (import.meta.env.VITE_WS_URL ?? "ws://localhost:8010").replace(/\/$/, "");
      const spectatorParam = isSpectator ? "&spectator=true" : "";
      // The server authenticates the socket via the JWT access token (WebSockets
      // can't carry an Authorization header from the browser), and derives the
      // caller's identity from it — user_id is no longer accepted for identity.
      const token = store.getState().auth.token ?? "";
      const ws = new WebSocket(
        `${wsBase}/api/v1/battles/${battle.id}/ws?token=${encodeURIComponent(token)}&display_name=${encodeURIComponent(displayName)}${spectatorParam}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setWsStatus("connected");
      };
      ws.onmessage = (event) => {
        try { handleWsMessage(JSON.parse(event.data)); } catch {}
      };
      ws.onerror = () => {
        // Don't toast — just let onclose handle reconnect
      };
      ws.onclose = () => {
        if (destroyed) return;
        if (phaseRef.current === "finished") return;
        retryRef.current += 1;
        if (retryRef.current > 8) {
          setWsStatus("error");
          toast.error("Lost connection. Please refresh.");
          return;
        }
        // Exponential backoff: 1s, 2s, 4s, capped at 8s
        const delay = Math.min(1000 * Math.pow(2, retryRef.current - 1), 8000);
        setWsStatus("connecting");
        setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      destroyed = true;
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle.id, userId]);

  const handleWsMessage = useCallback((msg: any) => {
    const payload = msg.payload ?? msg; // support both {type, payload} and flat messages
    switch (msg.type) {
      case "player_joined": {
        const p = payload.participant ?? payload;
        if (!p.user_id) break;
        setPlayers((prev) => {
          if (prev.find((x) => x.user_id === p.user_id)) return prev;
          return [...prev, { user_id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url ?? null, score: 0, xp: 0, correct_answers: 0, rank: prev.length + 1 }];
        });
        break;
      }
      case "player_left":
        setPlayers((prev) => prev.filter((p) => p.user_id !== (payload.user_id ?? msg.user_id)));
        break;
      case "battle_starting":
        toast.success(`Battle starting in ${payload.countdown_sec ?? 3} seconds!`);
        break;
      case "battle_started":
        setPhase("battle");
        setTimeLeft(payload.time_limit ?? battle.time_limit_sec ?? 300);
        break;
      case "answer_result": {
        // Server sends answer_result to the individual user; correct_answer is at top level
        const isCorrect = payload.correct ?? payload.is_correct;
        const ca = msg.correct_answer ?? payload.correct_answer ?? null;
        setCorrect(isCorrect);
        setCorrectAnswer(ca);
        setAnswered(true);
        if (isCorrect) setScore((s) => s + (payload.points ?? 100));
        break;
      }
      case "leaderboard_update": {
        const lb: any[] = payload.leaderboard ?? payload.standings ?? [];
        if (lb.length) {
          setPlayers(
            lb.map((s: any, i: number) => ({
              user_id: s.user_id,
              display_name: s.display_name,
              score: s.score ?? 0,
              xp: s.xp_earned ?? 0,
              correct_answers: s.correct ?? s.correct_answers ?? 0,
              rank: i + 1,
            }))
          );
          // Update own score from leaderboard
          const mine = lb.find((s: any) => s.user_id === userId);
          if (mine) setScore(mine.score ?? 0);
        }
        break;
      }
      case "questions_regenerated":
        // Host rolled a fresh set — replace the local list so everyone answers
        // the same questions the server will grade against.
        setQuestions(payload.questions ?? []);
        toast("🎲 New questions generated!", { icon: "🎲" });
        break;
      case "battle_finished":
        setResults(payload);
        setPhase("finished");
        break;
      case "error":
        toast.error(payload.detail ?? payload.message ?? "Battle error");
        break;
    }
  }, [userId, battle.time_limit_sec]);

  useEffect(() => {
    if (phase === "battle" && !answered) setQuestionStart(performance.now());
  }, [currentQ, phase]);

  const startMutation = useMutation({
    mutationFn: () => battleApi.start(battle.id, userId).then((r) => r.data),
    onError: () => toast.error("Could not start battle"),
  });

  const answerMutation = useMutation({
    mutationFn: (ans: string) => {
      const timeMs = Math.round(performance.now() - questionStart);
      return battleApi.submitAnswer(battle.id, userId, {
        battle_id: battle.id, question_idx: currentQ, answer: ans, time_taken_ms: timeMs,
      }).then((r) => r.data);
    },
    onSuccess: (data) => {
      if (!answered) {
        const isCorrect = data.is_correct ?? data.correct;
        setCorrect(isCorrect);
        setCorrectAnswer(data.correct_answer ?? null);
        setAnswered(true);
        if (isCorrect) setScore((s) => s + (data.points ?? 100));
      }
    },
    onError: () => toast.error("Answer submit failed"),
  });

  const handleAnswer = useCallback((opt: string) => {
    if (answered) return;
    setSelected(opt);
    answerMutation.mutate(opt);
  }, [answered]);

  const handleNext = () => {
    setSelected(null);
    setCorrect(null);
    setCorrectAnswer(null);
    setAnswered(false);
    if (currentQ + 1 >= totalQ) {
      battleApi.finish(battle.id).catch(() => {});
    } else {
      setCurrentQ((c) => c + 1);
    }
  };

  const copyCode = () => { navigator.clipboard.writeText(inviteCode); toast.success("Invite code copied!"); };

  const handleRematch = async (battleId: string) => {
    try {
      const { data } = await battleApi.rematch(battleId, userId, displayName);
      navigate(`/battle?join=${data.id}`);
      toast.success("Rematch created! Sharing battle code...");
    } catch { toast.error("Could not create rematch"); }
  };

  const timerMins = Math.floor(timeLeft / 60);
  const timerSecs = timeLeft % 60;

  // ── Lobby ─────────────────────────────────────────────────────────────────────
  if (phase === "lobby") {
    return (
      <div className="w-full space-y-5 animate-fade-in">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button onClick={onExit} className="flex items-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm flex-shrink-0">
            <ArrowLeft className="w-4 h-4" /> Exit
          </button>
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
            wsStatus === "connected" ? "bg-success-50 dark:bg-success-900/20 text-success-600 dark:text-success-400" :
            wsStatus === "error"     ? "bg-danger-50 dark:bg-danger-900/20 text-danger-500 dark:text-danger-400" :
                                      "bg-warning-50 dark:bg-warning-900/20 text-warning-600 dark:text-warning-400"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              wsStatus === "connected" ? "bg-success-500" :
              wsStatus === "error"     ? "bg-danger-500" :
                                        "bg-warning-400 animate-pulse"
            }`} />
            {wsStatus === "connected" ? "Live" : wsStatus === "error" ? "Disconnected" : "Connecting…"}
          </span>
        </div>

        <div className="xl:flex xl:gap-8 xl:items-start">
          {/* Left — invite code + player list */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="card text-center">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {battle.battle_type === "1v1" ? "1v1 Battle" : t("groupBattle")} Lobby
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                {battle.subject} · {battle.difficulty} · {totalQ}Q · {battle.time_limit_sec / 60}min
              </p>
              {inviteCode && (
                <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-lg sm:text-2xl font-mono font-bold tracking-wide sm:tracking-widest text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950 px-3 sm:px-4 py-2 rounded-xl break-all">
                    {inviteCode}
                  </span>
                  <button onClick={copyCode} className="flex-shrink-0 text-primary-400 hover:text-primary-600 dark:hover:text-primary-300">
                    <Copy className="w-5 h-5" />
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Share this code with friends to join</p>
            </div>

            <div className="card space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Users className="w-4 h-4" /> {t("waitingPlayers")} ({players.length + 1}/{battle.max_players ?? "∞"})
              </h3>
              <div className="flex items-center gap-2 p-2 bg-primary-50 dark:bg-primary-950/50 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-primary-200 dark:bg-primary-800 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-sm flex-shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-primary-700 dark:text-primary-300 truncate min-w-0 flex-1">{displayName} (You)</span>
                <span className="flex-shrink-0 text-xs bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400 px-2 py-0.5 rounded-full">Ready</span>
              </div>
              {players.filter((p) => p.user_id !== userId).map((p) => (
                <div key={p.user_id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={p.display_name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm flex-shrink-0">
                      {p.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate min-w-0 flex-1">{p.display_name}</span>
                  <span className="flex-shrink-0 w-2 h-2 rounded-full bg-success-400 animate-pulse" />
                </div>
              ))}
              {players.filter((p) => p.user_id !== userId).length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">Waiting for others to join...</p>
              )}
            </div>

            {/* Host can reroll the question set once someone has joined —
                same subject/topic/difficulty, fresh random questions. */}
            {isHost && players.filter((p) => p.user_id !== userId).length >= 1 && (
              <button
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                className="w-full py-2.5 rounded-xl bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 text-primary-700 dark:text-primary-300 text-sm font-bold hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors disabled:opacity-50"
              >
                {regenerateMutation.isPending ? "Generating…" : "🎲 Generate Random Questions"}
              </button>
            )}

            <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending} className="btn-primary w-full py-3">
              {startMutation.isPending ? "Starting..." : t("createRoom")}
            </button>
          </div>

          {/* Right sidebar — battle details */}
          <aside className="hidden xl:flex flex-col w-72 2xl:w-80 flex-shrink-0 sticky top-6 self-start space-y-4">
            <div className="card space-y-3">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Swords className="w-4 h-4 text-primary-500" /> Battle Details
              </h3>
              <div className="space-y-2.5 text-sm">
                {[
                  ["Subject", battle.subject ?? "General"],
                  ["Difficulty", battle.difficulty ?? "Medium"],
                  ["Questions", `${totalQ} questions`],
                  ["Time Limit", `${battle.time_limit_sec / 60} minutes`],
                  ["Mode", (battle.battle_type ?? "group").replace("_", " ")],
                  ["Max Players", battle.max_players ?? "Unlimited"],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">{label}</span>
                    <span className="font-semibold text-gray-900 dark:text-white capitalize">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card bg-primary-50 dark:bg-primary-950/30 border border-primary-100 dark:border-primary-800 space-y-2">
              <h3 className="text-xs font-bold text-primary-700 dark:text-primary-300 uppercase tracking-wide">How to Win</h3>
              <ul className="space-y-1.5 text-xs text-primary-800 dark:text-primary-300">
                {[
                  "Answer quickly for time-bonus points",
                  "Consecutive correct = combo multiplier",
                  "Top scorer wins the battle",
                  "All players earn XP on finish",
                ].map((tip) => (
                  <li key={tip} className="flex items-start gap-1.5">
                    <span className="text-primary-400 mt-0.5 flex-shrink-0">•</span> {tip}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // ── Finished ──────────────────────────────────────────────────────────────────
  if (phase === "finished") {
    const standings: Player[] = results?.participants ?? players;
    const myResult = standings.find((p: any) => p.user_id === userId);
    const won = myResult?.rank === 1 || standings[0]?.user_id === userId;
    const xpEarned = results?.xp_awarded ?? (won ? 500 : 25);

    const standingsCard = (
      <div className="card space-y-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-warning-500" /> Final Standings
        </h3>
        {standings.slice(0, 10).map((p: any, i: number) => (
          <div key={p.user_id} className={`flex items-center gap-3 p-2 rounded-xl ${p.user_id === userId ? "bg-primary-50 dark:bg-primary-950/50" : ""}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? "bg-warning-400 text-white" : i === 1 ? "bg-gray-300 text-gray-800" : i === 2 ? "bg-orange-300 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
              {i === 0 ? "👑" : i + 1}
            </span>
            <UserAvatar userId={p.user_id} name={p.display_name} src={p.avatar_url} sizeClass="w-7 h-7 text-xs" />
            <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
              {p.display_name}{p.user_id === userId ? " (You)" : ""}
            </span>
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-bold text-primary-700 dark:text-primary-300">{p.score}</div>
              <div className="text-[10px] text-warning-600 dark:text-warning-400">+{p.xp ?? 0} XP</div>
            </div>
          </div>
        ))}
      </div>
    );

    return (
      <div className="w-full pb-8 animate-fade-in">
        <div className="xl:flex xl:gap-8 xl:items-start">
          {/* Left — result banner + actions */}
          <div className="flex-1 min-w-0 space-y-5 py-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center">{t("battleComplete")}</h2>
            <div className={`rounded-2xl p-6 text-center text-white ${won ? "bg-warning-500" : "bg-primary-600"}`}>
              <div className="text-5xl mb-2">{won ? "🏆" : myResult?.rank === 2 ? "🥈" : myResult?.rank === 3 ? "🥉" : "🎮"}</div>
              <h2 className="text-2xl font-extrabold">{won ? "Victory!" : `Rank #${myResult?.rank ?? "—"}`}</h2>
              <p className="text-white/80 text-sm mt-1">Score: {myResult?.score ?? score} pts</p>
              <div className="mt-4 bg-white/15 rounded-xl px-4 py-2 inline-flex items-center gap-2 text-lg font-bold">
                <Zap className="w-5 h-5" /> +{xpEarned} XP
              </div>
            </div>

            {/* Standings — mobile only */}
            <div className="xl:hidden">{standingsCard}</div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={onExit} fullWidth>Back to Arena</Button>
              <Button
                variant="secondary"
                onClick={() => navigate(`/battle/review/${battle.id}?user_id=${userId}`)}
                fullWidth
              >
                <BookOpen className="w-4 h-4" /> Review
              </Button>
              <Button variant="secondary" onClick={() => handleRematch(battle.id)} fullWidth>
                <RefreshCcw className="w-4 h-4" /> Rematch
              </Button>
            </div>

            {/* Winner's social share — WhatsApp / Facebook / Telegram / X / native sheet */}
            {won && (() => {
              const shareText =
                `🏆 I just won a ${battle.subject ?? "quiz"} Battle on EduLearn! ` +
                `Score: ${myResult?.score ?? score} pts · +${xpEarned} XP. Think you can beat me?`;
              const shareUrl = window.location.origin;
              const enc = encodeURIComponent(shareText);
              const encUrl = encodeURIComponent(shareUrl);
              const links: [string, string, string][] = [
                ["WhatsApp", `https://wa.me/?text=${enc}%20${encUrl}`, "bg-green-500 hover:bg-green-600"],
                ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${encUrl}&quote=${enc}`, "bg-blue-600 hover:bg-blue-700"],
                ["Telegram", `https://t.me/share/url?url=${encUrl}&text=${enc}`, "bg-sky-500 hover:bg-sky-600"],
                ["X", `https://twitter.com/intent/tweet?text=${enc}&url=${encUrl}`, "bg-gray-900 hover:bg-black"],
              ];
              return (
                <div className="card space-y-3">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">📲 Share your Victory</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {links.map(([label, href, cls]) => (
                      <a key={label} href={href} target="_blank" rel="noreferrer"
                        className={`${cls} text-white text-sm font-bold rounded-xl py-2.5 text-center transition-colors`}>
                        {label}
                      </a>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      // Native share sheet (mobile browsers list Instagram etc.);
                      // falls back to copying the brag text.
                      if (navigator.share) navigator.share({ text: shareText, url: shareUrl }).catch(() => {});
                      else { navigator.clipboard?.writeText(`${shareText} ${shareUrl}`); toast.success("Copied — paste it anywhere (Instagram, etc.)"); }
                    }}
                    className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition-colors"
                  >
                    Instagram / More…
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Right sidebar — standings + XP */}
          <aside className="hidden xl:flex flex-col w-72 2xl:w-80 flex-shrink-0 sticky top-6 self-start space-y-4 pt-6">
            {standingsCard}
            <div className="card bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800">
              <h3 className="text-sm font-bold text-warning-800 dark:text-warning-300 flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-warning-500" /> XP Summary
              </h3>
              <div className="space-y-1.5 text-xs">
                {[
                  ["Participation", "+25 XP"],
                  [won ? "Victory Bonus" : "Placement Bonus", `+${Math.max(0, xpEarned - 25)} XP`],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between text-warning-700 dark:text-warning-400">
                    <span>{label}</span><span>{val}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1.5 border-t border-warning-200 dark:border-warning-700 font-bold text-warning-800 dark:text-warning-300">
                  <span>Total Earned</span><span>+{xpEarned} XP</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // ── Battle ────────────────────────────────────────────────────────────────────
  if (!q) return <div className="text-center py-20 text-gray-500 dark:text-gray-400">Loading questions...</div>;

  const progress = totalQ > 0 ? ((currentQ + (answered ? 1 : 0)) / totalQ) * 100 : 0;
  const myRankInLb = players.findIndex((p) => p.user_id === userId) + 1 || null;

  // Compact player row used in both mobile strip and desktop sidebar
  const renderPlayerRow = (p: Player, i: number) => (
    <div key={p.user_id} className={`flex items-center gap-2 py-1.5 ${p.user_id === userId ? "bg-primary-50 dark:bg-primary-950/40 rounded-lg px-2" : ""}`}>
      <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${i === 0 ? "text-warning-500" : i === 1 ? "text-gray-400 dark:text-gray-500" : i === 2 ? "text-orange-400" : "text-gray-400 dark:text-gray-500"}`}>
        {i === 0 ? "👑" : `#${i + 1}`}
      </span>
      <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
        {p.display_name.charAt(0).toUpperCase()}
      </div>
      <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{p.display_name}{p.user_id === userId ? " ★" : ""}</span>
      <span className="text-xs font-bold text-primary-600 dark:text-primary-400">{p.score}</span>
    </div>
  );

  const selfRow = !players.find((p) => p.user_id === userId) ? (
    <div className="flex items-center gap-2 py-1.5 bg-primary-50 dark:bg-primary-950/40 rounded-lg px-2">
      <span className="text-xs font-bold w-5 text-center text-gray-400 dark:text-gray-500 flex-shrink-0">—</span>
      <div className="w-6 h-6 rounded-full bg-primary-200 dark:bg-primary-800 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-300">{displayName.charAt(0).toUpperCase()}</div>
      <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate font-semibold">{displayName} ★</span>
      <span className="text-xs font-bold text-primary-600 dark:text-primary-400">{score}</span>
    </div>
  ) : null;

  return (
    <div className="w-full space-y-2 sm:space-y-3 animate-fade-in">
      {/* Live score banner — Question X/Y • Time Left • Score • Rank */}
      <div className="rounded-2xl bg-primary-600 p-3 sm:p-4 text-white">
        <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 sm:gap-3 text-center">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-primary-200 font-semibold uppercase tracking-wide truncate">Question</p>
            <p className="text-lg sm:text-xl font-bold leading-tight">{currentQ + 1}<span className="text-xs sm:text-sm text-primary-300">/{totalQ}</span></p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-primary-200 font-semibold uppercase tracking-wide truncate">Time Left</p>
            <p className={`text-lg sm:text-xl font-bold font-mono leading-tight ${timeLeft < 30 ? "text-danger-300 animate-pulse" : ""}`}>
              {timerMins.toString().padStart(2, "0")}:{timerSecs.toString().padStart(2, "0")}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-primary-200 font-semibold uppercase tracking-wide truncate">{t("yourScore")}</p>
            <p className="text-lg sm:text-xl font-bold leading-tight">{score}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-primary-200 font-semibold uppercase tracking-wide truncate">Rank</p>
            <p className="text-lg sm:text-xl font-bold leading-tight flex items-center justify-center gap-0.5">
              {myRankInLb ? <><Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-warning-300 flex-shrink-0" />#{myRankInLb}</> : "—"}
            </p>
          </div>
        </div>
        {/* Progress bar + WS status */}
        <div className="mt-2 sm:mt-3 flex items-center gap-2">
          <div className="flex-1 h-1 sm:h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          {wsStatus !== "connected" && (
            <span className={`flex items-center gap-1 text-[10px] font-semibold flex-shrink-0 ${wsStatus === "error" ? "text-danger-300" : "text-warning-200"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === "error" ? "bg-danger-400" : "bg-warning-300 animate-pulse"}`} />
              {wsStatus === "error" ? "Offline" : "…"}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Question + options */}
        <div className="lg:col-span-2 space-y-2 sm:space-y-3">
          {/* Subject badge */}
          <div className="flex items-center gap-2">
            <button onClick={onExit} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ArrowLeft className="w-4 h-4" /></button>
            {q.subject && <span className="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full font-medium">{q.subject}</span>}
            {q.topic && <span className="text-xs text-gray-400 dark:text-gray-500">{q.topic}</span>}
          </div>
          <div className="card !p-3 sm:!p-4">
            <p className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white leading-snug">{q.text}</p>
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            {(q.options ?? []).map((opt: string, i: number) => {
              let cls = "card border-2 transition-all text-sm font-medium text-gray-700 dark:text-gray-300";
              if (isSpectator) {
                cls += " cursor-default opacity-70";
              } else if (answered) {
                if (opt === correctAnswer) cls = "card border-2 border-success-500 bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-300 font-semibold";
                else if (opt === selected && !correct) cls = "card border-2 border-danger-400 bg-danger-50 dark:bg-danger-900/20 text-danger-600 dark:text-danger-300";
                else cls = "card border-2 border-gray-100 dark:border-gray-700 opacity-50 text-gray-500 dark:text-gray-400";
              } else if (opt === selected) {
                cls = "card border-2 border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-semibold cursor-pointer hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30";
              } else {
                cls += " cursor-pointer hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20";
              }
              return (
                <button
                  key={i}
                  className={`${cls} w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl`}
                  onClick={() => !isSpectator && handleAnswer(opt)}
                  disabled={isSpectator}
                >
                  <span className="mr-2 text-gray-400 dark:text-gray-500 font-bold">{String.fromCharCode(65 + i)}.</span> {opt}
                </button>
              );
            })}
          </div>
          {isSpectator && (
            <div className="rounded-xl px-3 py-2 text-xs text-center text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              👁 Spectating — you can watch but not answer
            </div>
          )}
          {!isSpectator && answered && (
            <div className={`rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm flex items-center gap-2 flex-wrap ${correct ? "bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-800" : "bg-danger-50 dark:bg-danger-900/20 text-danger-600 dark:text-danger-300 border border-danger-200 dark:border-danger-800"}`}>
              {correct ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
              <span className="font-medium flex-1 min-w-[100px] text-xs sm:text-sm break-words">{correct ? "Correct! +100 pts" : `Wrong. Answer: ${correctAnswer ?? "—"}`}</span>
              <button onClick={handleNext} className="text-xs btn-primary px-3 py-1.5 flex-shrink-0">
                {currentQ + 1 >= totalQ ? t("submit") : t("next")}
              </button>
            </div>
          )}

          {/* Mobile-only compact leaderboard strip (hidden on lg+) */}
          <div className="lg:hidden card !p-2.5 space-y-1">
            <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-1">
              <Trophy className="w-3 h-3 text-warning-500" /> Live Rankings
            </h3>
            {selfRow}
            {players.slice(0, 3).map((p, i) => renderPlayerRow(p, i))}
            {players.length === 0 && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center py-1">Waiting for players...</p>
            )}
          </div>
        </div>

        {/* Desktop-only live leaderboard sidebar */}
        <div className="hidden lg:block card space-y-2">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5 text-warning-500" /> Live Rankings
          </h3>
          {selfRow}
          {players.slice(0, 8).map((p, i) => renderPlayerRow(p, i))}
          {players.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Waiting for players to answer...</p>
          )}
        </div>
      </div>
    </div>
  );
}
