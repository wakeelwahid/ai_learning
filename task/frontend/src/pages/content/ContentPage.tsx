import { useState, useEffect } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useNavigate, useSearchParams, useNavigationType } from "react-router-dom";
import { contentApi, quizApi } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAppSelector } from "@/store";
import {
  ChevronRight, PlayCircle, FileText, BookOpen,
  Trophy, Clock, ChevronLeft, Search, GraduationCap,
  FlaskConical, Calculator, Globe, Lock, CheckCircle,
  Flame, AlertCircle, ArrowRight,
  Video, NotepadText, ListChecks, Award,
} from "lucide-react";
import PracticeQuizSession, { PracticeLevel, PracticeMode } from "@/components/practice/PracticeQuizSession";
import StudyLimitBanner from "@/components/StudyLimitBanner";
import { useStudyHeartbeat } from "@/hooks/useStudyHeartbeat";

// ── Board display metadata (visual only — no content data) ───────────────────
// Maps API board names (lowercase) to display config. Missing boards get defaults.
// `color` is a solid Tailwind bg-* class (no gradients, per design system).
const BOARD_DISPLAY: Record<string, { emoji: string; featured: boolean; color: string }> = {
  "cbse":          { emoji: "📘", featured: true,  color: "bg-primary-600" },
  "ncert":         { emoji: "📗", featured: true,  color: "bg-emerald-600" },
  "haryana board": { emoji: "🏫", featured: false, color: "bg-amber-600" },
  "rajasthan board":{ emoji: "🎯", featured: false, color: "bg-rose-600" },
  "up board":      { emoji: "📙", featured: false, color: "bg-primary-600" },
  "bihar board":   { emoji: "📔", featured: false, color: "bg-emerald-600" },
  "state board":   { emoji: "📒", featured: false, color: "bg-blue-600" },
  "icse":          { emoji: "🎓", featured: false, color: "bg-rose-600" },
  "ib":            { emoji: "🌐", featured: false, color: "bg-blue-600" },
  "igcse":         { emoji: "🏛️", featured: false, color: "bg-rose-600" },
  "cambridge":     { emoji: "🏅", featured: false, color: "bg-gray-600" },
};
const DEFAULT_BOARD_DISPLAY = { emoji: "📚", featured: false, color: "bg-primary-600" };

// ── Subject display metadata (visual only) ────────────────────────────────────
// `color` is a solid Tailwind bg-* class (no gradients, per design system).
const SUBJECT_DISPLAY: Record<string, { icon: React.ElementType; color: string }> = {
  "mathematics": { icon: Calculator,   color: "bg-primary-600" },
  "math":        { icon: Calculator,   color: "bg-primary-600" },
  "science":     { icon: FlaskConical, color: "bg-emerald-600" },
  "physics":     { icon: FlaskConical, color: "bg-blue-600" },
  "chemistry":   { icon: FlaskConical, color: "bg-emerald-600" },
  "biology":     { icon: FlaskConical, color: "bg-emerald-600" },
  "social science":{ icon: Globe,      color: "bg-amber-600" },
  "history":     { icon: Globe,        color: "bg-amber-600" },
  "geography":   { icon: Globe,        color: "bg-blue-600" },
  "english":     { icon: BookOpen,     color: "bg-rose-600" },
  "hindi":       { icon: BookOpen,     color: "bg-rose-600" },
};
const DEFAULT_SUBJECT_DISPLAY = { icon: BookOpen, color: "bg-gray-600" };

function getBoardDisplay(name: string) {
  return BOARD_DISPLAY[name?.toLowerCase?.() ?? ""] ?? DEFAULT_BOARD_DISPLAY;
}
function getSubjectDisplay(name: string) {
  return SUBJECT_DISPLAY[name?.toLowerCase?.() ?? ""] ?? DEFAULT_SUBJECT_DISPLAY;
}

// ── Skeleton loaders ──────────────────────────────────────────────────────────
function BoardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {[1, 2].map(i => (
          <div key={i} className="rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-pulse">
            <div className="h-24 bg-gray-200 dark:bg-gray-700" />
            <div className="px-3.5 py-2 bg-white dark:bg-gray-800 h-8" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function ClassSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
      {[1, 2, 3, 4, 5, 6, 7].map(i => (
        <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      ))}
    </div>
  );
}

function SubjectSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      ))}
    </div>
  );
}

function ChapterSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="card py-12 text-center">
      <AlertCircle className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
      <p className="text-gray-500 font-medium">{message}</p>
      {sub && <p className="text-sm text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── CompletionBar: thin progress bar; unlocks when 100% ───────────────────────
function CompletionBar({ pct, label }: { pct: number; label?: string }) {
  const done = pct >= 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-medium text-gray-500 dark:text-gray-400">
        <span>{label ?? "Progress"}</span>
        <span className={done ? "text-emerald-600 dark:text-emerald-400 font-bold" : ""}>{pct}%{done ? " · Unlocked" : ""}</span>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${done ? "bg-emerald-500" : "bg-primary-600"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ── QuizCard: status-gated Quiz entry (unlocks after exercise completion) ───────
function QuizCard({ unlocked, onClick, score }: { unlocked: boolean; onClick: () => void; score?: number | null }) {
  return (
    <button
      onClick={onClick}
      disabled={!unlocked}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
        unlocked
          ? "border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 hover:border-primary-400 cursor-pointer"
          : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60 cursor-not-allowed"
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${unlocked ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-600"}`}>
        {unlocked ? <Award className="w-4 h-4 text-white" /> : <Lock className="w-3.5 h-3.5 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">Quiz</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{unlocked ? "Graded · scored" : "Locked"}</p>
      </div>
      {unlocked && score != null && score > 0 && (
        <span className="text-[11px] font-bold text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/40 px-1.5 py-0.5 rounded-full flex-shrink-0">
          {Math.round(score)}%
        </span>
      )}
      {unlocked && <ChevronRight className="w-4 h-4 flex-shrink-0 text-primary-500" />}
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v?: string) => !!v && UUID_RE.test(v);

const diffBadge = (d: string) =>
  d === "Easy"   ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
  d === "Medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";

type Step = "board" | "class" | "subject" | "chapter" | "exercises" | "questions" | "question-detail" | "topics" | "practice";

interface PracticeConfig {
  level: PracticeLevel;
  id: string;
  mode: PracticeMode;
  title: string;
  chapterId: string;
  fromStep: Step;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ContentPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useStudyHeartbeat(true);

  // Learning flow starts at SUBJECT — board & class come from the student's
  // profile (set at registration), not from an in-screen picker.
  const [step, setStep]           = useState<Step>("subject");
  const [search, setSearch]       = useState(searchParams.get("q") ?? "");
  const [boardFilter, setBoardFilter] = useState("All");
  const [selBoard, setSelBoard]   = useState<any>(null);
  const [selClass, setSelClass]   = useState<any>(null);
  const [selSubject, setSelSubject] = useState<any>(null);
  const [selChapter, setSelChapter] = useState<any>(null);
  const [selExercise, setSelExercise] = useState<any>(null);
  const [selQuestion, setSelQuestion] = useState<any>(null);
  const [practiceConfig, setPracticeConfig] = useState<PracticeConfig | null>(null);

  const navigationType = useNavigationType();

  // Restore nav state when user presses Back from VideoPlayerPage
  useEffect(() => {
    if (navigationType !== "POP") return;
    try {
      const raw = sessionStorage.getItem("learnNavState");
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.selBoard)    setSelBoard(s.selBoard);
      if (s.selClass)    setSelClass(s.selClass);
      if (s.selSubject)  setSelSubject(s.selSubject);
      if (s.selChapter)  setSelChapter(s.selChapter);
      if (s.selExercise) setSelExercise(s.selExercise);
      if (s.selQuestion) setSelQuestion(s.selQuestion);
      // board/class steps no longer exist — old saved states land on subject
      if (s.step)        setStep(s.step === "board" || s.step === "class" ? "subject" : s.step);
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist nav state whenever step/selection changes
  useEffect(() => {
    if (step === "subject") { sessionStorage.removeItem("learnNavState"); return; }
    try {
      sessionStorage.setItem("learnNavState", JSON.stringify({
        step, selBoard, selClass, selSubject, selChapter, selExercise, selQuestion,
      }));
    } catch {}
  }, [step, selBoard, selClass, selSubject, selChapter, selExercise, selQuestion]);

  // API queries — boards loaded on mount, children depend on parent UUID selection
  const { data: apiBoards,   isLoading: boardsLoading   } = useQuery({ queryKey: ["boards"], queryFn: () => contentApi.boards().then(r => r.data), staleTime: 5 * 60 * 1000 });
  const { data: apiClasses,  isLoading: classesLoading  } = useQuery({ queryKey: ["classes",  selBoard?.id],   queryFn: () => contentApi.classes(selBoard!.id).then(r => r.data),   enabled: isUUID(selBoard?.id) });
  const { data: apiSubjects, isLoading: subjectsLoading } = useQuery({ queryKey: ["subjects", selClass?.id],   queryFn: () => contentApi.subjects(selClass!.id).then(r => r.data),  enabled: isUUID(selClass?.id) });
  const { data: apiChapters, isLoading: chaptersLoading } = useQuery({ queryKey: ["chapters", selSubject?.id], queryFn: () => contentApi.chapters(selSubject!.id).then(r => r.data), enabled: isUUID(selSubject?.id) });
  const { data: apiTopics }                               = useQuery({ queryKey: ["topics",   selChapter?.id], queryFn: () => contentApi.topics(selChapter!.id).then(r => r.data),   enabled: isUUID(selChapter?.id) });

  // New content hierarchy queries
  const { data: rawExercises, isLoading: exLoading } = useQuery({
    queryKey: ["exercises", selChapter?.id],
    queryFn: () => contentApi.chapterExercises(selChapter!.id).then(r => r.data),
    enabled: isUUID(selChapter?.id),
    staleTime: 60000,
  });
  const exercises: any[] = rawExercises ?? [];

  const { data: rawDirectQs, isLoading: dqLoading } = useQuery({
    queryKey: ["direct-qs", selChapter?.id],
    queryFn: () => contentApi.chapterDirectQuestions(selChapter!.id).then(r => r.data),
    enabled: isUUID(selChapter?.id) && !exLoading && exercises.length === 0,
    staleTime: 60000,
  });
  const directQs: any[] = rawDirectQs ?? [];

  const { data: rawExcQs, isLoading: eqLoading } = useQuery({
    queryKey: ["exc-qs", selExercise?.id],
    queryFn: () => contentApi.exerciseQuestions(selExercise!.id).then(r => r.data),
    enabled: isUUID(selExercise?.id),
    staleTime: 60000,
  });
  const excQs: any[] = rawExcQs ?? [];

  // ── Progress / unlock status (backend-driven) ──────────────────────────────
  const user = useAppSelector((s) => s.auth.user);

  // Profile-driven catalog: the backend resolves the student's board & class
  // from their profile and returns ONLY their subjects (409 until it's set).
  const { data: myCat, error: myCatError, isLoading: myCatLoading } = useQuery({
    queryKey: ["my-catalog", user?.id],
    queryFn: () => contentApi.myCatalog().then((r) => r.data),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    retry: (count, err: any) => err?.response?.status !== 409 && count < 2,
  });
  const myCatMissingProfile = (myCatError as any)?.response?.status === 409;

  const { data: chProgress } = useQuery({
    queryKey: ["ch-progress", selChapter?.id, user?.id],
    queryFn: () => contentApi.chapterProgress(selChapter!.id, user!.id).then(r => r.data).catch(() => null),
    enabled: isUUID(selChapter?.id) && !!user?.id,
    staleTime: 15000,
  });
  const chapterUnlocked = !!(chProgress as any)?.unlocked;
  const chapterPct = (chProgress as any)?.completion_percentage ?? 0;

  const { data: chQuizScore } = useQuery({
    queryKey: ["ch-quiz-score", selChapter?.id, user?.id],
    queryFn: () => quizApi.chapterScore(selChapter!.id, user!.id).then(r => r.data).catch(() => null),
    enabled: isUUID(selChapter?.id) && !!user?.id && chapterUnlocked,
    staleTime: 30000,
  });
  const chapterQuizScore = (chQuizScore as any)?.best_score ?? null;

  const { data: exProgress } = useQuery({
    queryKey: ["ex-progress", selExercise?.id, user?.id],
    queryFn: () => contentApi.exerciseProgress(selExercise!.id, user!.id).then(r => r.data).catch(() => null),
    enabled: isUUID(selExercise?.id) && !!user?.id,
    staleTime: 15000,
  });
  const exerciseUnlocked = !!(exProgress as any)?.unlocked;
  const exercisePct = (exProgress as any)?.completion_percentage ?? 0;

  const { data: subjProgress } = useQuery({
    queryKey: ["subj-progress", selSubject?.id, user?.id],
    queryFn: () => contentApi.subjectProgress(selSubject!.id, user!.id).then(r => r.data).catch(() => null),
    enabled: isUUID(selSubject?.id) && !!user?.id,
    staleTime: 15000,
  });
  const subjectUnlocked = !!(subjProgress as any)?.unlocked;
  const subjectPct = (subjProgress as any)?.completion_percentage ?? 0;

  const { data: qVideo, isLoading: qvLoading } = useQuery({
    queryKey: ["q-video", selQuestion?.id],
    queryFn: () => contentApi.getQuestionVideo(selQuestion!.id).then(r => r.data).catch(() => null),
    enabled: isUUID(selQuestion?.id),
    staleTime: 60000,
  });

  // Enrich API boards with display metadata (emoji, color, featured flag).
  // available = true for all boards that come from the API; false boards are never returned by the API.
  const mergedBoards: any[] = (apiBoards as any[] | undefined ?? []).map((b: any) => {
    const display = getBoardDisplay(b.name);
    return { ...b, ...display, available: true };
  });

  const classes:  any[] = (apiClasses  as any[] | undefined) ?? [];
  // Subjects come from the profile-driven catalog; the legacy class-based
  // query only kicks in for restored deep-links that carried a selClass.
  const subjects: any[] = (myCat?.subjects as any[] | undefined) ?? (apiSubjects as any[] | undefined) ?? [];
  const chapters: any[] = (apiChapters as any[] | undefined) ?? [];
  const topics:   any[] = (apiTopics   as any[] | undefined) ?? [];

  // Per-subject completion for the subject grid — one query per subject
  // (batched via useQueries), each hitting the same /my-progress endpoint
  // used for the single-subject detail view above.
  const subjectProgressQueries = useQueries({
    queries: subjects.map((s: any) => ({
      queryKey: ["subj-progress", s.id, user?.id],
      queryFn: () => contentApi.subjectProgress(s.id, user!.id).then(r => r.data).catch(() => null),
      enabled: isUUID(s?.id) && !!user?.id,
      staleTime: 30000,
    })),
  });
  const subjectProgressById: Record<string, any> = {};
  subjects.forEach((s: any, i: number) => {
    subjectProgressById[s.id] = subjectProgressQueries[i]?.data ?? null;
  });
  // "Continue" = the in-progress subject with the highest completion —
  // the closest signal to "most recently active" without a last-accessed
  // timestamp on the backend.
  const continueSubjectId = subjects.reduce((bestId: string | null, s: any) => {
    const p = subjectProgressById[s.id];
    if (!p || p.status !== "in_progress") return bestId;
    const bestPct = bestId ? (subjectProgressById[bestId]?.completion_percentage ?? 0) : -1;
    return (p.completion_percentage ?? 0) > bestPct ? s.id : bestId;
  }, null);

  const go = (s: Step) => { setStep(s); setSearch(""); };

  const back = () => {
    if (step === "practice")  { const fs = practiceConfig?.fromStep ?? "exercises"; setPracticeConfig(null); return go(fs); }
    if (step === "question-detail") { setSelQuestion(null); return go(selExercise ? "questions" : "exercises"); }
    if (step === "questions")  { setSelExercise(null); return go("exercises"); }
    if (step === "exercises" || step === "topics") { setSelChapter(null); setSelExercise(null); setSelQuestion(null); return go("chapter"); }
    if (step === "chapter")  { setSelSubject(null); return go("subject"); }
    // "subject" is the root of the flow — board & class live in the profile
  };

  const q = search.toLowerCase();
  // All API boards are "available"; "featured" comes from BOARD_DISPLAY metadata.
  // The "Upcoming" filter tab shows nothing (no API boards are unavailable) — kept for UI consistency.
  const filteredBoards = mergedBoards.filter((b: any) => {
    const matchesFilter =
      boardFilter === "All"          ? true :
      boardFilter === "National"     ? b.featured :
      boardFilter === "State Boards" ? !b.featured :
      boardFilter === "Upcoming"     ? false : true;
    return matchesFilter && (!q || b.name.toLowerCase().includes(q));
  });
  const featuredBoards = filteredBoards.filter((b: any) => b.featured);
  const stateBoards    = filteredBoards.filter((b: any) => !b.featured);

  const completedChapters = chapters.filter((c: any) => c.progress === 100).length;
  const totalProgress = chapters.length
    ? Math.round(chapters.reduce((a: number, c: any) => a + (c.progress ?? 0), 0) / chapters.length)
    : 0;

  return (
    <div className="w-full space-y-0 animate-fade-in">
      <StudyLimitBanner className="mb-5" />

      {/* ── Breadcrumb + back ── */}
      <div className="flex items-center gap-2 text-sm mb-5 flex-wrap">
        {step !== "board" && (
          <button onClick={back} className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors font-medium">
            <ChevronLeft className="w-4 h-4" /> {t("back")}
          </button>
        )}
        {step !== "subject" && <span className="text-gray-300 dark:text-gray-600">/</span>}
        {[
          { s: "subject",          label: "Subjects" },
          ...(selSubject  ? [{ s: "chapter"         as Step, label: selSubject.name }] : []),
          ...(selChapter  ? [{ s: "exercises"       as Step, label: selChapter.title }] : []),
          ...(selExercise ? [{ s: "questions"       as Step, label: selExercise.name }] : []),
          ...(selQuestion ? [{ s: "question-detail" as Step, label: `Q${selQuestion.question_number}` }] : []),
          ...(step === "practice" && practiceConfig ? [{ s: "practice" as Step, label: practiceConfig.mode === "quiz" ? "Quiz" : "Practice" }] : []),
        ].map((c, i, arr) => (
          <span key={c.s} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600" />}
            <button
              onClick={() => {
                if (c.s === "board")     { setSelBoard(null); setSelClass(null); setSelSubject(null); setSelChapter(null); setSelExercise(null); setSelQuestion(null); go("board"); }
                if (c.s === "class")     { setSelClass(null); setSelSubject(null); setSelChapter(null); setSelExercise(null); setSelQuestion(null); go("class"); }
                if (c.s === "subject")   { setSelSubject(null); setSelChapter(null); setSelExercise(null); setSelQuestion(null); go("subject"); }
                if (c.s === "chapter")   { setSelChapter(null); setSelExercise(null); setSelQuestion(null); go("chapter"); }
                if (c.s === "exercises") { setSelExercise(null); setSelQuestion(null); go("exercises"); }
                if (c.s === "questions") { setSelQuestion(null); go("questions"); }
              }}
              className={`font-medium transition-colors ${i === arr.length - 1 ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"}`}
            >
              {c.label}
            </button>
          </span>
        ))}
      </div>

      {/* ─────────────── STEP: Boards ─────────────── */}
      {step === "board" && (
        <div className="space-y-6 animate-slide-up">

          {/* ── Hero Banner ── */}
          <div className="relative overflow-hidden rounded-2xl bg-gray-900 dark:bg-gray-950 border border-gray-800 p-5 text-white shadow-sm">
            {/* Subtle dot grid */}
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "20px 20px" }}
            />
            {/* Accent glow */}
            <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary-500/20 blur-3xl pointer-events-none" />

            <div className="relative">
              {/* Top row: label + stats inline */}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1 h-4 rounded-full bg-primary-400 flex-shrink-0" />
                  <p className="text-primary-300 text-[10px] font-bold uppercase tracking-[0.15em] truncate">EduLearn Platform</p>
                </div>
                {/* Compact stats row — board count from API */}
                <div className="flex items-center gap-2 xs:gap-3">
                  {[
                    [boardsLoading ? "…" : String(mergedBoards.length), "Boards"],
                    ["6–12", "Classes"],
                    ["Live", "Learning"],
                  ].map(([v, l], i, arr) => (
                    <div key={l} className="flex items-center gap-2 xs:gap-3">
                      <div className="text-center">
                        <p className="text-sm font-extrabold text-white leading-none">{v}</p>
                        <p className="text-[9px] font-medium text-primary-400 mt-0.5 leading-none">{l}</p>
                      </div>
                      {i < arr.length - 1 && <div className="w-px h-6 bg-white/10" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Title block */}
              <h1 className="text-xl font-extrabold leading-tight tracking-tight">{t("chooseYourBoard")}</h1>
              <p className="text-primary-300/80 text-xs mt-1 leading-relaxed">{t("selectBoardDesc")}</p>

              {/* Search */}
              <div className="mt-3.5 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search boards…"
                  className="w-full pl-9 pr-4 py-2 text-xs bg-white/8 border border-white/12 rounded-lg text-white placeholder-primary-400/70 focus:outline-none focus:bg-white/12 focus:border-primary-400/50 transition-all"
                />
              </div>
            </div>
          </div>

          {/* ── Filter Pills ── */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {[
              { id: "All",          label: "All" },
              { id: "National",     label: "National" },
              { id: "State Boards", label: "State Boards" },
              { id: "Upcoming",     label: "Upcoming" },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setBoardFilter(f.id)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors duration-200 ${
                  boardFilter === f.id
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* ── Loading skeleton ── */}
          {boardsLoading && <BoardSkeleton />}

          {/* ── Empty state ── */}
          {!boardsLoading && mergedBoards.length === 0 && (
            <EmptyState message="No boards available yet" sub="Content is being added — check back soon" />
          )}

          {/* ── Featured / National Boards ── 2-col big cards */}
          {!boardsLoading && featuredBoards.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <p className="text-[11px] font-extrabold text-gray-600 dark:text-gray-400 uppercase tracking-widest">National Boards</p>
                <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent dark:from-gray-700" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {featuredBoards.map((b: any) => (
                  <button
                    key={b.id}
                    onClick={() => { setSelBoard(b); go("class"); }}
                    className="group text-left rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700/50 hover:shadow-md hover:-translate-y-0.5 hover:border-primary-200 dark:hover:border-primary-700 transition-all duration-200"
                  >
                    <div className={`relative p-3.5 ${b.color} overflow-hidden`}>
                      <div className="absolute -top-4 -right-4 w-14 h-14 rounded-full bg-white/10 blur-lg pointer-events-none" />
                      <div className="flex items-start justify-between relative">
                        <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-lg leading-none">{b.emoji}</div>
                        <div className="flex items-center gap-1 bg-black/20 rounded-full px-2 py-0.5">
                          <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                          </span>
                          <span className="text-[10px] font-bold text-white">Active</span>
                        </div>
                      </div>
                      <div className="mt-2">
                        <h3 className="font-bold text-white text-sm leading-tight">{b.name}</h3>
                      </div>
                    </div>
                    <div className="px-3.5 py-2 bg-white dark:bg-gray-800 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <GraduationCap className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">Explore</span>
                      </div>
                      <span className="flex items-center gap-1 text-[10px] font-bold text-primary-600 dark:text-primary-400 group-hover:gap-1.5 transition-all">
                        Select <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── State Boards ── compact horizontal list */}
          {!boardsLoading && stateBoards.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Globe className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <p className="text-[11px] font-extrabold text-gray-600 dark:text-gray-400 uppercase tracking-widest">State Boards</p>
                <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent dark:from-gray-700" />
                <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{stateBoards.length}</span>
              </div>
              <div className="space-y-2">
                {stateBoards.map((b: any) => (
                  <button
                    key={b.id}
                    onClick={() => { setSelBoard(b); go("class"); }}
                    className="w-full group flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-200 dark:hover:border-primary-700 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 hover:shadow-md transition-all"
                  >
                    <div className={`w-9 h-9 rounded-lg ${b.color} flex items-center justify-center text-base leading-none flex-shrink-0 shadow-sm`}>
                      {b.emoji}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">{b.name}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 rounded-full px-2 py-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Active</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Why EduLearn? Features ── */}
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <p className="text-xs font-extrabold text-gray-700 dark:text-gray-300 uppercase tracking-widest">Why EduLearn?</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100 dark:divide-gray-700">
              {[
                { icon: PlayCircle, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20", title: "Video Lessons", sub: "Expert-taught HD videos" },
                { icon: ListChecks, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", title: "Practice Mode", sub: "Instant answer feedback" },
                { icon: Trophy,     color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20", title: "Graded Quizzes", sub: "Track your score" },
                { icon: Award,      color: "text-primary-600", bg: "bg-primary-50 dark:bg-primary-900/20", title: "Certificates", sub: "Earn on completion" },
              ].map(({ icon: Icon, color, bg, title, sub }) => (
                <div key={title} className="p-4 flex flex-col items-center text-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
                    <Icon className={`w-4.5 h-4.5 ${color}`} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-tight">{title}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── How it Works ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <p className="text-xs font-extrabold text-gray-700 dark:text-gray-300 uppercase tracking-widest">How it Works</p>
              <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent dark:from-gray-700" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { step: "1", emoji: "🎯", title: "Pick Board & Class", desc: "Choose your curriculum and grade level" },
                { step: "2", emoji: "📖", title: "Select Subject", desc: "Browse chapters with video lessons" },
                { step: "3", emoji: "🏆", title: "Learn & Earn", desc: "Practice, quiz and get certified" },
              ].map(item => (
                <div key={item.step} className="relative p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-center">
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-primary-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-sm">
                    {item.step}
                  </div>
                  <span className="text-xl block mt-1">{item.emoji}</span>
                  <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 mt-1.5 leading-tight">{item.title}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 leading-tight">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── CTA Strip ── */}
          <div className="rounded-2xl bg-primary-600 p-5 text-white flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-bold text-base">Ready to start learning?</p>
              <p className="text-primary-200 text-xs mt-0.5">Select a board above to access video lessons, exercises, and AI-powered practice.</p>
            </div>
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="flex-shrink-0 px-4 py-2 bg-white text-primary-700 font-semibold text-sm rounded-xl hover:bg-primary-50 transition-colors">
              Pick a Board
            </button>
          </div>

        </div>
      )}

      {/* ─────────────── STEP: Class ─────────────── */}
      {step === "class" && (
        <div className="space-y-5 animate-slide-up">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Select Class</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selBoard?.name} · Choose your class</p>
          </div>
          {classesLoading && <ClassSkeleton />}
          {!classesLoading && classes.length === 0 && (
            <EmptyState message="No classes available for this board" sub="Content is being added soon" />
          )}
          {!classesLoading && classes.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              {classes.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => { setSelClass(c); go("subject"); }}
                  className="group flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 flex items-center justify-center transition-colors">
                    <GraduationCap className="w-5 h-5 text-gray-500 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400" />
                  </div>
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover:text-primary-700 dark:group-hover:text-primary-300">{c.number ?? c.label ?? c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────────── STEP: Subject (flow root) ─────────────── */}
      {step === "subject" && (
        <div className="space-y-5 animate-slide-up">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Select Subject</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {myCat ? `${myCat.board} · Class ${myCat.class_num}` : selBoard?.name ? `${selBoard.name} · Class ${selClass?.number ?? ""}` : "Your curriculum"}
              </p>
            </div>
            {myCat && (
              <button onClick={() => navigate("/profile?edit=1")}
                className="text-xs font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-3 py-1.5 rounded-lg hover:bg-primary-100 transition-colors flex-shrink-0">
                Change in Profile
              </button>
            )}
          </div>
          {myCatMissingProfile && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-5 text-center">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Set your Board and Class to see your subjects</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">All chapters, exercises and quizzes are matched to your curriculum.</p>
              <button onClick={() => navigate("/profile?edit=1")}
                className="mt-3 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors">
                Set Board & Class
              </button>
            </div>
          )}
          {(myCatLoading || subjectsLoading) && <SubjectSkeleton />}
          {!myCatLoading && !subjectsLoading && !myCatMissingProfile && subjects.length === 0 && (
            <EmptyState message="No subjects available for your class yet" sub="Content is being added soon" />
          )}
          {!myCatLoading && !subjectsLoading && subjects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subjects.map((s: any) => {
              const display = getSubjectDisplay(s.name);
              const Icon = display.icon;
              const color = display.color;
              const progress = subjectProgressById[s.id];
              const pct = progress?.completion_percentage ?? 0;
              const status: "not_started" | "in_progress" | "completed" = progress?.status ?? "not_started";
              const chaptersTotal = progress?.chapters_total ?? s.chapters ?? 0;
              const isContinue = s.id === continueSubjectId;
              const barColor = status === "completed" ? "bg-emerald-500" : color;
              return (
                <button
                  key={s.id}
                  onClick={() => { setSelSubject({ ...s, color }); go("chapter"); }}
                  className={`group relative text-left rounded-2xl border-2 transition-all duration-200 overflow-hidden bg-white dark:bg-gray-800 hover:shadow-md hover:-translate-y-0.5 ${
                    isContinue
                      ? "border-primary-400 dark:border-primary-500 shadow-sm"
                      : "border-gray-100 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600"
                  }`}
                >
                  {isContinue && (
                    <span className="absolute top-3 right-3 bg-primary-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
                      Continue
                    </span>
                  )}
                  <div className={`h-1.5 w-full ${color}`} />
                  <div className="p-5">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                        <Icon className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 text-base">{s.name}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {chaptersTotal ? `${chaptersTotal} chapters` : (s.description ?? "Explore chapters")}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </div>

                    {/* Completion bar */}
                    <div className="mt-4">
                      <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor} transition-all`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <p className={`text-xs font-semibold mt-1.5 ${
                        status === "completed" ? "text-emerald-600 dark:text-emerald-400" :
                        status === "in_progress" ? "text-primary-600 dark:text-primary-400" :
                        "text-gray-400 dark:text-gray-500"
                      }`}>
                        {status === "not_started" ? "Not started" : `${pct}% complete`}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* ─────────────── STEP: Chapters ─────────────── */}
      {step === "chapter" && (
        <div className="space-y-5 animate-slide-up">
          {/* Subject header */}
          <div className="rounded-2xl overflow-hidden">
            <div className={`p-5 ${selSubject?.color ?? "bg-gray-700"} text-white`}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-bold">{selSubject?.name}</h2>
                  <p className="text-white/70 text-sm mt-0.5">{selBoard?.name} · Class {selClass?.number}</p>
                </div>
                <div className="flex items-center gap-3 sm:gap-4 text-sm text-white/80 flex-wrap">
                  <span>{chapters.length} chapters</span>
                  <span className="hidden sm:inline">·</span>
                  <span>{completedChapters} done</span>
                  {totalProgress > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-white rounded-full" style={{ width: `${totalProgress}%` }} />
                      </div>
                      <span className="font-semibold">{totalProgress}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Search */}
          {!chaptersLoading && chapters.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search chapters…"
                className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-100"
              />
            </div>
          )}

          {chaptersLoading && <ChapterSkeleton />}
          {!chaptersLoading && chapters.length === 0 && (
            <EmptyState message="No chapters available for this subject" sub="Content is being added soon" />
          )}

          {/* Chapter list */}
          {!chaptersLoading && chapters.length > 0 && (
          <div className="space-y-2">
            {(chapters as any[])
              .filter((c: any) => !q || c.title.toLowerCase().includes(q))
              .map((ch: any) => {
                const done = ch.progress === 100;
                const inProgress = ch.progress > 0 && ch.progress < 100;
                return (
                  <button
                    key={ch.id}
                    onClick={() => { setSelChapter(ch); setSelExercise(null); setSelQuestion(null); go("exercises"); }}
                    className="w-full text-left flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
                  >
                    {/* Chapter number */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm transition-colors ${
                      done        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                      : inProgress? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                      :             "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 group-hover:text-primary-700 dark:group-hover:text-primary-300"
                    }`}>
                      {done ? <CheckCircle className="w-5 h-5" /> : ch.seq}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 truncate">{ch.title}</p>
                        {inProgress && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full flex-shrink-0">
                            <Flame className="w-3 h-3" /> {ch.progress}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-gray-400"><PlayCircle className="w-3 h-3" />{ch.videos} videos</span>
                        <span className="flex items-center gap-1 text-xs text-gray-400"><Clock className="w-3 h-3" />{ch.duration}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${diffBadge(ch.difficulty)}`}>{ch.difficulty}</span>
                      </div>
                      {inProgress && (
                        <div className="mt-2 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden w-full max-w-[180px]">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${ch.progress}%` }} />
                        </div>
                      )}
                    </div>

                    <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                );
              })}
          </div>
          )}

          {/* ── Course Test (optional · unlock after all chapters) ── */}
          {selSubject && isUUID(selSubject.id) && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Course Test &amp; Question Paper</p>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">Optional</span>
              </div>
              <CompletionBar pct={subjectPct} label="Course completion" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <QuizCard unlocked={subjectUnlocked}
                  onClick={() => { setPracticeConfig({ level: "subject", id: selSubject.id, mode: "quiz", title: selSubject.name, chapterId: "", fromStep: "chapter" }); go("practice"); }} />
                <button
                  onClick={() => subjectUnlocked && navigate("/pyps")}
                  disabled={!subjectUnlocked}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    subjectUnlocked
                      ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
                      : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${subjectUnlocked ? "bg-gray-700 dark:bg-gray-600" : "bg-gray-300 dark:bg-gray-600"}`}>
                    {subjectUnlocked ? <FileText className="w-4 h-4 text-white" /> : <Lock className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">Question Papers</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{subjectUnlocked ? "Previous year papers" : "Locked"}</p>
                  </div>
                  {subjectUnlocked && <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>
              </div>
              {!subjectUnlocked && <p className="text-[11px] text-gray-400">Finish all course videos to unlock the course test and papers — optional.</p>}
            </div>
          )}
        </div>
      )}

      {/* ─────────────── STEP: Topics ─────────────── */}
      {step === "topics" && (
        <div className="space-y-5 animate-slide-up">
          {/* Chapter header */}
          <div className={`rounded-2xl p-5 ${selSubject?.color ?? "bg-gray-700"} text-white`}>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">
              {selSubject?.name} · Chapter {selChapter?.seq}
            </p>
            <h2 className="text-xl font-bold">{selChapter?.title}</h2>
            <div className="flex items-center gap-4 mt-3 text-sm text-white/80 flex-wrap">
              <span className="flex items-center gap-1.5"><Video className="w-3.5 h-3.5" />{topics.filter((t:any) => t.type === "video").length} Videos</span>
              <span className="flex items-center gap-1.5"><NotepadText className="w-3.5 h-3.5" />{topics.filter((t:any) => t.type === "notes").length} Notes</span>
              <span className="flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5" />{topics.filter((t:any) => t.type === "quiz").length} Quiz</span>
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{selChapter?.duration}</span>
            </div>
          </div>

          {/* Topic sections */}
          {[
            { label: "Videos",   type: "video",  icon: Video,       accent: "blue"   },
            { label: "Notes",    type: "notes",  icon: NotepadText, accent: "green"  },
            { label: "Practice", type: "quiz",   icon: ListChecks,  accent: "yellow" },
          ].map(section => {
            const sectionTopics = (topics as any[]).filter(t => t.type === section.type);
            if (!sectionTopics.length) return null;
            const colors: Record<string, string> = {
              blue:   "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20",
              green:  "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
              yellow: "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20",
            };
            const btnColors: Record<string, string> = {
              blue:   "bg-blue-600 hover:bg-blue-700",
              green:  "bg-green-600 hover:bg-green-700",
              yellow: "bg-yellow-500 hover:bg-yellow-600",
            };
            const Icon = section.icon;
            return (
              <div key={section.type}>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors[section.accent]}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="font-bold text-sm text-gray-700 dark:text-gray-300 uppercase tracking-wide">{section.label}</h3>
                  <span className="text-xs text-gray-400 font-medium">({sectionTopics.length})</span>
                </div>
                <div className="space-y-2 pl-1">
                  {sectionTopics.map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        if (t.type === "video") navigate(`/learn/video/${t.id}`);
                        else if (t.type === "quiz") navigate(`/quiz/${t.id}`);
                      }}
                      disabled={t.type === "notes"}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 transition-all group ${
                        t.type !== "notes"
                          ? "hover:border-primary-200 dark:hover:border-primary-700 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                          : "cursor-default"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[section.accent]}`}>
                        {t.type === "video" ? <PlayCircle className="w-4 h-4" /> : t.type === "notes" ? <FileText className="w-4 h-4" /> : <Trophy className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${t.type !== "notes" ? "text-gray-800 dark:text-gray-200 group-hover:text-primary-700 dark:group-hover:text-primary-300" : "text-gray-600 dark:text-gray-400"}`}>
                          {t.seq}. {t.title}
                        </p>
                        {t.duration && <p className="text-xs text-gray-400 mt-0.5">{t.duration}</p>}
                        {t.questions && <p className="text-xs text-gray-400 mt-0.5">{t.questions} questions</p>}
                      </div>
                      {t.type !== "notes" && (
                        <div className={`w-7 h-7 rounded-lg ${btnColors[section.accent]} flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity`}>
                          <PlayCircle className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {topics.length === 0 && (
            <div className="card py-12 text-center">
              <AlertCircle className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">{t("noTopicsAvailable")}</p>
              <p className="text-sm text-gray-400 mt-1">{t("contentBeingAdded")}</p>
            </div>
          )}
        </div>
      )}

      {/* ─────────────── STEP: Exercises ─────────────── */}
      {step === "exercises" && (
        <div className="space-y-5 animate-slide-up">
          <div className={`rounded-2xl p-5 ${selSubject?.color ?? "bg-gray-700"} text-white`}>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">
              {selSubject?.name} · Chapter {selChapter?.seq}
            </p>
            <h2 className="text-xl font-bold">{selChapter?.title}</h2>
          </div>

          {(exLoading || (exercises.length === 0 && dqLoading)) && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Mode 1: Exercises list */}
          {!exLoading && exercises.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Exercises</p>
              {exercises.map((ex: any) => (
                <button
                  key={ex.id}
                  onClick={() => { setSelExercise(ex); go("questions"); }}
                  className="w-full text-left flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                    {ex.number || ex.sequence}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 truncate">{ex.name}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}


          {/* ── Chapter Quiz + Previous Year Papers (unlock when all exercises complete) ── */}
          {!exLoading && exercises.length > 0 && selChapter && isUUID(selChapter.id) && (
            <div className="card p-4 space-y-3 mt-4">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Chapter Quiz &amp; Papers</p>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">Optional</span>
              </div>
              <CompletionBar pct={chapterPct} label="Chapter completion" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <QuizCard unlocked={chapterUnlocked} score={chapterQuizScore}
                  onClick={() => { setPracticeConfig({ level: "chapter", id: selChapter.id, mode: "quiz", title: selChapter.title, chapterId: selChapter.id, fromStep: "exercises" }); go("practice"); }} />
                <button
                  onClick={() => navigate("/pyps")}
                  disabled={!chapterUnlocked}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    chapterUnlocked
                      ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
                      : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${chapterUnlocked ? "bg-gray-700 dark:bg-gray-600" : "bg-gray-300 dark:bg-gray-600"}`}>
                    {chapterUnlocked ? <FileText className="w-4 h-4 text-white" /> : <Lock className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">Papers</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{chapterUnlocked ? "Prev year" : "Locked"}</p>
                  </div>
                  {chapterUnlocked && <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400" />}
                </button>
              </div>
              {!chapterUnlocked && <p className="text-[11px] text-gray-400">Complete all exercises to unlock the chapter quiz and papers.</p>}
            </div>
          )}

          {/* Mode 2: Direct questions */}
          {!exLoading && exercises.length === 0 && !dqLoading && directQs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Questions</p>
              {directQs.map((q: any) => (
                <button
                  key={q.id}
                  onClick={() => { setSelQuestion(q); go("question-detail"); }}
                  className="w-full text-left flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                    Q{q.question_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 truncate">
                      {q.question_text || `Question ${q.question_number}`}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Fallback: old topics */}
          {!exLoading && exercises.length === 0 && !dqLoading && directQs.length === 0 && topics.length > 0 && (
            <div className="card p-5 text-center space-y-3">
              <p className="text-sm text-gray-500">This chapter has video topics.</p>
              <button
                onClick={() => go("topics")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors"
              >
                <Video className="w-4 h-4" /> View Topics
              </button>
            </div>
          )}

          {/* Empty state */}
          {!exLoading && exercises.length === 0 && !dqLoading && directQs.length === 0 && topics.length === 0 && (
            <div className="card py-12 text-center">
              <AlertCircle className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No content available yet</p>
              <p className="text-sm text-gray-400 mt-1">Content is being added</p>
            </div>
          )}
        </div>
      )}

      {/* ─────────────── STEP: Questions (within exercise) ─────────────── */}
      {step === "questions" && (
        <div className="space-y-5 animate-slide-up">
          <div className={`rounded-2xl p-5 ${selSubject?.color ?? "bg-gray-700"} text-white`}>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">
              {selChapter?.title} · {selExercise?.name}
            </p>
            <h2 className="text-xl font-bold">Questions</h2>
          </div>

          {eqLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!eqLoading && excQs.length > 0 && (
            <div className="space-y-2">
              {excQs.map((q: any) => (
                <button
                  key={q.id}
                  onClick={() => { setSelQuestion(q); go("question-detail"); }}
                  className="w-full text-left flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                    Q{q.question_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 truncate">
                      {q.question_text || `Question ${q.question_number}`}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* ── Exercise Quiz (optional · unlock after all videos watched) ── */}
          {!eqLoading && excQs.length > 0 && selExercise && isUUID(selExercise.id) && (
            <div className="card p-4 space-y-3 mt-4">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Exercise Quiz</p>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">Optional</span>
              </div>
              <CompletionBar pct={exercisePct} label="Exercise completion" />
              <QuizCard unlocked={exerciseUnlocked}
                onClick={() => { setPracticeConfig({ level: "exercise", id: selExercise.id, mode: "quiz", title: selExercise.name, chapterId: selChapter?.id ?? "", fromStep: "questions" }); go("practice"); }} />
              {!exerciseUnlocked && <p className="text-[11px] text-gray-400">Watch all exercise videos to unlock — optional.</p>}
            </div>
          )}

          {!eqLoading && excQs.length === 0 && (
            <div className="card py-12 text-center">
              <AlertCircle className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No questions in this exercise</p>
            </div>
          )}
        </div>
      )}

      {/* ─────────────── STEP: Question Detail ─────────────── */}
      {step === "question-detail" && selQuestion && (
        <div className="space-y-5 animate-slide-up">
          {/* Header */}
          <div className={`rounded-2xl p-5 ${selSubject?.color ?? "bg-gray-700"} text-white`}>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">
              {selExercise ? selExercise.name : selChapter?.title} · Question {selQuestion.question_number}
            </p>
            <h2 className="text-lg font-bold line-clamp-2">
              {selQuestion.question_text || `Question ${selQuestion.question_number}`}
            </h2>
          </div>

          {/* Solution Video */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-50 dark:bg-blue-900/20">
                <Video className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-bold text-sm text-gray-700 dark:text-gray-300 uppercase tracking-wide">Solution Video</h3>
            </div>
            {qvLoading && <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>}
            {!qvLoading && qVideo && (
              <button
                onClick={() => navigate(`/learn/video/${(qVideo as any).id}?qid=${selQuestion.id}&chapter=${selChapter?.id ?? ""}&eid=${selExercise?.id ?? ""}`)}
                className="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group"
              >
                <div className="relative w-24 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-900">
                  <img
                    src={`https://img.youtube.com/vi/${(qVideo as any).youtube_id}/mqdefault.jpg`}
                    alt={(qVideo as any).title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <PlayCircle className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300 text-sm truncate">{(qVideo as any).title}</p>
                  <div className="flex gap-1 mt-1.5">
                    {(qVideo as any).youtube_id     && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">EN</span>}
                    {(qVideo as any).youtube_id_hi  && <span className="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded">HI</span>}
                    {(qVideo as any).youtube_id_pa  && <span className="text-[10px] font-bold text-orange-600 bg-orange-50 dark:bg-orange-900/30 px-1.5 py-0.5 rounded">PA</span>}
                    {(qVideo as any).youtube_id_bho && <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">BHO</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
              </button>
            )}
            {!qvLoading && !qVideo && (
              <p className="text-sm text-gray-400 text-center py-4">No solution video available</p>
            )}
          </div>

          {/* ── Practice & Quiz (optional · unlock after watching videos) ── */}
          {selExercise && isUUID(selExercise.id) && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Quiz</p>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">Optional</span>
              </div>
              <CompletionBar pct={exercisePct} label="Exercise completion" />
              <QuizCard unlocked={exerciseUnlocked}
                onClick={() => { setPracticeConfig({ level: "exercise", id: selExercise.id, mode: "quiz", title: selExercise.name, chapterId: selChapter?.id ?? "", fromStep: "question-detail" }); go("practice"); }} />
              {!exerciseUnlocked && <p className="text-[11px] text-gray-400">Watch the video to unlock — optional.</p>}
            </div>
          )}

        </div>
      )}

      {/* ─────────────── STEP: Practice / Quiz (inline) ─────────────── */}
      {step === "practice" && practiceConfig && (
        <div className="animate-slide-up">
          <PracticeQuizSession
            level={practiceConfig.level}
            id={practiceConfig.id}
            mode={practiceConfig.mode}
            title={practiceConfig.title}
            chapterId={practiceConfig.chapterId}
            onBack={() => { setPracticeConfig(null); go(practiceConfig.fromStep); }}
            onChapterQuiz={(cid) => { setPracticeConfig({ level: "chapter", id: cid, mode: "quiz", title: selChapter?.title ?? "Chapter", chapterId: cid, fromStep: practiceConfig.fromStep }); }}
          />
        </div>
      )}
    </div>
  );
}
