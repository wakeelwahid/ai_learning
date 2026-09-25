import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useBlocker } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { quizApi, aiApi, referralApi, shareApi } from "@/lib/api";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import StudyLimitBanner from "@/components/StudyLimitBanner";
import { useStudyHeartbeat } from "@/hooks/useStudyHeartbeat";
import { useStudyTime } from "@/hooks/useStudyTime";
import {
  CheckCircle,
  XCircle,
  Clock,
  Brain,
  ChevronDown,
  ChevronUp,
  Loader2,
  Flag,
  Grid3X3,
  X,
  AlertTriangle,
  Pause,
  Play,
  Share2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui";
import UpgradePrompt from "@/components/ui/UpgradePrompt";

function WhatsAppShareCard({ percentage, score, total, referralCode, onShare }: {
  percentage: number;
  score: number;
  total: number;
  referralCode?: string;
  onShare?: () => void;
}) {
  const referralLink = referralCode
    ? `https://edulearn.app/join?ref=${referralCode}`
    : "https://edulearn.app";

  const emoji = percentage >= 90 ? "🏆" : percentage >= 70 ? "🌟" : "📚";
  const codeLine = referralCode ? `\n\nUse my code ${referralCode} when you join!` : "";
  const text = encodeURIComponent(
    `${emoji} I just scored ${score}/${total} (${percentage.toFixed(0)}%) on EduLearn!\n\nJoin me and ace your studies: ${referralLink}${codeLine}`
  );
  const waUrl = `https://wa.me/?text=${text}`;

  return (
    <div className="card border border-success-200 dark:border-success-800 bg-success-50 dark:bg-success-900/10">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-success-500 flex items-center justify-center flex-shrink-0">
          <Share2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900 dark:text-white">Share your score!</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Challenge your friends on WhatsApp</p>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 mb-3 border border-success-100 dark:border-success-800">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {emoji} I just scored <span className="font-semibold text-success-700 dark:text-success-400">{score}/{total} ({percentage.toFixed(0)}%)</span> on EduLearn!
          {referralCode && (
            <span className="text-primary-600 dark:text-primary-400"> Join me: {referralLink}</span>
          )}
        </p>
      </div>
      <a
        href={waUrl}
        target="_blank"
        rel="noreferrer"
        onClick={onShare}
        className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#20b858] text-white font-semibold py-3 px-4 rounded-xl transition-colors text-sm"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.115 1.522 5.847L0 24l6.335-1.502A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.661-.5-5.19-1.373l-.372-.22-3.862.916.978-3.765-.242-.39A9.946 9.946 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
        </svg>
        Share on WhatsApp
      </a>
    </div>
  );
}

interface MistakeExplanation {
  question: string;
  correct_answer: string;
  explanation: string;
  tip: string;
  concept: string;
}

type QuestionStatus = "not-visited" | "answered" | "marked" | "visited-unanswered";

interface SavedQuizState {
  currentQ: number;
  answers: Record<string, string>;
  markedForReview: string[];
  visitedQuestions: string[];
  timeLeft: number;
}

// ── Question Palette Sidebar ──────────────────────────────────────────────────

interface PaletteProps {
  questions: any[];
  currentQ: number;
  answers: Record<string, string>;
  markedForReview: Set<string>;
  visitedQuestions: Set<string>;
  onJump: (idx: number) => void;
  onClose?: () => void;
}

function QuestionPalette({
  questions,
  currentQ,
  answers,
  markedForReview,
  visitedQuestions,
  onJump,
  onClose,
}: PaletteProps) {
  function getStatus(q: any, idx: number): QuestionStatus {
    if (markedForReview.has(q.id)) return "marked";
    if (answers[q.id]) return "answered";
    if (visitedQuestions.has(q.id) || idx === currentQ) return "visited-unanswered";
    return "not-visited";
  }

  function statusClass(status: QuestionStatus, isCurrent: boolean): string {
    const ring = isCurrent ? " ring-2 ring-offset-1 ring-primary-500 dark:ring-offset-gray-900" : "";
    switch (status) {
      case "answered":
        return "bg-success-500 text-white" + ring;
      case "marked":
        return "bg-warning-400 text-white" + ring;
      case "visited-unanswered":
        return "bg-danger-400 text-white" + ring;
      default:
        return "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200" + ring;
    }
  }

  return (
    <div className="card !p-3 sm:!p-4 lg:!p-5 w-full lg:w-64 lg:flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
          <Grid3X3 className="w-4 h-4" /> Question Palette
        </h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-1 mb-3 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-gray-200 dark:bg-gray-700 inline-block" /> Not visited
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-success-500 inline-block" /> Answered
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-warning-400 inline-block" /> Marked
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-danger-400 inline-block" /> Skipped
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {questions.map((q, idx) => {
          const status = getStatus(q, idx);
          return (
            <button
              key={q.id}
              onClick={() => onJump(idx)}
              className={`aspect-square w-full min-w-0 rounded-md text-xs font-semibold transition-all ${statusClass(
                status,
                idx === currentQ
              )}`}
              title={`Question ${idx + 1}: ${status.replace("-", " ")}`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <div className="flex justify-between">
          <span>Answered</span>
          <span className="font-medium text-success-600 dark:text-success-400">
            {questions.filter((q) => answers[q.id] && !markedForReview.has(q.id)).length}/
            {questions.length}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Marked for review</span>
          <span className="font-medium text-warning-600 dark:text-warning-400">{markedForReview.size}</span>
        </div>
        <div className="flex justify-between">
          <span>Not attempted</span>
          <span className="font-medium text-gray-600 dark:text-gray-300">
            {questions.filter((q) => !answers[q.id]).length}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main QuizPage ─────────────────────────────────────────────────────────────

export default function QuizPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const user = useAppSelector((s) => s.auth.user);
  const { t } = useLanguage();
  const { loading: subLoading } = useSubscription();
  const queryClient = useQueryClient();

  // Core quiz state
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  // Real referral code for the WhatsApp share card — auth_service's
  // /auth/me never returns a `referral_code` field, so this must be
  // fetched from referral_service directly rather than trusted off `user`.
  const { data: referralData } = useQuery({
    queryKey: ["my-referral-code", user?.id],
    queryFn: () => referralApi.getCode(user!.id).then((r) => r.data),
    enabled: !!user?.id && (result?.percentage ?? 0) >= 70,
  });
  const [currentQ, setCurrentQ] = useState(0);
  const [analysis, setAnalysis] = useState<MistakeExplanation[] | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // New feature state
  const [timeLeft, setTimeLeft] = useState(60);
  const [_isTimerActive, setIsTimerActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
  const [visitedQuestions, setVisitedQuestions] = useState<Set<string>>(new Set());
  const [showPalette, setShowPalette] = useState(false);
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isQuizActive = !!attemptId && !result;
  useStudyHeartbeat(isQuizActive);
  const { limitReached } = useStudyTime();

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isRealQuiz = !!quizId && UUID_RE.test(quizId);

  const storageKey = `quiz_state_${quizId}_${user?.id ?? "demo"}`;

  const { data: questions, isLoading, isError, refetch: refetchQuestions } = useQuery({
    queryKey: ["quiz-questions", quizId],
    queryFn: () => quizApi.questions(quizId!).then((r) => r.data),
    enabled: isRealQuiz,
  });

  const activeQuestions = questions ?? [];

  // ── localStorage persistence ───────────────────────────────────────────────

  const saveState = useCallback(() => {
    if (!isQuizActive) return;
    const state: SavedQuizState = {
      currentQ,
      answers,
      markedForReview: Array.from(markedForReview),
      visitedQuestions: Array.from(visitedQuestions),
      timeLeft,
    };
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [isQuizActive, currentQ, answers, markedForReview, visitedQuestions, timeLeft, storageKey]);

  // Save on state changes while quiz is active
  useEffect(() => {
    if (isQuizActive) saveState();
  }, [currentQ, answers, markedForReview, visitedQuestions, saveState, isQuizActive]);

  // On mount: check for saved state and offer resume
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed: SavedQuizState = JSON.parse(saved);
        toast(
          (toastObj) => (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Resume where you left off?</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCurrentQ(parsed.currentQ);
                    setAnswers(parsed.answers);
                    setMarkedForReview(new Set(parsed.markedForReview));
                    setVisitedQuestions(new Set(parsed.visitedQuestions));
                    setTimeLeft(parsed.timeLeft ?? 60);
                    toast.dismiss(toastObj.id);
                  }}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700"
                >
                  Resume
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem(storageKey);
                    toast.dismiss(toastObj.id);
                  }}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-300"
                >
                  Start fresh
                </button>
              </div>
            </div>
          ),
          { duration: 10000, id: "resume-quiz" }
        );
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Per-question timer ─────────────────────────────────────────────────────

  const advanceQuestion = useCallback(() => {
    setVisitedQuestions((prev) => {
      const q = activeQuestions[currentQ];
      if (q) {
        const next = new Set(prev);
        next.add(q.id);
        return next;
      }
      return prev;
    });
    setCurrentQ((prev) => {
      if (prev < activeQuestions.length - 1) return prev + 1;
      return prev; // last question — don't auto-advance, just let timer expire visually
    });
    setTimeLeft(60);
  }, [activeQuestions, currentQ]);

  // Start/reset timer whenever question changes or quiz starts
  useEffect(() => {
    if (!isQuizActive || isPaused) return;

    setIsTimerActive(true);
    setTimeLeft(60);

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          advanceQuestion();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQ, isQuizActive, isPaused]);

  // Pause/resume timer
  useEffect(() => {
    if (!isQuizActive) return;
    if (isPaused) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsTimerActive(false);
    }
  }, [isPaused, isQuizActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Mark current question as visited when navigating away
  const handleNavigate = useCallback(
    (targetIdx: number) => {
      const q = activeQuestions[currentQ];
      if (q) {
        setVisitedQuestions((prev) => {
          const next = new Set(prev);
          next.add(q.id);
          return next;
        });
      }
      setCurrentQ(targetIdx);
      setTimeLeft(60);
    },
    [activeQuestions, currentQ]
  );

  // ── Navigation blocker ─────────────────────────────────────────────────────

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isQuizActive && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      setShowLeaveWarning(true);
      setPendingNavigation(() => blocker.proceed);
    }
  }, [blocker]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const startMutation = useMutation({
    mutationFn: () => quizApi.startAttempt(quizId!, user!.id).then((r) => r.data),
    onSuccess: (data) => {
      setAttemptId(data.id);
      setTimeLeft(60);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsTimerActive(false);
      if (isRealQuiz && attemptId && attemptId !== "demo") {
        for (const [qId, ans] of Object.entries(answers)) {
          await quizApi.submitAnswer(attemptId!, qId, ans);
        }
        return quizApi.submitQuiz(attemptId!, user!.id).then((r) => r.data);
      }
      // Offline mode: compute result locally from activeQuestions
      const total = activeQuestions.length;
      const correct = activeQuestions.filter(
        (q: any) => (answers[q.id] ?? "").toLowerCase() === (q.correct_answer ?? q.correct ?? "").toLowerCase()
      ).length;
      return {
        score: correct,
        total_marks: total,
        percentage: total > 0 ? (correct / total) * 100 : 0,
        time_taken_seconds: 0,
      };
    },
    onSuccess: (data) => {
      setResult(data);
      localStorage.removeItem(storageKey);
      // Quiz completion can flip "Today's Mission" to completed and award
      // XP/EduPoints server-side — these queries carry a 5-min global
      // staleTime (see main.tsx), so without this the dashboard would keep
      // showing the pre-quiz state for up to 5 minutes after returning to it.
      // Keys must match their owning components exactly: MissionCard
      // ("today-goal"), DashboardPage ("analytics"/"gamification"/
      // "edupoints-balance"), LevelProgressPage ("level-info"),
      // FriendsLeaderboard ("friends-leaderboard").
      queryClient.invalidateQueries({ queryKey: ["today-goal", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["analytics", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["gamification", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["edupoints-balance", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["level-info", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["friends-leaderboard", user?.id] });
    },
    onError: () => toast.error("Failed to submit quiz"),
  });

  const analysisMutation = useMutation({
    mutationFn: async () => {
      const qs = activeQuestions;
      const mistakes = qs
        .filter((q: any) => {
          const given = answers[q.id];
          const correct = q.correct_answer ?? q.correct;
          return given && correct && given.toLowerCase() !== correct.toLowerCase();
        })
        .map((q: any) => ({
          question: q.text,
          user_answer: answers[q.id] ?? "",
          correct_answer: q.correct_answer ?? q.correct ?? "",
          topic: q.topic ?? undefined,
          subject: q.subject ?? undefined,
        }));

      if (mistakes.length === 0) {
        toast.success("No mistakes to analyse — perfect score!");
        return null;
      }
      const res = await aiApi.mistakeAnalysis(mistakes);
      return res.data.explanations as MistakeExplanation[];
    },
    onSuccess: (data) => {
      if (data) setAnalysis(data);
    },
    onError: (err: any) => {
      if (err?.response?.status === 429) {
        toast.error(err.response.data?.detail ?? "Daily limit reached for Mistake Analysis.");
      } else {
        toast.error("Could not analyse mistakes");
      }
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const toggleMark = useCallback(
    (qId: string) => {
      setMarkedForReview((prev) => {
        const next = new Set(prev);
        if (next.has(qId)) next.delete(qId);
        else next.add(qId);
        return next;
      });
    },
    []
  );

  const handleSubmitClick = () => {
    if (markedForReview.size > 0) {
      setShowSubmitWarning(true);
    } else {
      submitMutation.mutate();
    }
  };

  const handlePauseResume = () => {
    if (!isPaused) {
      saveState();
      setIsPaused(true);
      toast.success("Quiz paused. Progress saved.");
    } else {
      setIsPaused(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const timerIsWarning = timeLeft <= 10;
  const timerPercent = (timeLeft / 60) * 100;

  // ── Loading states — Phase 12: skeleton UI while subscription or quiz loads ──

  if (subLoading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/3" />
      <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        ))}
      </div>
    </div>
  );

  if (isRealQuiz && isLoading) return (
    <div className="space-y-4 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-28" />
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16" />
      </div>
      <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        ))}
      </div>
    </div>
  );

  if (isRealQuiz && isError) return (
    <div className="card text-center py-10">
      <p className="text-danger-600 dark:text-danger-400 font-semibold mb-2">Couldn't load this quiz's questions.</p>
      <button onClick={() => refetchQuestions()} className="btn-primary">Retry</button>
    </div>
  );

  // ── Results screen (untouched logic, same UI) ──────────────────────────────

  if (result) {
    const passed = result.percentage >= 60;
    return (
      <div className="w-full space-y-4">
        <div className="card text-center">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
              passed ? "bg-success-100 dark:bg-success-900/30" : "bg-danger-100 dark:bg-danger-900/30"
            }`}
          >
            {passed ? (
              <CheckCircle className="w-10 h-10 text-success-600 dark:text-success-400" />
            ) : (
              <XCircle className="w-10 h-10 text-danger-600 dark:text-danger-400" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {passed ? t("greatJob") : t("keepPracticing")}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            You scored {result.score.toFixed(0)}/{result.total_marks} (
            {result.percentage.toFixed(1)}%)
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <p className="font-bold text-gray-900 dark:text-white text-lg">{result.percentage.toFixed(1)}%</p>
              <p className="text-gray-500 dark:text-gray-400">{t("yourScore")}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <p className="font-bold text-gray-900 dark:text-white text-lg">
                {Math.floor((result.time_taken_seconds ?? 0) / 60)}m
              </p>
              <p className="text-gray-500 dark:text-gray-400">{t("timeTaken")}</p>
            </div>
          </div>
          {!analysis && (
            <button
              onClick={() => analysisMutation.mutate()}
              disabled={analysisMutation.isPending}
              className="btn-primary flex items-center gap-2 mx-auto"
            >
              {analysisMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</>
              ) : (
                <><Brain className="w-4 h-4" /> {t("aiRevision")}</>
              )}
            </button>
          )}
        </div>

        {/* WhatsApp share card — shown prominently on score >= 70% */}
        {result.percentage >= 70 && (
          <WhatsAppShareCard
            percentage={result.percentage}
            score={result.score}
            total={result.total_marks}
            referralCode={referralData?.code}
            onShare={() => {
              if (user?.id) shareApi.recordShare({ user_id: user.id, achievement_type: "quiz_perfect", platform: "whatsapp" }).catch(() => {});
            }}
          />
        )}

        {analysis && analysis.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary-600 dark:text-primary-400" /> {t("aiObservations")}
            </h3>
            {analysis.map((item, idx) => (
              <div key={idx} className="card border border-danger-100 dark:border-danger-800">
                <button
                  className="w-full flex items-start justify-between gap-3 text-left"
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
                      {item.question}
                    </p>
                    <p className="text-xs text-danger-500 dark:text-danger-400 mt-0.5">Concept: {item.concept}</p>
                  </div>
                  {expandedIdx === idx ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                </button>
                {expandedIdx === idx && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-success-500 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300">
                        <span className="font-medium">{t("correctAnswers")}:</span>{" "}
                        {item.correct_answer}
                      </span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{item.explanation}</p>
                    <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg p-2.5">
                      <p className="text-warning-800 dark:text-warning-300 text-xs font-semibold">Study Tip</p>
                      <p className="text-warning-700 dark:text-warning-400 text-xs mt-0.5">{item.tip}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Pre-start screen ───────────────────────────────────────────────────────

  if (!attemptId) {
    if (!isRealQuiz) {
      return (
        <div className="w-full mx-auto text-center card py-12">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Quiz Not Found</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">This quiz link is invalid or has expired. Please go back and select a valid quiz.</p>
          <button onClick={() => window.history.back()} className="btn-primary">Go Back</button>
        </div>
      );
    }
    const quotaError = (startMutation.error as any)?.response?.status === 429
      ? ((startMutation.error as any)?.response?.data?.detail as string | undefined)
      : null;
    return (
      <div className="w-full mx-auto space-y-4">
        <StudyLimitBanner />
        {quotaError ? (
          <UpgradePrompt message={quotaError} />
        ) : (
          <div className="text-center card">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{t("readyToStart")}</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">{isLoading ? "Loading questions…" : `${activeQuestions.length} questions • 60s per question`}</p>
            <button
              onClick={() => startMutation.mutate()}
              className="btn-primary"
              disabled={startMutation.isPending || isLoading || limitReached}
            >
              {t("startQuiz")}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Active quiz screen ─────────────────────────────────────────────────────

  const q = activeQuestions[currentQ];
  if (!q) return null;

  const isMarked = markedForReview.has(q.id);

  return (
    <>
      {/* ── Main layout ── */}
      <div className="w-full flex gap-5 items-start">
        {/* Left: quiz content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Top bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              Question {currentQ + 1} of {activeQuestions.length}
            </span>

            <div className="flex items-center gap-2">
              {/* Timer display */}
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold transition-colors ${
                  timerIsWarning
                    ? "bg-danger-100 dark:bg-danger-900/30 text-danger-700 dark:text-danger-300"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                }`}
              >
                <Clock className={`w-3.5 h-3.5 ${timerIsWarning ? "animate-pulse" : ""}`} />
                {formatTime(timeLeft)}
              </div>

              {/* Pause/Resume */}
              <button
                onClick={handlePauseResume}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title={isPaused ? "Resume quiz" : "Pause quiz"}
              >
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                {isPaused ? "Resume" : "Pause"}
              </button>

              {/* Palette toggle (mobile) */}
              <button
                onClick={() => setShowPalette((v) => !v)}
                className="lg:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Progress bar (overall) */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-primary-600 h-1.5 rounded-full transition-all"
              style={{ width: `${((currentQ + 1) / activeQuestions.length) * 100}%` }}
            />
          </div>

          {/* Timer bar */}
          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-1000 ${
                timerIsWarning ? "bg-danger-500" : "bg-primary-500"
              }`}
              style={{ width: `${timerPercent}%` }}
            />
          </div>

          {/* Pause overlay */}
          {isPaused && (
            <div className="card border border-warning-200 dark:border-warning-800 bg-warning-50 dark:bg-warning-900/10 text-center py-12">
              <Pause className="w-10 h-10 text-warning-500 mx-auto mb-3" />
              <p className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Quiz Paused</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Your progress has been saved.</p>
              <button
                onClick={handlePauseResume}
                className="btn-primary flex items-center gap-2 mx-auto"
              >
                <Play className="w-4 h-4" /> Resume Quiz
              </button>
            </div>
          )}

          {/* Question card */}
          {!isPaused && (
            <div className="card !p-3 sm:!p-5">
              <div className="flex items-start justify-between gap-3 mb-5">
                <p className="min-w-0 flex-1 text-lg font-semibold text-gray-900 dark:text-white leading-snug break-words">{q.text}</p>
                <button
                  onClick={() => toggleMark(q.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    isMarked
                      ? "border-warning-400 bg-warning-50 dark:bg-warning-900/20 text-warning-700 dark:text-warning-300"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-warning-400 hover:text-warning-600"
                  }`}
                  title={isMarked ? "Unmark for review" : "Mark for review"}
                >
                  <Flag className={`w-3.5 h-3.5 ${isMarked ? "fill-warning-400" : ""}`} />
                  {isMarked ? "Marked" : "Mark"}
                </button>
              </div>

              <div className="space-y-3">
                {q.question_type === "mcq" &&
                  Object.entries(q.options ?? {}).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: key }))}
                      className={`w-full text-left px-4 py-3 rounded-lg border-2 text-sm transition-colors ${
                        answers[q.id] === key
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                          : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <span className="font-medium">{key}.</span> {val as string}
                    </button>
                  ))}

                {q.question_type === "true_false" &&
                  ["True", "False"].map((opt) => (
                    <button
                      key={opt}
                      onClick={() =>
                        setAnswers((prev) => ({ ...prev, [q.id]: opt.toLowerCase() }))
                      }
                      className={`w-full text-left px-4 py-3 rounded-lg border-2 text-sm transition-colors ${
                        answers[q.id] === opt.toLowerCase()
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                          : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          {!isPaused && (
            <div className="flex flex-wrap justify-between gap-3">
              <button
                onClick={() => handleNavigate(Math.max(0, currentQ - 1))}
                disabled={currentQ === 0}
                className="btn-secondary"
              >
                {t("previousLabel")}
              </button>

              {currentQ < activeQuestions.length - 1 ? (
                <button onClick={() => handleNavigate(currentQ + 1)} className="btn-primary">
                  {t("next")}
                </button>
              ) : (
                <button
                  onClick={handleSubmitClick}
                  className="btn-primary bg-success-600 hover:bg-success-700"
                  disabled={submitMutation.isPending}
                >
                  {submitMutation.isPending ? t("loading") : t("submit")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: palette sidebar (desktop) */}
        <div className="hidden lg:block">
          <QuestionPalette
            questions={activeQuestions}
            currentQ={currentQ}
            answers={answers}
            markedForReview={markedForReview}
            visitedQuestions={visitedQuestions}
            onJump={handleNavigate}
          />
        </div>
      </div>

      {/* Mobile palette drawer */}
      {showPalette && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowPalette(false)}
          />
          <div className="relative ml-auto h-full bg-white dark:bg-gray-900 shadow-md p-3 sm:p-4 overflow-y-auto w-72 max-w-[85vw]">
            <QuestionPalette
              questions={activeQuestions}
              currentQ={currentQ}
              answers={answers}
              markedForReview={markedForReview}
              visitedQuestions={visitedQuestions}
              onJump={(idx) => {
                handleNavigate(idx);
                setShowPalette(false);
              }}
              onClose={() => setShowPalette(false)}
            />
          </div>
        </div>
      )}

      {/* Submit warning modal (marked for review) */}
      {showSubmitWarning && (
        <Modal
          onClose={() => setShowSubmitWarning(false)}
          size="sm"
          footer={
            <>
              <button
                onClick={() => setShowSubmitWarning(false)}
                className="flex-1 btn-secondary"
              >
                Go back
              </button>
              <button
                onClick={() => {
                  setShowSubmitWarning(false);
                  submitMutation.mutate();
                }}
                disabled={submitMutation.isPending}
                className="flex-1 btn-primary bg-success-600 hover:bg-success-700"
              >
                {submitMutation.isPending ? t("loading") : "Submit anyway"}
              </button>
            </>
          }
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-warning-600 dark:text-warning-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-white">Questions marked for review</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                You have{" "}
                <span className="font-semibold text-warning-600 dark:text-warning-400">{markedForReview.size}</span>{" "}
                question{markedForReview.size > 1 ? "s" : ""} marked for review. Are you sure you
                want to submit?
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* Leave quiz warning modal */}
      {showLeaveWarning && (
        <Modal
          onClose={() => {
            setShowLeaveWarning(false);
            if (blocker.state === "blocked") blocker.reset?.();
            setPendingNavigation(null);
          }}
          size="sm"
          footer={
            <>
              <button
                onClick={() => {
                  setShowLeaveWarning(false);
                  if (blocker.state === "blocked") blocker.reset?.();
                  setPendingNavigation(null);
                }}
                className="flex-1 btn-secondary"
              >
                Stay
              </button>
              <button
                onClick={() => {
                  setShowLeaveWarning(false);
                  saveState();
                  if (pendingNavigation) pendingNavigation();
                  else if (blocker.state === "blocked") blocker.proceed?.();
                  setPendingNavigation(null);
                }}
                className="flex-1 btn-primary bg-danger-600 hover:bg-danger-700"
              >
                Leave
              </button>
            </>
          }
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-danger-100 dark:bg-danger-900/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-danger-600 dark:text-danger-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-white">Leave quiz?</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your progress has been saved. You can resume this quiz later.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
