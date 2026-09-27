import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { aiApi, analyticsApi, contentApi } from "@/lib/api";
import { useAppSelector } from "@/store";
import { useRevisionSession } from "@/hooks/useRevisionSession";
import AIQuestionBank from "@/components/AIQuestionBank";
import { SkeletonCardGrid, SkeletonList } from "@/components/ui/Skeleton";
import UpgradePrompt from "@/components/ui/UpgradePrompt";
import {
  Sparkles, ScrollText, Wand2, Download, Eye, EyeOff,
  Loader, Brain, PlayCircle, Play, Clock,
  ChevronDown, RefreshCw, Search, Zap, CheckCircle, PenLine,
  Layers, RotateCw, CalendarDays, Lightbulb,
} from "lucide-react";

// ── Continue Watching section ─────────────────────────────────────────────────
const SUBJECT_GRADIENT: Record<string, string> = {
  Physics: "from-blue-400 to-indigo-500", Mathematics: "from-purple-400 to-pink-500",
  Chemistry: "from-green-400 to-teal-500", Biology: "from-emerald-400 to-green-600",
  Science: "from-cyan-400 to-blue-500", "Social Science": "from-amber-400 to-orange-500",
};

function fmtDur(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

function ContinueWatchingGrid({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["continue-watching", userId],
    queryFn: () => contentApi.continueWatching(userId, 30).then((r) => r.data),
  });

  const videos: any[] = (data?.videos ?? []);

  if (isLoading) {
    return <SkeletonCardGrid count={4} />;
  }

  if (!videos.length) {
    return (
      <div className="card py-12 text-center">
        <PlayCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">No videos in progress yet</p>
        <p className="text-xs text-gray-400 mt-1">Start watching any video — it will appear here with your progress.</p>
        <button onClick={() => navigate("/learn")}
          className="mt-4 inline-flex items-center gap-2 bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-700 transition-colors">
          <Play className="w-4 h-4" fill="currentColor" /> Browse Videos
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {videos.map((v: any) => {
        const grad = SUBJECT_GRADIENT[v.subject ?? ""] ?? "from-gray-400 to-gray-600";
        const img = v.thumbnail_url || (v.youtube_id ? `https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg` : "");
        const progress = Math.round(v.progress ?? 0);
        return (
          <button key={v.id} onClick={() => navigate(`/learn/video/${v.id}`)}
            className="group text-left">
            {/* Thumbnail */}
            <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 shadow-sm group-hover:shadow-xl transition-all group-hover:-translate-y-1 ring-1 ring-black/5 dark:ring-white/5">
              {img ? (
                <img src={img} alt={v.title} loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center`}>
                  <PlayCircle className="w-8 h-8 text-white/80" />
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all">
                  <Play className="w-4 h-4 text-gray-900 ml-0.5" fill="currentColor" />
                </div>
              </div>
              {/* Duration */}
              {v.duration_seconds > 0 && (
                <span className="absolute bottom-3 right-2 text-[10px] font-semibold bg-black/75 text-white px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> {fmtDur(v.duration_seconds)}
                </span>
              )}
              {/* Netflix progress bar */}
              <div className="absolute bottom-0 inset-x-0">
                <div className="h-1 bg-white/20">
                  <div className="h-full bg-red-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
            {/* Info */}
            <div className="mt-2 px-0.5">
              <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-tight group-hover:text-primary-600 dark:group-hover:text-primary-400">
                {v.title}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── AI revision is organised into six categories ──────────────────────────────
type TabKey = "questions" | "quiz" | "paper" | "custom" | "flashcards" | "plan";

const TABS: { key: TabKey; label: string; icon: React.ElementType; blurb: string;
  accent: string; types?: string[]; buttonLabel: string }[] = [
  { key: "questions", label: "AI Questions", icon: Sparkles,   blurb: "Generate practice questions",
    accent: "text-primary-600", buttonLabel: "AI Question Generate" },
  { key: "quiz",      label: "AI Quiz",      icon: Brain,      blurb: "Auto-generated quizzes",
    accent: "text-primary-600",  types: ["quiz_paper"], buttonLabel: "Generate Quiz" },
  { key: "paper",     label: "AI Paper",     icon: ScrollText, blurb: "Practice & mock papers",
    accent: "text-primary-600", types: ["practice_paper", "mock_test", "revision_paper"], buttonLabel: "Find Papers" },
  { key: "custom",    label: "AI Custom",    icon: Wand2,      blurb: "Custom-built papers",
    accent: "text-primary-600", types: ["custom"], buttonLabel: "Generate Custom" },
  { key: "flashcards", label: "Flashcards",  icon: Layers,     blurb: "Flip cards to memorize fast",
    accent: "text-primary-600", buttonLabel: "Generate Flashcards" },
  { key: "plan",       label: "Revision Plan", icon: CalendarDays, blurb: "Day-wise plan for weak topics",
    accent: "text-primary-600", buttonLabel: "Build My Plan" },
];

// ── Shared select widget (mirrors AIQuestionBank) ─────────────────────────────
function Sel({ label, value, onChange, options }: {
  label: string; value: string;
  onChange: (v: string) => void;
  options: (string | number)[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full appearance-none text-sm bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 pr-8 border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-100">
          <option value="">Select {label}</option>
          {options.map(o => <option key={o} value={String(o)}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

// ── PaperFetcher — filters + fetches admin-pre-generated papers from Redis/DB ──
interface PaperFetcherProps {
  paperTypes: { value: string; label: string }[];
  accent: string;
  Icon: React.ElementType;
  buttonLabel: string;
  onFetched: (papers: any[]) => void;
  maxLimit?: number;   // when set, shows the count slider (quiz/custom: 30)
  feature?: string;    // rate-limit bucket: "quiz" | "custom" — each independent from "questions"
}

function PaperFetcher({ paperTypes, accent, Icon, buttonLabel, onFetched, maxLimit, feature }: PaperFetcherProps) {
  const [board,     setBoard]     = useState("");
  const [cls,       setCls]       = useState("");
  const [subject,   setSubject]   = useState("");
  const [chapter,   setChapter]   = useState("");
  const [paperType, setPaperType] = useState(paperTypes[0].value);
  const [count,     setCount]     = useState(maxLimit ? 10 : 50);
  const [loading,   setLoading]   = useState(false);
  const [source,    setSource]    = useState<"cache" | "db" | "">("");
  const [empty,     setEmpty]     = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  // quiz / custom mode: questions fetched and rendered inline
  const [questions, setQuestions] = useState<any[] | null>(null);
  const [revealQ,   setRevealQ]   = useState<Record<number, boolean>>({});

  // Curriculum cascade
  const { data: boards = [] } = useQuery({
    queryKey: ["gen-boards"],
    queryFn: () => contentApi.boards().then(r => r.data),
    staleTime: 3e5,
  });
  const boardObj = (boards as any[]).find(b => b.name === board || b.code === board);
  const { data: classes = [] } = useQuery({
    queryKey: ["gen-classes", boardObj?.id],
    queryFn: () => contentApi.classes(boardObj.id).then(r => r.data),
    enabled: !!boardObj?.id,
  });
  const classObj = (classes as any[]).find(c => String(c.number) === cls);
  const { data: subjects = [] } = useQuery({
    queryKey: ["gen-subjects", classObj?.id],
    queryFn: () => contentApi.subjects(classObj.id).then(r => r.data),
    enabled: !!classObj?.id,
  });
  const subjectObj = (subjects as any[]).find(s => s.name === subject);
  const { data: chapters = [] } = useQuery({
    queryKey: ["gen-chapters", subjectObj?.id],
    queryFn: () => contentApi.chapters(subjectObj.id).then(r => r.data),
    enabled: !!subjectObj?.id,
  });

  const handleFetch = async () => {
    setLoading(true); setEmpty(false); setSource(""); setError(null); setLimitReached(false);
    setQuestions(null); setRevealQ({});
    try {
      if (maxLimit) {
        // Quiz / Custom: fetch exactly `count` random questions from the question bank.
        // Pass `feature` so each tab tracks its own independent daily limit.
        const { data } = await aiApi.questions({
          board: board || undefined,
          class_num: cls ? Number(cls) : undefined,
          subject: subject || undefined,
          chapter: chapter || undefined,
          count,
          feature: feature ?? "questions",
        });
        const qs: any[] = data.questions ?? [];
        setSource(data.source === "cache" ? "cache" : "db");
        setEmpty(qs.length === 0);
        if (data.remaining_uses !== undefined && data.remaining_uses !== null) {
          setRemaining(data.remaining_uses as number);
        }
        setQuestions(qs);
        onFetched([]); // questions rendered inline; suppress PaperCard list in parent
      } else {
        // Paper tab: fetch pre-generated paper objects
        const { data } = await aiApi.getPapers({
          paper_type: paperType || undefined,
          board: board || undefined,
          class_num: cls ? Number(cls) : undefined,
          subject: subject || undefined,
          chapter: chapter || undefined,
          limit: count,
        });
        const papers: any[] = data.papers ?? [];
        setSource(data.source === "cache" ? "cache" : "db");
        setEmpty(papers.length === 0);
        if (data.remaining_uses !== undefined && data.remaining_uses !== null) {
          setRemaining(data.remaining_uses as number);
        }
        onFetched(papers);
      }
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;
      const detail: string | undefined = err?.response?.data?.detail ?? err?.response?.data?.message;
      if (status === 429) {
        setError(detail ?? "");
        setLimitReached(true);
        setRemaining(0);
      } else if (status === 403) {
        setError("Access denied — the AI service is still starting up. Wait 30 seconds and try again, or ask your admin.");
      } else if (status === 503 || status === 502) {
        setError("AI service is temporarily unavailable. Please try again in a moment.");
      } else if (detail) {
        setError(detail);
      } else {
        setError("Failed to load content. Please check your connection and try again.");
      }
      setEmpty(false);
      onFetched([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-4 space-y-4 border-2 border-dashed border-gray-200 dark:border-gray-700">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Find Content</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Sel label="Board"   value={board}   onChange={v => { setBoard(v); setCls(""); setSubject(""); setChapter(""); }}
          options={(boards as any[]).map((b: any) => b.name)} />
        <Sel label="Class"   value={cls}     onChange={v => { setCls(v); setSubject(""); setChapter(""); }}
          options={(classes as any[]).map((c: any) => c.number)} />
        <Sel label="Subject" value={subject} onChange={v => { setSubject(v); setChapter(""); }}
          options={(subjects as any[]).map((s: any) => s.name)} />
        <Sel label="Chapter" value={chapter} onChange={setChapter}
          options={(chapters as any[]).map((c: any) => c.title)} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {paperTypes.length > 1 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Type</label>
            <div className="relative">
              <select value={paperType} onChange={e => setPaperType(e.target.value)}
                className="appearance-none text-sm bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 pr-8 border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-100">
                {paperTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        )}

        {maxLimit && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Count: <span className="font-bold text-primary-600">{count}</span> (max {maxLimit})
            </label>
            <input
              type="range" min={1} max={maxLimit} value={count}
              onChange={e => setCount(Number(e.target.value))}
              className="w-44 accent-primary-600"
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <button
            onClick={handleFetch}
            disabled={loading || !subject || remaining === 0}
            className={`btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50 ${accent}`}
          >
            {loading
              ? <Loader className="w-4 h-4 animate-spin" />
              : <Icon className="w-4 h-4" />}
            {loading ? "Loading…" : buttonLabel}
          </button>
          {remaining !== null && (
            <span className={`text-[11px] text-center font-medium ${remaining === 0 ? "text-red-500" : remaining === 1 ? "text-amber-500" : "text-gray-400"}`}>
              {remaining === 0 ? "Limit reached · resets midnight" : `${remaining} use${remaining === 1 ? "" : "s"} left today`}
            </span>
          )}
        </div>
      </div>

      {source && !empty && !error && (
        <p className="text-xs text-gray-400">
          {source === "cache"
            ? <><Zap className="w-3 h-3 inline mr-1 text-yellow-500" />From cache</>
            : <><Search className="w-3 h-3 inline mr-1" />From database</>}
        </p>
      )}
      {error && limitReached && <UpgradePrompt message={error} variant="compact" />}
      {error && !limitReached && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>{error}</span>
        </div>
      )}
      {empty && !error && (
        <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-4 py-3">
          No content available for this selection yet — the admin generates content which appears here.
        </div>
      )}

      {/* Quiz / Custom: inline question cards (same UI as AIQuestionBank) */}
      {questions !== null && questions.length > 0 && (
        <div className="space-y-3 animate-slide-up">
          <p className="text-xs text-gray-400 px-1">
            {questions.length} questions ·{" "}
            {source === "cache"
              ? <><Zap className="w-3 h-3 inline mr-1 text-yellow-500" />from cache</>
              : <>from database</>}
          </p>
          {questions.map((q, i) => {
            const shown = revealQ[i];
            return (
              <div key={i} className="card p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{i + 1}. {q.question}</p>
                <div className="space-y-1.5">
                  {(q.options || []).map((o: string, j: number) => {
                    const letter = String.fromCharCode(97 + j);
                    const correct = shown && q.correct_option === letter;
                    return (
                      <div key={j} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm border ${correct ? "border-green-500 bg-green-50 dark:bg-green-900/20" : "border-gray-100 dark:border-gray-700"}`}>
                        <span className={`font-bold uppercase ${correct ? "text-green-600" : "text-gray-400"}`}>{letter}.</span>
                        <span className={correct ? "text-green-800 dark:text-green-300 font-medium" : "text-gray-700 dark:text-gray-300"}>{o}</span>
                        {correct && <CheckCircle className="w-4 h-4 text-green-500 ml-auto flex-shrink-0" />}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setRevealQ(r => ({ ...r, [i]: !r[i] }))}
                    className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                    {shown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {shown ? "Hide Answer" : "Show Answer"}
                  </button>
                  {shown && q.explanation && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic">{q.explanation}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Flashcards tab — topic → flip cards (front/back/hint) ─────────────────────
function FlashcardsPanel() {
  const [board,   setBoard]   = useState("");
  const [cls,     setCls]     = useState("");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [topic,   setTopic]   = useState("");
  const [count,   setCount]   = useState(8);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [cards,   setCards]   = useState<{ front: string; back: string; hint?: string }[] | null>(null);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});

  const { data: boards = [] } = useQuery({
    queryKey: ["gen-boards"],
    queryFn: () => contentApi.boards().then(r => r.data),
    staleTime: 3e5,
  });
  const boardObj = (boards as any[]).find(b => b.name === board || b.code === board);
  const { data: classes = [] } = useQuery({
    queryKey: ["gen-classes", boardObj?.id],
    queryFn: () => contentApi.classes(boardObj.id).then(r => r.data),
    enabled: !!boardObj?.id,
  });
  const classObj = (classes as any[]).find(c => String(c.number) === cls);
  const { data: subjects = [] } = useQuery({
    queryKey: ["gen-subjects", classObj?.id],
    queryFn: () => contentApi.subjects(classObj.id).then(r => r.data),
    enabled: !!classObj?.id,
  });
  const subjectObj = (subjects as any[]).find(s => s.name === subject);
  const { data: chapters = [] } = useQuery({
    queryKey: ["gen-chapters", subjectObj?.id],
    queryFn: () => contentApi.chapters(subjectObj.id).then(r => r.data),
    enabled: !!subjectObj?.id,
  });

  const handleGenerate = async () => {
    setLoading(true); setError(null); setLimitReached(false); setCards(null); setFlipped({});
    try {
      const { data } = await aiApi.flashcards({
        topic: topic || chapter || subject,
        subject: subject || undefined,
        chapter: chapter || undefined,
        board: board || undefined,
        class_num: cls ? Number(cls) : undefined,
        count,
      });
      setCards(data.flashcards ?? []);
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;
      const detail: string | undefined = err?.response?.data?.detail;
      if (status === 429) setLimitReached(true);
      setError(detail ?? "Couldn't generate flashcards. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4 border-2 border-dashed border-gray-200 dark:border-gray-700">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Build Flashcards</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Sel label="Board"   value={board}   onChange={v => { setBoard(v); setCls(""); setSubject(""); setChapter(""); }}
            options={(boards as any[]).map((b: any) => b.name)} />
          <Sel label="Class"   value={cls}     onChange={v => { setCls(v); setSubject(""); setChapter(""); }}
            options={(classes as any[]).map((c: any) => c.number)} />
          <Sel label="Subject" value={subject} onChange={v => { setSubject(v); setChapter(""); }}
            options={(subjects as any[]).map((s: any) => s.name)} />
          <Sel label="Chapter" value={chapter} onChange={setChapter}
            options={(chapters as any[]).map((c: any) => c.title)} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Topic (optional — defaults to chapter/subject)</label>
            <input
              type="text" value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Photosynthesis"
              className="text-sm bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Cards: <span className="font-bold text-primary-600">{count}</span>
            </label>
            <input type="range" min={3} max={20} value={count} onChange={e => setCount(Number(e.target.value))} className="w-36 accent-primary-600" />
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading || (!topic && !chapter && !subject)}
            className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            {loading ? "Generating…" : "Generate Flashcards"}
          </button>
        </div>
        {error && limitReached && <UpgradePrompt message={error} variant="compact" />}
        {error && !limitReached && (
          <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
            <span className="shrink-0 mt-0.5">⚠</span><span>{error}</span>
          </div>
        )}
      </div>

      {cards && cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-slide-up">
          {cards.map((c, i) => {
            const isFlipped = !!flipped[i];
            return (
              <button
                key={i}
                onClick={() => setFlipped(f => ({ ...f, [i]: !f[i] }))}
                className={`text-left rounded-2xl p-5 min-h-[140px] flex flex-col justify-between transition-all hover:shadow-md border-2 ${
                  isFlipped
                    ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800"
                    : "bg-primary-50 dark:bg-primary-900/20 border-primary-100 dark:border-primary-800"
                }`}
              >
                {isFlipped ? (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Answer</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.back}</p>
                    {c.hint ? (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-1">
                        <Lightbulb className="w-3 h-3 flex-shrink-0 mt-0.5" /> {c.hint}
                      </p>
                    ) : (
                      <p className="text-[11px] text-gray-400 flex items-center gap-1"><RotateCw className="w-3 h-3" /> Tap to flip back</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-primary-500">Question</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.front}</p>
                    <p className="text-[11px] text-gray-400 flex items-center gap-1"><RotateCw className="w-3 h-3" /> Tap to flip</p>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Revision Plan tab — weak topics → day-wise AI plan ────────────────────────
function RevisionPlanPanel({ userId }: { userId: string }) {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [result, setResult] = useState<{ plan: any[]; summary: string } | null>(null);

  const { data: weakData } = useQuery({
    queryKey: ["weak-topics", userId],
    queryFn: () => analyticsApi.weakTopics(userId).then(r => r.data),
    enabled: !!userId,
  });
  const weakTopics: { topic_id: string; accuracy: number; attempts: number }[] = weakData?.weak_topics ?? [];

  const handleGenerate = async () => {
    setLoading(true); setError(null); setLimitReached(false); setResult(null);
    try {
      const { data } = await aiApi.revisionPlan({
        weak_topics: weakTopics.map(t => t.topic_id),
        days,
      });
      setResult(data);
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;
      const detail: string | undefined = err?.response?.data?.detail;
      if (status === 429) setLimitReached(true);
      setError(detail ?? "Couldn't build a revision plan. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4 border-2 border-dashed border-gray-200 dark:border-gray-700">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Build Your Revision Plan</p>
        {weakTopics.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No weak topics detected yet — attempt a few quizzes first so we know what to focus your plan on.
          </p>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Based on <span className="font-semibold text-primary-600">{weakTopics.length}</span> topic(s) you're weak in.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Days: <span className="font-bold text-primary-600">{days}</span>
            </label>
            <input type="range" min={1} max={14} value={days} onChange={e => setDays(Number(e.target.value))} className="w-40 accent-primary-600" />
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading || weakTopics.length === 0}
            className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
            {loading ? "Building…" : "Build My Plan"}
          </button>
        </div>
        {error && limitReached && <UpgradePrompt message={error} variant="compact" />}
        {error && !limitReached && (
          <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
            <span className="shrink-0 mt-0.5">⚠</span><span>{error}</span>
          </div>
        )}
      </div>

      {result && result.plan?.length > 0 && (
        <div className="space-y-3 animate-slide-up">
          <p className="text-sm text-gray-600 dark:text-gray-300 italic">{result.summary}</p>
          {result.plan.map((d: any, i: number) => (
            <div key={i} className="card p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {d.day ?? i + 1}
                </span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{d.date_label ?? `Day ${d.day ?? i + 1}`}</p>
                  {d.focus && <p className="text-xs text-gray-400">{d.focus}</p>}
                </div>
              </div>
              {Array.isArray(d.topics) && d.topics.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span className="font-semibold">Topics:</span> {d.topics.join(", ")}
                </p>
              )}
              {Array.isArray(d.actions) && d.actions.length > 0 && (
                <ul className="text-xs text-gray-600 dark:text-gray-300 list-disc list-inside space-y-0.5">
                  {d.actions.map((a: string, j: number) => <li key={j}>{a}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function downloadPaper(p: any) {
  const lines: string[] = [
    p.title ?? "Untitled",
    `${p.board ?? ""} · Class ${p.class_num ?? ""} · ${p.subject ?? ""} · ${p.chapter ?? ""}`,
    `Type: ${p.paper_type?.replace(/_/g, " ")} · ${p.difficulty ?? ""} · ${p.total_marks ?? 0} marks · ${p.duration_min ?? 0} min`,
    "",
  ];
  (p.content?.sections ?? []).forEach((sec: any) => {
    lines.push(`=== ${sec.section_name} ===`);
    (sec.questions ?? []).forEach((q: any) => {
      lines.push(`Q${q.q_no}. ${q.question}`);
      (q.options ?? []).forEach((o: string) => lines.push(`   ${o}`));
      if (q.answer) lines.push(`Answer: ${q.answer}`);
      if (q.explanation) lines.push(`Explanation: ${q.explanation}`);
      lines.push("");
    });
  });
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(p.title ?? "paper").replace(/\s+/g, "_")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// The answer key is `correct_option` (lowercase letter) when present, else
// `answer` — which is sometimes a letter ("C") and sometimes the option text.
// Returns the option letter, for marking the right row in the UI.
function correctLetter(q: any): string | null {
  const key = String(q.correct_option ?? q.answer ?? "").trim();
  if (!key) return null;
  if (key.length === 1) return key.toLowerCase();
  const i = (q.options ?? []).findIndex((o: string) => o.replace(/^[a-dA-D][).:-]\s*/, "").trim() === key);
  return i >= 0 ? String.fromCharCode(97 + i) : null;
}

// ── A single generated paper card (view inline + reveal answers + download) ────
function PaperCard({ p }: { p: any }) {
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const [attempting, setAttempting] = useState(false);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const questions: any[] = useMemo(
    () => (p.content?.sections ?? []).flatMap((s: any) => s.questions ?? []),
    [p],
  );

  // Preview only reveals the answer key — the student submits nothing, so the
  // attempt stays in_progress rather than inventing a score. Attempt mode below
  // completes it. Best-effort: a failure must not break either flow.
  const attemptRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const startedAtRef = useRef(0);
  const startAttempt = async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    try {
      const { data } = await aiApi.startPaperAttempt(p.id);
      attemptRef.current = data.id;
    } catch (e) {
      console.warn("paper attempt start failed", e);
    }
  };

  // Preview and attempt are mutually exclusive — showing the key next to an
  // in-progress attempt would give the answers away.
  const openPreview = () => {
    setOpen(o => !o);
    setAttempting(false);
    startAttempt();
  };

  const enterAttempt = () => {
    setAttempting(true);
    setOpen(false);
    setPicked({});
    setResult(null);
    startedAtRef.current = Date.now();
    // A retry after submitting needs its own attempt row, not the completed one.
    if (result) startedRef.current = false;
    startAttempt();
  };

  const submitAttempt = async () => {
    setSubmitting(true);
    const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
    try {
      // The server grades from the paper's answer key — we never send a score.
      if (!attemptRef.current) throw new Error("attempt was never started");
      const { data } = await aiApi.submitPaperAttempt(attemptRef.current, picked, elapsed);
      setResult(data);
    } catch (e) {
      console.warn("paper attempt submit failed", e);
      setResult({});   // still reveal the student their own answers
    } finally {
      setSubmitting(false);
    }
  };

  const tone =
    p.paper_type === "quiz_paper"     ? { bg: "bg-blue-100 dark:bg-blue-900/30",   fg: "text-blue-600 dark:text-blue-400" }
    : p.paper_type === "custom"        ? { bg: "bg-primary-100 dark:bg-primary-900/30", fg: "text-primary-600 dark:text-primary-400" }
    : p.paper_type === "revision_paper"? { bg: "bg-teal-100 dark:bg-teal-900/30",   fg: "text-teal-600 dark:text-teal-400" }
    : p.paper_type === "practice_paper"? { bg: "bg-orange-100 dark:bg-orange-900/30", fg: "text-orange-600 dark:text-orange-400" }
    : { bg: "bg-red-100 dark:bg-red-900/30", fg: "text-red-600 dark:text-red-400" };

  return (
    <div className="card hover:shadow-md transition-shadow border-2 border-transparent hover:border-primary-200 dark:hover:border-primary-700">
      <div className="flex items-center gap-4 flex-wrap">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tone.bg}`}>
          <ScrollText className={`w-5 h-5 ${tone.fg}`} />
        </div>
        <div className="flex-1 min-w-0 basis-40">
          <p className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-1">{p.title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[11px] font-medium text-gray-400 capitalize">{p.paper_type?.replace(/_/g, " ")}</span>
            <span className="text-xs text-gray-400">{[p.subject, p.chapter].filter(Boolean).join(" · ")}</span>
            {p.difficulty && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                p.difficulty === "easy"   ? "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : p.difficulty === "hard" ? "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400"
              }`}>{p.difficulty}</span>
            )}
            <span className="text-xs text-gray-400">{p.total_marks ?? questions.length} marks · {p.duration_min ?? "—"} min</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {questions.length > 0 && (
            <button
              onClick={openPreview}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-3 py-1.5 rounded-xl hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
            >
              {open ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {open ? "Hide" : "Preview"}
            </button>
          )}
          {questions.length > 0 && (
            <button
              onClick={() => (attempting ? setAttempting(false) : enterAttempt())}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              <PenLine className="w-3.5 h-3.5" /> {attempting ? "Close" : "Attempt paper"}
            </button>
          )}
          <button
            onClick={() => downloadPaper(p)}
            className="flex items-center gap-1.5 text-xs font-semibold text-success-700 dark:text-success-400 bg-success-50 dark:bg-success-900/20 px-3 py-1.5 rounded-xl hover:bg-success-100 dark:hover:bg-success-900/30 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
          {questions.map((q: any, i: number) => {
            const shown = reveal[i];
            const ans = q.answer ?? q.correct_option;
            return (
              <div key={i} className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{q.q_no ?? i + 1}. {q.question}</p>
                {Array.isArray(q.options) && q.options.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {q.options.map((o: string, j: number) => {
                      const letter = String.fromCharCode(97 + j);
                      const correct = shown && q.correct_option === letter;
                      return (
                        <div key={j} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border ${
                          correct ? "border-green-500 bg-green-50 dark:bg-green-900/20" : "border-transparent"
                        }`}>
                          <span className={`font-bold uppercase ${correct ? "text-green-600" : "text-gray-400"}`}>{letter}.</span>
                          <span className={correct ? "text-green-800 dark:text-green-300 font-medium" : "text-gray-600 dark:text-gray-300"}>{o}</span>
                          {correct && <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-auto" />}
                        </div>
                      );
                    })}
                  </div>
                )}
                {ans && (
                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => setReveal(r => ({ ...r, [i]: !r[i] }))}
                      className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                    >
                      {shown ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {shown ? "Hide Answer" : "Show Answer"}
                    </button>
                    {shown && q.explanation && <span className="text-xs text-gray-500 dark:text-gray-400 italic">{q.explanation}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {attempting && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
          {result && (
            <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 px-3 py-2.5">
              {result.percentage !== undefined ? (
                <>
                  <p className="text-sm font-bold text-primary-800 dark:text-primary-300">
                    Score {result.score} · {result.percentage}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {result.correct_count} correct · {result.wrong_count} wrong
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Couldn't save your attempt — your answers are shown below.
                </p>
              )}
            </div>
          )}

          {questions.map((q: any, i: number) => {
            const key = correctLetter(q);
            return (
              <div key={i} className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{q.q_no ?? i + 1}. {q.question}</p>
                <div className="mt-2 space-y-1.5">
                  {(q.options ?? []).map((o: string, j: number) => {
                    const letter = String.fromCharCode(97 + j);
                    const chosen = picked[i] === letter;
                    const isKey = !!result && letter === key;
                    return (
                      <label key={j} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-xs border cursor-pointer ${
                        isKey ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                        : result && chosen ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                        : chosen ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                        : "border-gray-200 dark:border-gray-700"
                      }`}>
                        <input
                          type="radio" name={`${p.id}-${i}`} checked={chosen} disabled={!!result}
                          onChange={() => setPicked(a => ({ ...a, [i]: letter }))}
                          className="mt-0.5 accent-primary-600 flex-shrink-0"
                        />
                        <span className="font-bold uppercase text-gray-400">{letter}.</span>
                        <span className="text-gray-700 dark:text-gray-300 min-w-0 break-words">{o}</span>
                      </label>
                    );
                  })}
                </div>
                {result && q.explanation && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">{q.explanation}</p>
                )}
              </div>
            );
          })}

          {!result && (
            <button
              onClick={submitAttempt}
              disabled={submitting}
              className="btn-primary w-full sm:w-auto px-5 py-2.5 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {submitting ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Submit ({Object.keys(picked).length}/{questions.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── List of papers for a category tab ─────────────────────────────────────────
function PaperList({ papers, loading, label }: { papers: any[]; loading: boolean; label: string }) {
  if (loading) {
    return <SkeletonList rows={3} />;
  }
  if (papers.length === 0) {
    return (
      <div className="card py-14 text-center">
        <ScrollText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">No {label.toLowerCase()} yet</p>
        <p className="text-xs text-gray-400 mt-1">New {label.toLowerCase()} appear here automatically once generated.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 animate-slide-up">
      {papers.map((p: any) => <PaperCard key={p.id} p={p} />)}
    </div>
  );
}

// Paper type options per tab
const PAPER_TYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  quiz:   [{ value: "quiz_paper",      label: "Quiz Paper" }],
  paper:  [
    { value: "practice_paper", label: "Practice Paper" },
    { value: "mock_test",      label: "Mock Test" },
    { value: "revision_paper", label: "Revision Paper" },
  ],
  custom: [{ value: "custom", label: "Custom Paper" }],
};

export default function RevisionCenterPage() {
  const user = useAppSelector((s) => s.auth.user);
  const [tab, setTab] = useState<TabKey>("questions");
  const [fetchedPapers, setFetchedPapers] = useState<any[]>([]);
  const [showList, setShowList] = useState(false);

  // The revision centre has no per-topic drill-down, so the session spans the
  // student's time on the page.
  useRevisionSession(!!user?.id, "manual");

  // Lightweight count query — used only for badge numbers; silently fails if backend rebuilding
  const { data: papersData, isLoading, refetch: refetchPapers } = useQuery({
    queryKey: ["ai-papers-all"],
    queryFn: () => aiApi.getPapers({ limit: 100 }).then(r => r.data),
    staleTime: 60_000,
    retry: 2,
    retryDelay: 5000,
  });
  const allPapers: any[] = papersData?.papers ?? [];

  const countFor = (types?: string[]) =>
    !types ? null : allPapers.filter((p: any) => types.includes(p.paper_type)).length;

  const activeTab = TABS.find(t => t.key === tab)!;

  const handleFetchedPapers = (papers: any[]) => {
    setFetchedPapers(papers);
    setShowList(papers.length > 0);
    refetchPapers();
  };

  return (
    <div className="space-y-6 w-full animate-fade-in">

      {/* ── Continue Watching ── */}
      {user?.id && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <PlayCircle className="w-5 h-5 text-red-500" />
            <h2 className="font-bold text-gray-900 dark:text-white text-lg">Continue Watching</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">· Pick up where you left off</span>
          </div>
          <ContinueWatchingGrid userId={user.id} />
        </section>
      )}

      {/* Hero */}
      <div className="rounded-2xl bg-primary-600 p-6 text-white relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -right-2 bottom-0 w-24 h-24 bg-white/10 rounded-full" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0 backdrop-blur">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Revision Center</h1>
            <p className="text-primary-100 text-sm mt-0.5">
              Generate questions and explore AI quizzes, papers and custom sets — answers on demand.
            </p>
          </div>
        </div>
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {TABS.map(({ key, label, icon: Icon, blurb, accent, types }) => {
          const count = countFor(types);
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`text-left rounded-2xl p-4 border-2 transition-all ${
                active
                  ? "border-primary-500 shadow-md -translate-y-0.5 bg-white dark:bg-gray-800"
                  : "border-transparent bg-white dark:bg-gray-800/60 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-sm"
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center mb-3">
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-900 dark:text-white text-sm">{label}</p>
                {count !== null && (
                  <span className={`text-xs font-bold ${accent}`}>{count}</span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">{blurb}</p>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === "questions" ? (
        <AIQuestionBank />
      ) : tab === "flashcards" ? (
        <FlashcardsPanel />
      ) : tab === "plan" ? (
        <RevisionPlanPanel userId={user?.id ?? ""} />
      ) : (
        <div className="space-y-4">
          <PaperFetcher
            key={tab}
            paperTypes={PAPER_TYPE_OPTIONS[tab]}
            accent="bg-primary-600 hover:bg-primary-700"
            Icon={activeTab.icon}
            buttonLabel={activeTab.buttonLabel}
            onFetched={handleFetchedPapers}
            maxLimit={tab === "quiz" || tab === "custom" ? 30 : undefined}
            feature={tab === "quiz" ? "quiz" : tab === "custom" ? "custom" : undefined}
          />
          {fetchedPapers.length > 0 && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <button
                  onClick={() => setShowList(s => !s)}
                  className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all ${
                    showList
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                      : "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/50"
                  }`}
                >
                  {showList
                    ? <><EyeOff className="w-4 h-4" /> Hide Results ({fetchedPapers.length})</>
                    : <><Eye className="w-4 h-4" /> View Results ({fetchedPapers.length}) {activeTab.label.replace("AI ", "")}</>}
                </button>
                <button
                  onClick={() => refetchPapers()}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh counts
                </button>
              </div>
              {showList && <PaperList papers={fetchedPapers} loading={isLoading} label={activeTab.label} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
