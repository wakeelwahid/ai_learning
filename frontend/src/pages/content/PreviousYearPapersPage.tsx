import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { contentApi } from "@/lib/api";
import { useAppSelector } from "@/store";
import { SkeletonList } from "@/components/ui/Skeleton";
import {
  Trophy, PlayCircle, FileText, Filter, ChevronDown,
  TrendingUp, Flame, BookMarked, AlertCircle, Clock, Brain,
  Play, ChevronRight, Lock, CheckCircle, RefreshCw, Loader2,
  Download, Eye, X, ExternalLink,
} from "lucide-react";

// ── Quiz question type ────────────────────────────────────────────────────────
interface QuizQ {
  id: string;
  text: string;
  options: string[];
  correct: number; // 0-indexed
  explanation: string;
}

function apiToQuizQ(item: any): QuizQ {
  const opts: Record<string, string> = item.options ?? {};
  const keys = ["A", "B", "C", "D"].filter(k => opts[k] != null);
  return {
    id: item.id,
    text: item.text,
    options: keys.map(k => opts[k]),
    correct: keys.indexOf((item.correct_option ?? "A").toUpperCase()),
    explanation: item.explanation ?? "",
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface PaperVideo {
  id: string;
  title: string;
  youtubeId: string;
  duration: number; // seconds
  topic: string;
}

interface Paper {
  id: string;
  board: string;
  year: number;
  subject: string;
  class_num: number;
  title?: string;
  difficulty?: string;
  file_url?: string;
  videos?: PaperVideo[];
  // legacy / computed
  topics?: string[];
}

const DIFFICULTY_COLOR: Record<string, string> = {
  Easy:   "badge-success",
  Medium: "badge-warning",
  Hard:   "badge-danger",
};

const TOPIC_COLORS = [
  "bg-info-100 text-info-700 dark:bg-info-900/30 dark:text-info-300",
  "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
  "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300",
  "bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300",
];

function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

// ── localStorage key for PYP completions ─────────────────────────────────────
const LS_PYP_KEY = "edulearn_pyp_completed";

function loadCompleted(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_PYP_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set<string>();
  } catch { return new Set(); }
}

function saveCompleted(ids: Set<string>) {
  try { localStorage.setItem(LS_PYP_KEY, JSON.stringify([...ids])); } catch {}
}

// ── Expanded paper detail with full video list + auto-unlock quiz/practice ────
function PaperDetail({ paper, pypQsMap }: { paper: Paper; pypQsMap: Record<string, QuizQ[]> }) {
  const navigate  = useNavigate();
  const user      = useAppSelector(s => s.auth.user);
  const videos: PaperVideo[] = Array.isArray(paper.videos) ? paper.videos : [];
  const topics: string[] = paper.topics ?? [...new Set(videos.map(v => v.topic).filter(Boolean))];

  const [activeTab,    setActiveTab]    = useState<"videos" | "analysis">("videos");
  const [activeVideo,  setActiveVideo]  = useState<PaperVideo | null>(null);
  // Persisted across refreshes via localStorage; also written to backend when user is logged in
  const [completedIds, setCompletedIds] = useState<Set<string>>(loadCompleted);
  // "saving to DB" spinner per video
  const [savingId,     setSavingId]     = useState<string | null>(null);
  // Inline practice / quiz state
  const [pqState, setPqState] = useState<{
    videoId: string;
    mode: "practice" | "quiz";
    items: QuizQ[];
    selected: Record<string, string>; // questionId → option index (as string)
    revealed: Record<string, boolean>;
    submitted: boolean;
  } | null>(null);

  // Attempt tracking for the graded quiz. Best-effort telemetry: every call is
  // swallowed on failure so a network error can never block the student.
  const attemptRef = useRef<{ id: string; startedAt: number } | null>(null);

  const topicColorMap: Record<string, string> = {};
  topics.forEach((tp, i) => { topicColorMap[tp] = TOPIC_COLORS[i % TOPIC_COLORS.length]; });

  // ── Record video completion: localStorage (instant) + backend DB ─────────
  const recordCompletion = useCallback(async (video: PaperVideo) => {
    if (completedIds.has(video.id)) return; // already done

    // Layer 1: localStorage — optimistic, survives refresh, works offline
    const next = new Set([...completedIds, video.id]);
    setCompletedIds(next);
    saveCompleted(next);

    // Layers 3-5: DB → Redis → PostgreSQL via backend API
    // PYP videos use a shared demo YouTube ID; look up the DB record by fetching
    // the video directly so we can write real progress into the database.
    if (user?.id) {
      setSavingId(video.id);
      try {
        const res = await contentApi.getVideoByYoutubeId(video.youtubeId).catch(() => null);
        const dbId: string | undefined = (res?.data as any)?.id;
        if (dbId) {
          await Promise.all([
            contentApi.updateProgress(dbId, video.duration, true, user.id, {
              position_seconds: video.duration,
              status: "completed",
            }),
            contentApi.completeVideo(dbId, user.id),
          ]);
        }
      } catch {
        // Backend call failed — localStorage already captured completion
      } finally {
        setSavingId(null);
      }
    }
  }, [completedIds, user?.id]);

  // ── YouTube IFrame API: listen for video-ended postMessage ────────────────
  // YouTube sends { event: "onStateChange", info: 0 } when a video finishes.
  // Requires enablejsapi=1 in the embed URL.
  useEffect(() => {
    if (!activeVideo) return;

    const handler = (event: MessageEvent) => {
      if (event.origin !== "https://www.youtube.com") return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        // state 0 = ended
        if (data?.event === "onStateChange" && data?.info === 0) {
          recordCompletion(activeVideo);
        }
      } catch { /* non-JSON messages from other sources */ }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [activeVideo, recordCompletion]);

  const selectVideo = (v: PaperVideo) => {
    setPqState(null); // close any open quiz when switching video
    setActiveVideo(prev => prev?.id === v.id ? null : v);
  };

  // The ref guard keeps a re-open/re-render from double-POSTing an open attempt.
  const startAttempt = () => {
    if (attemptRef.current) return;
    contentApi.startPypAttempt(paper.id)
      // content_service returns `attempt_id` (not `id`) on this route.
      .then(r => { attemptRef.current = { id: r.data.attempt_id, startedAt: Date.now() }; })
      .catch(() => {});
  };

  const openPQ = (video: PaperVideo, mode: "practice" | "quiz") => {
    const items = pypQsMap[video.topic] ?? [];
    setPqState({ videoId: video.id, mode, items, selected: {}, revealed: {}, submitted: false });
    // Only the graded quiz is an "attempt" — practice mode just reveals answers.
    if (mode === "quiz" && items.length > 0) startAttempt();
    setTimeout(() => {
      document.getElementById(`pq-${video.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const closePQ = () => setPqState(null);

  // Grade server-side: send question_id → chosen option letter, never a score.
  const submitQuiz = (selected: Record<string, string>) => {
    setPqState(s => s ? { ...s, submitted: true } : null);
    const attempt = attemptRef.current;
    if (!attempt) return;
    attemptRef.current = null;
    const answers = Object.fromEntries(
      Object.entries(selected).map(([qid, idx]) => [qid, String.fromCharCode(65 + Number(idx))]),
    );
    const seconds = Math.round((Date.now() - attempt.startedAt) / 1000);
    contentApi.submitPypAttempt(attempt.id, answers, seconds).catch(() => {});
  };

  // Derived quiz state
  const pqRight = pqState ? pqState.items.filter(q => pqState.selected[q.id] === String(q.correct)).length : 0;
  const pqPct   = pqState?.items.length ? Math.round((pqRight / pqState.items.length) * 100) : 0;
  const pqDone  = pqState
    ? pqState.mode === "quiz"
      ? pqState.submitted
      : pqState.items.length > 0 && Object.keys(pqState.revealed).length === pqState.items.length
    : false;

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-4 animate-fade-in">

      {/* Topics */}
      {topics.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Topics Covered</p>
          <div className="flex flex-wrap gap-2">
            {topics.map((tp, i) => (
              <span key={tp} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TOPIC_COLORS[i % TOPIC_COLORS.length]}`}>{tp}</span>
            ))}
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveTab("videos")}
          className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl transition-colors ${
            activeTab === "videos" ? "bg-primary-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
          }`}>
          <PlayCircle className="w-3.5 h-3.5" /> Video Solutions ({videos.length})
        </button>
        <button onClick={() => setActiveTab("analysis")}
          className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl transition-colors ${
            activeTab === "analysis" ? "bg-primary-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
          }`}>
          <TrendingUp className="w-3.5 h-3.5" /> AI Topic Analysis
        </button>
      </div>

      {/* ── Video Solutions tab ── */}
      {activeTab === "videos" && (
        <div className="space-y-3">

          {/* ── Inline video player ── */}
          {activeVideo && (
            <div className="rounded-2xl overflow-hidden bg-gray-900 shadow-xl animate-fade-in">
              <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                <iframe
                  key={activeVideo.youtubeId}
                  src={`https://www.youtube.com/embed/${activeVideo.youtubeId}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
                  title={activeVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full border-0"
                />
              </div>

              <div className="p-4 space-y-3">
                {/* Title row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-white leading-tight">{activeVideo.title}</h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${topicColorMap[activeVideo.topic] ?? TOPIC_COLORS[0]}`}>
                        {activeVideo.topic}
                      </span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {fmtDur(activeVideo.duration)}
                      </span>
                      <span className="text-xs text-gray-400">{paper.board} {paper.year} · Class {paper.class_num}</span>
                    </div>
                  </div>
                  <button onClick={() => setActiveVideo(null)}
                    className="flex-shrink-0 text-gray-400 hover:text-white text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
                    ✕ Close
                  </button>
                </div>

                {/* Action row — auto-unlocks when video ends */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-700">
                  {completedIds.has(activeVideo.id) ? (
                    <>
                      <button
                        onClick={() => openPQ(activeVideo, "practice")}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-500 text-white px-4 py-2 rounded-xl hover:bg-emerald-600 transition-colors">
                        <FileText className="w-3.5 h-3.5" /> Practice Questions
                      </button>
                      <button
                        onClick={() => openPQ(activeVideo, "quiz")}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-white px-4 py-2 rounded-xl hover:bg-primary-600 transition-colors">
                        <Brain className="w-3.5 h-3.5" /> Take Quiz
                      </button>
                      <button
                        onClick={() => navigate("/ai-assistant")}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-white px-4 py-2 rounded-xl hover:bg-primary-600 transition-colors">
                        <BookMarked className="w-3.5 h-3.5" /> Ask AI Tutor
                      </button>
                      <span className="flex items-center gap-1 text-xs text-emerald-400 ml-auto">
                        <CheckCircle className="w-3.5 h-3.5" /> Completed
                        {savingId === activeVideo.id && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                      </span>
                    </>
                  ) : (
                    <>
                      <button disabled className="flex items-center gap-1.5 text-xs font-semibold bg-gray-700 text-gray-500 px-4 py-2 rounded-xl cursor-not-allowed">
                        <Lock className="w-3.5 h-3.5" /> Practice Questions
                      </button>
                      <button disabled className="flex items-center gap-1.5 text-xs font-semibold bg-gray-700 text-gray-500 px-4 py-2 rounded-xl cursor-not-allowed">
                        <Lock className="w-3.5 h-3.5" /> Take Quiz
                      </button>
                      <span className="text-xs text-gray-500 ml-auto flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Watch the full video to unlock
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Inline Practice / Quiz panel ── */}
          {pqState && pqState.videoId === activeVideo?.id && (
            <div id={`pq-${pqState.videoId}`} className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-fade-in">
              {/* Header */}
              <div className={`flex items-center justify-between px-4 py-3 ${pqState.mode === "quiz" ? "bg-primary-600" : "bg-emerald-600"}`}>
                <div className="flex items-center gap-2">
                  {pqState.mode === "quiz" ? <Brain className="w-4 h-4 text-white" /> : <FileText className="w-4 h-4 text-white" />}
                  <span className="text-sm font-bold text-white">
                    {pqState.mode === "quiz" ? "Quiz" : "Practice Questions"} — {activeVideo?.topic}
                  </span>
                  <span className="text-xs text-white/70">{pqState.items.length} questions</span>
                </div>
                <div className="flex items-center gap-2">
                  {pqDone && (
                    <button onClick={() => {
                      setPqState(s => s ? { ...s, selected: {}, revealed: {}, submitted: false } : null);
                      if (pqState.mode === "quiz") startAttempt(); // a retry is a new attempt
                    }}
                      className="flex items-center gap-1 text-xs text-white/80 hover:text-white">
                      <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                  )}
                  <button onClick={closePQ} className="text-white/70 hover:text-white text-xs px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                    ✕ Close
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3 bg-white dark:bg-gray-900">
                {/* No questions state */}
                {pqState.items.length === 0 && (
                  <div className="text-center py-8">
                    <AlertCircle className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-500">No {pqState.mode} questions available for this video</p>
                    <p className="text-xs text-gray-400 mt-1">Questions for "{activeVideo?.topic}" will be added soon</p>
                  </div>
                )}

                {/* Score banner (shown when done) */}
                {pqDone && pqState.items.length > 0 && (
                  <div className={`flex items-center gap-3 rounded-xl border-2 p-3 ${pqPct >= 60 ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200"}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${pqPct >= 60 ? "bg-emerald-500" : "bg-amber-400"}`}>
                      <Trophy className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{pqRight}/{pqState.items.length} correct · {pqPct}%</p>
                      <p className="text-xs text-gray-500">{pqPct >= 80 ? "Excellent!" : pqPct >= 60 ? "Good job! Keep it up." : "Review the explanations and try again."}</p>
                    </div>
                  </div>
                )}

                {/* Questions */}
                {pqState.items.map((q, idx) => {
                  const userPick = pqState.selected[q.id];
                  const reveal   = pqState.mode === "quiz" ? pqState.submitted : !!pqState.revealed[q.id];
                  return (
                    <div key={q.id} className="rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-2.5">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {idx + 1}. {q.text}
                      </p>
                      <div className="space-y-1.5">
                        {q.options.map((opt, oi) => {
                          const isSelected  = userPick === String(oi);
                          const isCorrect   = q.correct === oi;
                          const showCorrect = reveal && isCorrect;
                          const showWrong   = reveal && isSelected && !isCorrect;
                          return (
                            <button
                              key={oi}
                              disabled={reveal}
                              onClick={() => {
                                if (pqState.mode === "practice") {
                                  setPqState(s => s ? {
                                    ...s,
                                    selected: { ...s.selected, [q.id]: String(oi) },
                                    revealed: { ...s.revealed, [q.id]: true },
                                  } : null);
                                } else {
                                  if (!pqState.submitted) {
                                    setPqState(s => s ? { ...s, selected: { ...s.selected, [q.id]: String(oi) } } : null);
                                  }
                                }
                              }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm transition-all border ${
                                showCorrect ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 text-emerald-800 dark:text-emerald-300"
                                : showWrong  ? "bg-red-50 dark:bg-red-900/20 border-red-300 text-red-800 dark:text-red-300"
                                : isSelected && !reveal ? "bg-primary-50 dark:bg-primary-900/20 border-primary-300 text-primary-800 dark:text-primary-300"
                                : "bg-gray-50 dark:bg-gray-800 border-transparent hover:border-gray-200 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-md text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${
                                showCorrect ? "bg-emerald-500 text-white"
                                : showWrong  ? "bg-red-500 text-white"
                                : isSelected && !reveal ? "bg-primary-600 text-white"
                                : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                              }`}>
                                {String.fromCharCode(65 + oi)}
                              </span>
                              <span className="flex-1">{opt}</span>
                              {showCorrect && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                      {/* Explanation (shown after reveal) */}
                      {reveal && (
                        <div className="flex items-start gap-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg px-3 py-2 text-xs text-primary-700 dark:text-primary-300">
                          <Brain className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-primary-500" />
                          <span>{q.explanation}</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Quiz submit button */}
                {pqState.mode === "quiz" && !pqState.submitted && pqState.items.length > 0 && (
                  <button
                    disabled={Object.keys(pqState.selected).length !== pqState.items.length}
                    onClick={() => submitQuiz(pqState.selected)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary-600 text-white font-bold text-sm hover:bg-primary-700 disabled:bg-primary-300 dark:disabled:bg-primary-900 disabled:cursor-not-allowed transition-colors">
                    <Trophy className="w-4 h-4" />
                    Submit Quiz {Object.keys(pqState.selected).length !== pqState.items.length
                      ? `(${Object.keys(pqState.selected).length}/${pqState.items.length})`
                      : ""}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Video list ── */}
          {videos.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">No videos available for this paper yet.</p>
          )}
          {videos.map((v, idx) => {
            const thumb      = `https://img.youtube.com/vi/${v.youtubeId}/mqdefault.jpg`;
            const topicColor = topicColorMap[v.topic] ?? TOPIC_COLORS[0];
            const isActive    = activeVideo?.id === v.id;
            const isWatched   = completedIds.has(v.id);
            const hasQs      = (pypQsMap[v.topic] ?? []).length > 0;
            return (
              <div key={v.id}
                className={`flex items-center flex-wrap gap-3 p-3 rounded-xl transition-all cursor-pointer group border-2 ${
                  isActive
                    ? "border-primary-400 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                    : "border-transparent bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-600"
                }`}
                onClick={() => selectVideo(v)}
              >
                {/* Index / watched indicator */}
                <span className={`text-xs font-bold w-5 flex-shrink-0 text-center ${isActive ? "text-primary-600" : isWatched ? "text-emerald-500" : "text-gray-400"}`}>
                  {isWatched ? <CheckCircle className="w-4 h-4 inline" /> : isActive ? <Play className="w-3 h-3 inline" fill="currentColor" /> : idx + 1}
                </span>

                {/* Thumbnail */}
                <div className="relative w-14 h-9 xs:w-20 xs:h-12 sm:w-24 sm:h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                  <img src={thumb} alt={v.title} className="w-full h-full object-cover" loading="lazy" />
                  <div className={`absolute inset-0 flex items-center justify-center transition-all ${isActive ? "bg-black/40" : "bg-black/0 group-hover:bg-black/30"}`}>
                    <div className={`w-7 h-7 rounded-full bg-white/90 flex items-center justify-center transition-all ${isActive ? "opacity-100 scale-100" : "opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"}`}>
                      <Play className="w-3 h-3 text-gray-900 ml-0.5" fill="currentColor" />
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 basis-full xs:basis-0">
                  <p className={`text-sm font-semibold line-clamp-1 ${isActive ? "text-primary-700 dark:text-primary-400" : "text-gray-900 dark:text-white"}`}>
                    {v.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${topicColor}`}>{v.topic}</span>
                    <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                      <Clock className="w-3 h-3" /> {fmtDur(v.duration)}
                    </span>
                    {hasQs && <span className="text-[10px] font-semibold text-primary-500">{(pypQsMap[v.topic] ?? []).length} Q</span>}
                  </div>
                </div>

                {/* Per-row action buttons (locked until watched) */}
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  {isWatched ? (
                    <>
                      <button
                        onClick={() => { selectVideo(v); setTimeout(() => openPQ(v, "practice"), 50); }}
                        className="flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                        <FileText className="w-3 h-3" /> Practice
                      </button>
                      <button
                        onClick={() => { selectVideo(v); setTimeout(() => openPQ(v, "quiz"), 50); }}
                        className="hidden sm:flex items-center gap-1 text-[11px] font-semibold bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400 px-2.5 py-1.5 rounded-lg hover:bg-primary-100 transition-colors">
                        <Brain className="w-3 h-3" /> Quiz
                      </button>
                    </>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-gray-400 px-2 py-1.5" title="Watch the video to unlock">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Topics tab ── */}
      {activeTab === "analysis" && (
        <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <BookMarked className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-primary-700 dark:text-primary-400 mb-1">Topics Covered</p>
              <p className="text-xs text-primary-600 dark:text-primary-300 leading-relaxed">
                {topics.length > 0
                  ? <>This paper covers <strong>{topics.length}</strong> topic{topics.length > 1 ? "s" : ""}. Watch each video solution and practice the MCQs to build exam confidence.</>
                  : "Topic information will appear here once videos are added for this paper."}
              </p>
            </div>
          </div>
          {topics.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {topics.map((tp) => {
                const qCount = (pypQsMap[tp] ?? []).length;
                return (
                  <div key={tp} className="flex items-center justify-between gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-600 dark:text-gray-300 truncate min-w-0">{tp}</span>
                    {qCount > 0 && (
                      <span className="text-xs font-bold text-primary-600 flex-shrink-0">{qCount} Q</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <button
            onClick={() => navigate("/ai-assistant")}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-700 py-2 rounded-xl hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors text-center"
          >
            <span className="truncate">Ask AI Tutor about this paper</span> <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PreviousYearPapersPage() {
  const { t } = useLanguage();
  const [board,    setBoard]    = useState("All");
  const [year,     setYear]     = useState("All");
  const [subject,  setSubject]  = useState("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  // In-app PDF reader — students can read the paper without leaving the platform
  const [viewingPaper, setViewingPaper] = useState<{ title: string; url: string } | null>(null);

  // Build API filter params — omit "All" values
  const apiFilters = {
    ...(board   !== "All" ? { board }                       : {}),
    ...(year    !== "All" ? { year: Number(year) }          : {}),
    ...(subject !== "All" ? { subject }                     : {}),
  };

  const { data: papersRaw, isLoading } = useQuery({
    queryKey: ["pyp-papers", apiFilters],
    queryFn: () => contentApi.previousYearPapers(apiFilters).then(r => r.data),
    staleTime: 60_000,
  });

  const papers: Paper[] = Array.isArray(papersRaw)
    ? papersRaw
    : Array.isArray((papersRaw as any)?.items)
      ? (papersRaw as any).items
      : [];

  // Fetch all PYP practice questions once and build a topic-name → QuizQ[] map
  const { data: pypQsRaw } = useQuery({
    queryKey: ["pyp-practice-questions"],
    queryFn: () => contentApi.pypPracticeQuestions().then(r => r.data),
    staleTime: 5 * 60_000,
  });
  const pypQsMap: Record<string, QuizQ[]> = {};
  if (Array.isArray(pypQsRaw)) {
    for (const item of pypQsRaw) {
      if (!pypQsMap[item.topic_name]) pypQsMap[item.topic_name] = [];
      pypQsMap[item.topic_name].push(apiToQuizQ(item));
    }
  }

  // Derive filter options from the full unfiltered set — re-fetch without filters for that
  const { data: allPapersRaw } = useQuery({
    queryKey: ["pyp-papers", {}],
    queryFn: () => contentApi.previousYearPapers({}).then(r => r.data),
    staleTime: 60_000,
  });
  const allPapers: Paper[] = Array.isArray(allPapersRaw)
    ? allPapersRaw
    : Array.isArray((allPapersRaw as any)?.items)
      ? (allPapersRaw as any).items
      : [];

  const BOARDS   = ["All", ...Array.from(new Set(allPapers.map(p => p.board).filter(Boolean))).sort()];
  const YEARS    = ["All", ...Array.from(new Set(allPapers.map(p => String(p.year)).filter(Boolean))).sort((a, b) => Number(b) - Number(a))];
  const SUBJECTS = ["All", ...Array.from(new Set(allPapers.map(p => p.subject).filter(Boolean))).sort()];

  const totalVideos = papers.reduce((acc, p) => acc + (Array.isArray(p.videos) ? p.videos.length : 0), 0);
  const currentYear = new Date().getFullYear();

  const noFiltersApplied = board === "All" && year === "All" && subject === "All";

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Trophy className="w-6 h-6 text-primary-500" /> {t("pypPapers")}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t("pypSub")}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Trophy,     label: "Papers",          value: isLoading ? "..." : papers.length },
          { icon: PlayCircle, label: "Video Solutions",  value: isLoading ? "..." : totalVideos },
          { icon: TrendingUp, label: "Years Covered",    value: YEARS.length > 1 ? YEARS.length - 1 : "—" },
        ].map((s) => (
          <div key={s.label} className="card flex items-center gap-3 sm:flex-col sm:items-center sm:text-center">
            <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
              <s.icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="sm:mt-1">
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{s.value}</p>
              <p className="text-gray-400 text-xs mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 2-col layout */}
      <div className="xl:flex xl:gap-8 xl:items-start">

        {/* ── LEFT: papers list ── */}
        <div className="flex-1 min-w-0">
          {/* Mobile filters */}
          <div className="xl:hidden card mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("filterPapers")}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                { label: "Board",   val: board,   setter: setBoard,   opts: BOARDS   },
                { label: "Year",    val: year,    setter: setYear,    opts: YEARS    },
                { label: "Subject", val: subject, setter: setSubject, opts: SUBJECTS },
              ] as const).map((f) => (
                <div key={f.label} className="relative">
                  <select value={f.val} onChange={(e) => f.setter(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-100 appearance-none pr-8">
                    {f.opts.map((o) => <option key={o} value={o}>{o === "All" ? `All ${f.label}s` : o}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              ))}
            </div>
          </div>

          {/* Loading state */}
          {isLoading && <SkeletonList rows={4} />}

          {/* Papers list */}
          {!isLoading && (
            <div className="space-y-3">
              {papers.length === 0 && noFiltersApplied && (
                <div className="card py-12 text-center">
                  <Trophy className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No papers yet</p>
                  <p className="text-sm text-gray-400 mt-1">Admin can add papers from the admin panel</p>
                </div>
              )}

              {papers.length === 0 && !noFiltersApplied && (
                <div className="card py-12 text-center">
                  <AlertCircle className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No papers match your filters</p>
                  <button onClick={() => { setBoard("All"); setYear("All"); setSubject("All"); }}
                    className="text-sm text-primary-600 mt-2">Clear filters</button>
                </div>
              )}

              {papers.map((p) => {
                const isOpen = expanded === p.id;
                const videoCount = Array.isArray(p.videos) ? p.videos.length : 0;
                const isNew = p.year >= currentYear - 1;
                return (
                  <div key={p.id}
                    className={`card overflow-hidden border-2 transition-all ${
                      isOpen
                        ? "border-primary-300 dark:border-primary-600 shadow-md"
                        : "border-transparent hover:border-primary-200 dark:hover:border-primary-700"
                    }`}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : p.id)}
                      className="w-full text-left flex items-center gap-4"
                    >
                      <div className="w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                        <Trophy className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-900 dark:text-white">
                            {p.title ?? `${p.board} ${p.year} — ${p.subject}`}
                          </p>
                          {isNew && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400">
                              <Flame className="w-3 h-3" /> New
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="badge-blue">{p.board}</span>
                          <span className="text-xs text-gray-400">{p.year}</span>
                          <span className="text-xs text-gray-400">{p.subject}</span>
                          <span className="text-xs text-gray-400">Class {p.class_num}</span>
                          {p.difficulty && (
                            <span className={DIFFICULTY_COLOR[p.difficulty] ?? "text-xs text-gray-400"}>{p.difficulty}</span>
                          )}
                          <span className="text-xs text-primary-500 font-medium flex items-center gap-1">
                            <PlayCircle className="w-3 h-3" /> {videoCount} {videoCount === 1 ? "video" : "videos"}
                          </span>
                          {p.file_url && (
                            <>
                              <span
                                role="button"
                                onClick={e => { e.stopPropagation(); setViewingPaper({ title: p.title ?? `${p.subject} ${p.year}`, url: p.file_url! }); }}
                                className="flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
                              >
                                <Eye className="w-3 h-3" /> View
                              </span>
                              <a
                                href={p.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                onClick={e => e.stopPropagation()}
                                className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                <Download className="w-3 h-3" /> Download
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isOpen && <PaperDetail paper={p} pypQsMap={pypQsMap} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── RIGHT: sticky filters sidebar (xl+) ── */}
        <aside className="hidden xl:flex flex-col w-64 flex-shrink-0 sticky top-6 self-start space-y-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("filterPapers")}</span>
            </div>
            <div className="space-y-3">
              {([
                { label: "Board",   val: board,   setter: setBoard,   opts: BOARDS   },
                { label: "Year",    val: year,    setter: setYear,    opts: YEARS    },
                { label: "Subject", val: subject, setter: setSubject, opts: SUBJECTS },
              ] as const).map((f) => (
                <div key={f.label}>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 block">{f.label}</label>
                  <div className="relative">
                    <select value={f.val} onChange={(e) => f.setter(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-100 appearance-none pr-8">
                      {f.opts.map((o) => <option key={o} value={o}>{o === "All" ? `All ${f.label}s` : o}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              ))}
              {!noFiltersApplied && (
                <button onClick={() => { setBoard("All"); setYear("All"); setSubject("All"); }}
                  className="w-full text-xs text-primary-600 dark:text-primary-400 hover:underline text-center mt-1">
                  Clear all filters
                </button>
              )}
            </div>
          </div>

          <div className="card text-center">
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin inline text-gray-400" /> : papers.length}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">papers found</p>
            {!isLoading && papers.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Video solutions</span>
                  <span className="font-semibold text-primary-600 dark:text-primary-400">{totalVideos}</span>
                </div>
              </div>
            )}
          </div>
        </aside>

      </div>

      {/* ── In-app PYP reader — View on platform, with Download/Open fallbacks ── */}
      {viewingPaper && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setViewingPaper(null)}>
          <div className="w-full max-w-4xl h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-wrap">
              <FileText className="w-4 h-4 text-primary-500 flex-shrink-0" />
              <h3 className="flex-1 min-w-0 basis-full sm:basis-auto text-sm font-bold text-gray-900 dark:text-white truncate">{viewingPaper.title}</h3>
              <a href={viewingPaper.url} target="_blank" rel="noopener noreferrer" download
                className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline flex-shrink-0">
                <Download className="w-3.5 h-3.5" /> Download
              </a>
              <a href={viewingPaper.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:underline flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5" /> Open tab
              </a>
              <button onClick={() => setViewingPaper(null)}
                className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 flex items-center justify-center text-gray-500 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe src={viewingPaper.url} title={viewingPaper.title} className="flex-1 w-full bg-gray-50 dark:bg-gray-950" />
          </div>
        </div>
      )}
    </div>
  );
}
