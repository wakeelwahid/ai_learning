import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { contentApi, gamificationApi } from "@/lib/api";
import { useAppSelector } from "@/store";
import { Alert } from "@/components/ui";
import {
  ChevronLeft, CheckCircle, XCircle, Lightbulb, Target,
  Trophy, Award, Clock, RotateCcw, AlertCircle, ChevronRight,
  GraduationCap, Share2,
} from "lucide-react";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OptionKey = "a" | "b" | "c" | "d";
export type PracticeLevel = "exercise" | "chapter" | "question" | "subject";
export type PracticeMode  = "practice" | "quiz";

interface PracticeQ {
  id: string;
  text: string;
  option_a: string;
  option_b: string;
  option_c?: string;
  option_d?: string;
  correct_option: string;
  explanation?: string;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

interface Props {
  level: PracticeLevel;
  id: string;
  mode: PracticeMode;
  title: string;
  chapterId: string;
  onBack: () => void;
  onChapterQuiz?: (chapterId: string) => void;
}

export default function PracticeQuizSession({
  level, id, mode, title, chapterId, onBack, onChapterQuiz,
}: Props) {
  const user    = useAppSelector((s) => s.auth.user);
  const isQuiz  = mode === "quiz";
  const validId = !!id && UUID_RE.test(id);

  const [selected, setSelected]   = useState<Record<string, OptionKey>>({});
  const [revealed, setRevealed]   = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [elapsed, setElapsed]     = useState(0);
  const [recorded, setRecorded]   = useState(false);
  const [recordError, setRecordError] = useState(false);
  const [certNumber, setCertNumber]   = useState<string | null>(null);
  const [certLoading, setCertLoading] = useState(false);

  const { data: raw, isLoading } = useQuery({
    queryKey: ["pq-session", level, id],
    queryFn: () => {
      if (level === "subject")  return contentApi.subjectPractice(id).then((r) => r.data);
      if (level === "chapter")  return contentApi.chapterPractice(id).then((r) => r.data);
      if (level === "question") return contentApi.questionPractice(id).then((r) => r.data);
      return contentApi.exercisePractice(id).then((r) => r.data);
    },
    enabled: validId,
  });

  const questions: PracticeQ[] = useMemo(() => (Array.isArray(raw) ? raw : []), [raw]);

  useEffect(() => {
    if (!isQuiz || submitted || questions.length === 0) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [isQuiz, submitted, questions.length]);

  const answeredCount = Object.keys(selected).length;
  const allAnswered   = questions.length > 0 && answeredCount === questions.length;
  const isDone        = isQuiz ? submitted : questions.length > 0 && Object.keys(revealed).length === questions.length;
  const numRight      = questions.filter((q) => selected[q.id] === q.correct_option).length;
  const pct           = questions.length ? Math.round((numRight / questions.length) * 100) : 0;

  useEffect(() => {
    if (!isDone || recorded || !user || !validId) return;
    setRecorded(true);
    const onFail = () => setRecordError(true);
    if (level === "exercise")     contentApi.completeExercise(id, user.id, pct).catch(onFail);
    else if (level === "chapter") contentApi.completeChapter(id, user.id, pct).catch(onFail);
    else if (level === "subject") contentApi.completeSubject(id, user.id, pct).catch(onFail);
  }, [isDone, recorded, user, validId, level, id, pct]);

  // Auto-issue a completion certificate on a 100% chapter/subject quiz —
  // mirrors mobile's LearnScreen.tsx behavior. Fails open (no certificate
  // banner) rather than blocking the score screen if the backend call fails.
  useEffect(() => {
    if (!isDone || pct < 100 || !user || !validId) return;
    if (level !== "chapter" && level !== "subject") return;
    if (certNumber || certLoading) return;
    setCertLoading(true);
    gamificationApi.issueCertificate({ user_id: user.id, entity_type: level, entity_id: id, student_name: user.full_name ?? "Student" })
      .then((r) => setCertNumber((r.data as any)?.certificate_number ?? null))
      .catch(() => {})
      .finally(() => setCertLoading(false));
  }, [isDone, pct, level, id, user, validId, certNumber, certLoading]);

  const pickPractice = (qid: string, key: OptionKey) => {
    if (revealed[qid]) return;
    setSelected((p) => ({ ...p, [qid]: key }));
    setRevealed((p) => ({ ...p, [qid]: true }));
  };
  const pickQuiz = (qid: string, key: OptionKey) => {
    if (submitted) return;
    setSelected((p) => ({ ...p, [qid]: key }));
  };
  const retry = () => {
    setSelected({}); setRevealed({}); setSubmitted(false); setElapsed(0); setRecorded(false); setRecordError(false);
  };

  if (isLoading) {
    return (
      <div className="w-full space-y-4 animate-pulse">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-24 w-full rounded-2xl" />
        <div className="skeleton h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!validId || questions.length === 0) {
    return (
      <div className="w-full space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 dark:text-gray-400">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="card py-16 text-center">
          <AlertCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No {isQuiz ? "quiz" : "practice"} questions available yet</p>
          <p className="text-sm text-gray-400 mt-1">Content is being added for this {level}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 animate-fade-in pb-10">

      {/* Header */}
      <div className={`rounded-2xl p-5 text-white ${isQuiz ? "bg-primary-600" : "bg-gradient-to-r from-emerald-500 to-teal-600"}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1 truncate">
              {title} · {isQuiz ? "Quiz" : "Practice"}
            </p>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {isQuiz ? <Award className="w-5 h-5 flex-shrink-0" /> : <Target className="w-5 h-5 flex-shrink-0" />}
              {isQuiz ? "Quiz Mode" : "Practice Mode"}
            </h1>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold">{questions.length}</p>
            <p className="text-white/70 text-xs">questions</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 mt-4 text-sm flex-wrap">
          {isQuiz && !submitted && (
            <span className="flex items-center gap-1.5 bg-white/15 px-3 py-1 rounded-lg flex-shrink-0">
              <Clock className="w-4 h-4" /> {fmtTime(elapsed)}
            </span>
          )}
          <span className="bg-white/15 px-3 py-1 rounded-lg flex-shrink-0">
            {isQuiz && !submitted ? `${answeredCount}/${questions.length} answered` : `${Object.keys(revealed).length || (submitted ? questions.length : 0)}/${questions.length} done`}
          </span>
          {isQuiz && !submitted && (
            <span className="text-white/60 text-xs sm:ml-auto w-full sm:w-auto">Answers revealed after submit</span>
          )}
        </div>
      </div>

      {/* Score banner */}
      {isDone && (
        <div className={`card p-4 sm:p-5 flex items-center justify-between gap-3 sm:gap-4 flex-wrap border-2 ${pct >= 60 ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20" : "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20"}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${pct >= 60 ? "bg-green-500" : "bg-amber-500"}`}>
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-lg text-gray-900 dark:text-white break-words">{numRight} / {questions.length} correct · {pct}%</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {pct >= 80 ? "Excellent work! 🎉" : pct >= 60 ? "Good job! Keep it up." : "Keep practicing — review the explanations."}
              </p>
            </div>
          </div>
          <button onClick={retry} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-primary-400 transition-colors flex-shrink-0">
            <RotateCcw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {isDone && recordError && (
        <Alert variant="warning">
          This result wasn't saved to your progress — watch all of this {level}'s videos first, then retake it to log your score.
        </Alert>
      )}

      {/* Certificate banner on 100% chapter/subject completion */}
      {isDone && pct >= 100 && (level === "chapter" || level === "subject") && (
        <div className="card p-4 flex items-center gap-3 border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
          <span className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-5 h-5 text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 dark:text-white text-sm">Certificate Earned! 🎓</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {certLoading ? "Generating certificate…" : certNumber ? `#${certNumber}` : `You completed this ${level} with 100%!`}
            </p>
          </div>
          {certNumber && (
            <button
              onClick={() => {
                const msg = encodeURIComponent(
                  `🎓 I just completed "${title}" on EduLearn and earned a Certificate!\nCert: ${certNumber}`
                );
                window.open(`https://wa.me/?text=${msg}`, "_blank");
              }}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors flex-shrink-0"
            >
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
          )}
        </div>
      )}

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q, idx) => {
          const opts: { key: OptionKey; label: string }[] = [
            { key: "a", label: q.option_a },
            { key: "b", label: q.option_b },
            ...(q.option_c ? [{ key: "c" as OptionKey, label: q.option_c }] : []),
            ...(q.option_d ? [{ key: "d" as OptionKey, label: q.option_d }] : []),
          ];
          const userPick = selected[q.id];
          const reveal   = isQuiz ? submitted : !!revealed[q.id];
          const isRight  = reveal && userPick === q.correct_option;

          return (
            <div key={q.id} className="card p-3.5 sm:p-5 space-y-3">
              <div className="flex items-start gap-2">
                <span className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {idx + 1}
                </span>
                <p className="text-sm font-semibold text-gray-900 dark:text-white flex-1 min-w-0 pt-0.5 break-words">{q.text}</p>
                {reveal && (
                  isRight
                    ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    : <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                )}
              </div>

              <div className="space-y-2 pl-2 sm:pl-9">
                {opts.map(({ key, label }) => {
                  const isThis       = userPick === key;
                  const isCorrectOpt = q.correct_option === key;

                  let cls = "w-full flex items-start gap-3 p-3 rounded-xl border text-sm text-left transition-all ";
                  if (!reveal) {
                    cls += isThis
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 cursor-pointer"
                      : "border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/10 cursor-pointer";
                  } else if (isCorrectOpt) {
                    cls += "border-green-500 bg-green-50 dark:bg-green-900/20 cursor-default";
                  } else if (isThis) {
                    cls += "border-red-400 bg-red-50 dark:bg-red-900/20 cursor-default";
                  } else {
                    cls += "border-gray-200 dark:border-gray-700 opacity-50 cursor-default";
                  }

                  const dotCls = reveal && isCorrectOpt
                    ? "w-6 h-6 rounded-full bg-green-500 text-white flex-shrink-0 flex items-center justify-center text-xs font-bold"
                    : reveal && isThis
                      ? "w-6 h-6 rounded-full bg-red-400 text-white flex-shrink-0 flex items-center justify-center text-xs font-bold"
                      : isThis
                        ? "w-6 h-6 rounded-full bg-primary-500 text-white flex-shrink-0 flex items-center justify-center text-xs font-bold"
                        : "w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 text-gray-500 flex-shrink-0 flex items-center justify-center text-xs font-bold";

                  return (
                    <button
                      key={key}
                      onClick={() => isQuiz ? pickQuiz(q.id, key) : pickPractice(q.id, key)}
                      disabled={reveal}
                      className={cls}
                    >
                      <span className={dotCls}>{key.toUpperCase()}</span>
                      <span className={`min-w-0 break-words ${reveal && isCorrectOpt ? "text-green-800 dark:text-green-300 font-medium pt-0.5" : "text-gray-700 dark:text-gray-300 pt-0.5"}`}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {reveal && q.explanation && (
                <div className="flex gap-2 p-3 ml-2 sm:ml-9 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                  <Lightbulb className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-primary-800 dark:text-primary-300 min-w-0 break-words">{q.explanation}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quiz submit bar */}
      {isQuiz && !submitted && (
        <div className="sticky bottom-4">
          <button
            onClick={() => setSubmitted(true)}
            disabled={!allAnswered}
            className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-5 h-5" />
            Submit Quiz
            {!allAnswered && <span className="text-xs opacity-80 ml-1">({answeredCount}/{questions.length} answered)</span>}
          </button>
        </div>
      )}

      {/* Done CTAs */}
      {isDone && (
        <div className="flex flex-col sm:flex-row gap-3">
          {chapterId && onChapterQuiz && (
            <button
              onClick={() => onChapterQuiz(chapterId)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold transition-colors"
            >
              <Award className="w-4 h-4" /> Take Chapter Quiz <ChevronRight className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onBack}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-primary-400 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Lessons
          </button>
        </div>
      )}
    </div>
  );
}
