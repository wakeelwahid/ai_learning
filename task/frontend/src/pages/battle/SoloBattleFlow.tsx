import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { battleApi } from "@/lib/api";
import {
  ArrowLeft, CheckCircle2, XCircle, Zap, Timer, Star,
  RefreshCcw, BookOpen, Target, TrendingUp,
} from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button, Card, Badge } from "@/components/ui";

interface Props {
  battle: any;
  userId: string;
  onExit: () => void;
}

export default function SoloBattleFlow({ battle, userId, onExit }: Props) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [started, setStarted] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [_xp, setXp] = useState(0);
  const [timeLeft, setTimeLeft] = useState(battle.time_limit_sec ?? 300);
  const [finished, setFinished] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [questionStart, setQuestionStart] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const questions: any[] = battle.questions ?? [];
  const totalQ = questions.length;
  const q = questions[currentQ];
  const finishRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!started || finished) return;
    const timer = setInterval(() => setTimeLeft((prev: number) => {
      if (prev <= 1) { clearInterval(timer); finishRef.current?.(); return 0; }
      return prev - 1;
    }), 1000);
    return () => clearInterval(timer);
  }, [started, finished]);

  useEffect(() => {
    if (started && !answered) setQuestionStart(performance.now());
  }, [currentQ, started]);

  const startMutation = useMutation({
    mutationFn: () => battleApi.start(battle.id, userId).then((r) => r.data),
    onSuccess: () => setStarted(true),
    onError: () => toast.error("Could not start battle"),
  });

  const answerMutation = useMutation({
    mutationFn: (ans: string) => {
      const timeMs = Math.round(performance.now() - questionStart);
      return battleApi.submitAnswer(battle.id, userId, {
        battle_id: battle.id, question_idx: currentQ,
        answer: ans, time_taken_ms: timeMs,
      }).then((r) => r.data);
    },
    onSuccess: (data) => {
      const isCorrect = data.is_correct ?? data.correct;
      setCorrect(isCorrect);
      setCorrectAnswer(data.correct_answer ?? null);
      setAnswered(true);
      if (isCorrect) {
        setScore((s) => s + (data.points ?? 100));
        setCorrectCount((c) => c + 1);
        setXp((x) => x + 10);
      }
    },
  });

  const finishMutation = useMutation({
    mutationFn: () => battleApi.finish(battle.id).then((r) => r.data),
    onSuccess: (data) => { setResults(data); setFinished(true); },
    onError: () => { setFinished(true); },
  });

  finishRef.current = () => finishMutation.mutate();

  const handleAnswer = useCallback((option: string) => {
    if (answered) return;
    setSelected(option);
    answerMutation.mutate(option);
  }, [answered]);

  const handleNext = () => {
    setSelected(null); setCorrect(null); setCorrectAnswer(null); setAnswered(false);
    if (currentQ + 1 >= totalQ) finishMutation.mutate();
    else setCurrentQ((c) => c + 1);
  };

  const handleRematch = async () => {
    try {
      const { data } = await battleApi.rematch(battle.id, userId, battle.display_name ?? "Student");
      navigate(`/battle?join=${data.id}`);
      toast.success("Rematch created!");
    } catch { toast.error("Could not create rematch"); }
  };

  const handleReview = () => navigate(`/battle/review/${battle.id}?user_id=${userId}`);

  const progress = totalQ > 0 ? ((currentQ + (answered ? 1 : 0)) / totalQ) * 100 : 0;
  const timerMins = Math.floor(timeLeft / 60);
  const timerSecs = timeLeft % 60;
  const timeCritical = timeLeft < 30;

  // ── FINISHED ──────────────────────────────────────────────────────────────────
  if (finished) {
    const myResult  = results?.participants?.find((p: any) => p.user_id === userId);
    const aiResult  = results?.participants?.find((p: any) => p.is_ai);
    const won       = myResult && aiResult ? myResult.score > aiResult.score : myResult?.rank === 1;
    const xpEarned  = results?.xp_awarded?.[userId] ?? (won ? 125 : 25);
    const timeTaken = battle.time_limit_sec - timeLeft;
    const timeMins2 = Math.floor(timeTaken / 60);
    const timeSecs2 = timeTaken % 60;
    const accuracy  = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;

    return (
      <div className="w-full animate-fade-in pb-8">
        <div className="xl:flex xl:gap-8 xl:items-start">
          {/* Left */}
          <div className="flex-1 min-w-0 space-y-5">
            <div className={`rounded-2xl p-6 sm:p-8 text-white ${won ? "bg-primary-600" : "bg-gray-700"}`}>
              <div className="text-5xl mb-3 text-center">{won ? "🏆" : "😤"}</div>
              <h2 className="text-2xl sm:text-3xl font-bold text-center">{won ? "You Won!" : "Better Luck Next Time!"}</h2>
              <p className="text-white/80 mt-1 text-sm text-center">{won ? "You beat the AI!" : "AI got you this time"}</p>
              <div className="mt-4 bg-white/15 rounded-xl p-3 text-lg font-bold flex items-center justify-center gap-2">
                <Zap className="w-5 h-5" /> +{xpEarned} XP earned
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t("yourScore"),      value: myResult?.score ?? score,        icon: Star, color: "text-primary-500" },
                { label: "AI Score",          value: aiResult?.score ?? "—",          icon: Star, color: "text-gray-400" },
                { label: "Accuracy",          value: `${accuracy}%`,                  icon: Target, color: "text-success-500" },
                { label: "Time Taken",        value: `${timeMins2}:${timeSecs2.toString().padStart(2, "0")}`, icon: Timer, color: "text-warning-500" },
              ].map(({ label, value, icon: Icon, color }) => (
                <Card key={label} className="text-center">
                  <Icon className={`w-5 h-5 mx-auto mb-2 ${color}`} />
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                </Card>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={onExit} className="flex-1">Back to Arena</Button>
              <Button onClick={handleReview} variant="secondary" className="flex items-center justify-center gap-2 flex-1">
                <BookOpen className="w-4 h-4" /> Review
              </Button>
              <Button onClick={handleRematch} variant="secondary" className="flex items-center justify-center gap-2 flex-1">
                <RefreshCcw className="w-4 h-4" /> Rematch
              </Button>
            </div>
          </div>

          {/* Right sidebar (xl+) */}
          <aside className="hidden xl:flex flex-col w-72 flex-shrink-0 sticky top-6 self-start space-y-4">
            <Card>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Battle Summary</p>
              <ul className="space-y-3 text-sm">
                <li className="flex justify-between"><span className="text-gray-500">Questions</span><span className="font-semibold text-gray-900 dark:text-white">{totalQ}</span></li>
                <li className="flex justify-between"><span className="text-gray-500">Correct</span><span className="font-semibold text-success-600">{correctCount}</span></li>
                <li className="flex justify-between"><span className="text-gray-500">Wrong</span><span className="font-semibold text-danger-500">{totalQ - correctCount}</span></li>
                <li className="flex justify-between"><span className="text-gray-500">Accuracy</span><span className="font-semibold text-primary-600">{accuracy}%</span></li>
                <li className="flex justify-between"><span className="text-gray-500">Subject</span><span className="font-semibold text-gray-900 dark:text-white capitalize">{battle.subject}</span></li>
                <li className="flex justify-between"><span className="text-gray-500">Difficulty</span><span className="font-semibold text-gray-900 dark:text-white capitalize">{battle.difficulty}</span></li>
              </ul>
            </Card>
            <Card className="text-center bg-primary-50 dark:bg-primary-900/20 border-primary-100 dark:border-primary-900/40">
              <Zap className="w-8 h-8 mx-auto mb-2 text-primary-500" />
              <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">+{xpEarned} XP</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">earned this battle</p>
            </Card>
          </aside>
        </div>
      </div>
    );
  }

  // ── PRE-START ─────────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="w-full animate-fade-in pb-8">
        <div className="xl:flex xl:gap-8 xl:items-start xl:justify-center">
          <div className="w-full xl:max-w-2xl space-y-5">
            <div className="rounded-2xl bg-primary-600 p-6 sm:p-8 text-white text-center">
              <div className="text-6xl mb-4">🤖</div>
              <h2 className="text-2xl sm:text-3xl font-bold">{t("soloChallenge")}</h2>
              <p className="text-primary-200 text-sm mt-2">{totalQ} questions · {battle.difficulty} difficulty · {battle.time_limit_sec / 60} min</p>
              <p className="text-primary-200 text-sm mt-1 font-medium">{battle.subject}</p>
              <div className="mt-5 grid grid-cols-1 xs:grid-cols-3 gap-2 xs:gap-3">
                {[
                  { label: "Questions", value: totalQ },
                  { label: "Difficulty", value: battle.difficulty },
                  { label: "Time", value: `${battle.time_limit_sec / 60}m` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white/15 rounded-xl py-2.5 px-2 min-w-0">
                    <p className="text-white text-sm font-bold capitalize truncate">{value}</p>
                    <p className="text-primary-200 text-[10px] mt-0.5 truncate">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <Card>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary-500" /> Scoring Bonuses
              </p>
              <div className="space-y-2.5">
                {[
                  { icon: "⚡", text: "Speed bonus: answer faster for extra points" },
                  { icon: "🎯", text: <>Beat the AI to earn <strong className="text-primary-600 dark:text-primary-400">+100 XP</strong></> },
                  { icon: "🏆", text: <>Perfect accuracy: extra <strong className="text-success-600 dark:text-success-400">+50 XP</strong></> },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <span className="text-lg flex-shrink-0">{item.icon}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </Card>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={onExit} variant="secondary" className="flex-1 flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button onClick={() => startMutation.mutate()} isLoading={startMutation.isPending} className="flex-1 py-3 text-sm">
                {startMutation.isPending ? "Starting..." : t("startQuiz")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!q) return <div className="text-center py-20 text-gray-500 dark:text-gray-400">Loading questions...</div>;

  // ── ACTIVE QUIZ ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-4 animate-fade-in pb-8">
      {/* Top stats bar — full width */}
      <div className="rounded-2xl bg-primary-600 p-4 text-white">
        <div className="grid grid-cols-3 gap-1.5 xs:gap-3 text-center">
          <div className="min-w-0">
            <p className="text-[9px] xs:text-[10px] text-primary-200 font-semibold uppercase tracking-wide truncate">Question</p>
            <p className="text-base xs:text-xl font-bold">{currentQ + 1}<span className="text-xs sm:text-sm text-primary-300">/{totalQ}</span></p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] xs:text-[10px] text-primary-200 font-semibold uppercase tracking-wide truncate">Time Left</p>
            <p className={`text-base xs:text-xl font-bold font-mono ${timeCritical ? "text-danger-300 animate-pulse" : ""}`}>
              {timerMins.toString().padStart(2, "0")}:{timerSecs.toString().padStart(2, "0")}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] xs:text-[10px] text-primary-200 font-semibold uppercase tracking-wide truncate">{t("yourScore")}</p>
            <p className="text-base xs:text-xl font-bold">{score}</p>
          </div>
        </div>
        <div className="mt-3 w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* 2-col at xl */}
      <div className="xl:flex xl:gap-6 xl:items-start">

        {/* LEFT: question + options */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={onExit} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            {q.subject && <Badge variant="primary">{q.subject}</Badge>}
            {q.topic && <span className="text-xs text-gray-400 dark:text-gray-500">{q.topic}</span>}
          </div>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant={
                battle.difficulty === "easy" ? "success"
                : battle.difficulty === "hard" ? "danger"
                : "warning"
              }>{battle.difficulty}</Badge>
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">Q{currentQ + 1} of {totalQ}</span>
            </div>
            <p className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white leading-snug">{q.text}</p>
          </Card>

          <div className="space-y-2">
            {(q.options ?? []).map((opt: string, i: number) => {
              let cls = "w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium cursor-pointer ";
              if (answered) {
                if (opt === correctAnswer) cls += "border-success-500 bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-400 font-semibold";
                else if (opt === selected && !correct) cls += "border-danger-400 bg-danger-50 dark:bg-danger-900/20 text-danger-600 dark:text-danger-400";
                else cls += "border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 opacity-50 text-gray-500 dark:text-gray-500";
              } else if (opt === selected) {
                cls += "border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-semibold";
              } else {
                cls += "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20";
              }
              return (
                <button key={i} className={cls} onClick={() => handleAnswer(opt)} disabled={answered}>
                  <span className="mr-2 text-gray-400 font-bold">{String.fromCharCode(65 + i)}.</span> {opt}
                </button>
              );
            })}
          </div>

          {answered && (
            <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2 flex-wrap ${correct ? "bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-400 border border-success-200 dark:border-success-800" : "bg-danger-50 dark:bg-danger-900/20 text-danger-600 dark:text-danger-400 border border-danger-200 dark:border-danger-800"}`}>
              {correct ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <XCircle className="w-5 h-5 flex-shrink-0" />}
              <span className="font-medium flex-1 min-w-[100px] break-words">{correct ? "Correct! +100 pts" : `Wrong. Answer: ${correctAnswer ?? "—"}`}</span>
              <Button onClick={handleNext} size="sm" className="ml-auto text-xs px-4 py-1.5 flex-shrink-0">
                {currentQ + 1 >= totalQ ? t("submit") : t("next")}
              </Button>
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR (xl+) */}
        <aside className="hidden xl:flex flex-col w-64 2xl:w-72 flex-shrink-0 sticky top-6 self-start space-y-4">
          {/* Live timer */}
          <div className={`rounded-2xl border-2 p-5 text-center ${timeCritical ? "border-danger-400 bg-danger-50 dark:bg-danger-900/20" : "border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1 text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1">
              <Timer className="w-3 h-3" /> Time Left
            </p>
            <p className={`text-5xl font-bold font-mono leading-none ${timeCritical ? "text-danger-500 animate-pulse" : "text-primary-600 dark:text-primary-400"}`}>
              {timerMins.toString().padStart(2, "0")}:{timerSecs.toString().padStart(2, "0")}
            </p>
            {timeCritical && <p className="text-xs text-danger-400 mt-1.5 font-semibold animate-pulse">Hurry up!</p>}
          </div>

          {/* Score card */}
          <Card>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">Live Score</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2.5 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">You</span>
                <span className="text-lg font-bold text-primary-600 dark:text-primary-400">{score}</span>
              </div>
              <div className="flex justify-between items-center p-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">🤖 AI</span>
                <span className="text-lg font-bold text-gray-500 dark:text-gray-400">—</span>
              </div>
            </div>
          </Card>

          {/* Progress */}
          <Card>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">Progress</p>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>Question {currentQ + 1} of {totalQ}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex gap-2 mt-2">
                <div className="flex-1 text-center bg-success-50 dark:bg-success-900/20 rounded-lg py-1.5">
                  <p className="text-sm font-bold text-success-600 dark:text-success-400">{correctCount}</p>
                  <p className="text-[10px] text-success-500">Correct</p>
                </div>
                <div className="flex-1 text-center bg-danger-50 dark:bg-danger-900/20 rounded-lg py-1.5">
                  <p className="text-sm font-bold text-danger-500">{currentQ - correctCount + (answered ? 0 : 0)}</p>
                  <p className="text-[10px] text-danger-400">Wrong</p>
                </div>
              </div>
            </div>
          </Card>
        </aside>

      </div>
    </div>
  );
}
