/**
 * Admin AI Generator — Question Generator, Quiz Builder, Paper Generator
 * Uses the live server's /ai/papers endpoint (which triggers local Ollama worker).
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ragApi } from "@/lib/api";
import { useCurriculum } from "@/hooks/useCurriculum";
import {
  Brain, Wand2, BookOpen, FileQuestion, ScrollText,
  CheckCircle, ChevronDown, Plus,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button, Card } from "@/components/ui";
import clsx from "clsx";

const PAPER_TYPES = ["quiz_paper", "revision_paper", "practice_paper", "mock_test"];
const DIFFICULTIES = ["easy", "medium", "hard"];

// Queue generation (Celery background task) then poll the paper until it finishes.
async function generateAndPoll(params: any): Promise<any> {
  const { data } = await ragApi.generatePaper(params);
  for (let i = 0; i < 80; i++) {            // ~4 min max
    const r = await ragApi.getPaper(data.id);
    const p = r.data;
    if (p.status && p.status !== "GENERATING") {
      if (p.status === "FAILED") throw new Error(p.content?.error || "Generation failed");
      return p;
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error("Generation is taking long — check 'Generated Papers' shortly.");
}

function Sel({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: (string | number)[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="">Select {label}</option>
          {options.map(o => <option key={o} value={String(o)}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

function Inp({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
      />
    </div>
  );
}

// ── Generated questions preview (shown inline after generation) ───────────────
function GeneratedPreview({ result }: { result: any }) {
  if (!result) return null;
  const qs = (result.content?.sections || []).flatMap((s: any) => s.questions || []);
  return (
    <div className="bg-success-50 dark:bg-success-900/20 border border-success-100 dark:border-success-900/40 rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm text-success-700 dark:text-success-300">
        <CheckCircle className="w-4 h-4 shrink-0" />
        <span className="font-semibold truncate">{result.title}</span>
        <span className="ml-auto text-xs text-success-600 dark:text-success-400 whitespace-nowrap">
          {(result.questions_verified ?? qs.length)} verified · {result.generated_by}
        </span>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {qs.map((q: any, i: number) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-2.5 border border-success-100 dark:border-success-900/40">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{q.q_no ?? i + 1}. {q.question}</p>
            <div className="mt-1 space-y-0.5">
              {(q.options || []).map((o: string, j: number) => {
                const letter = String.fromCharCode(97 + j);
                const correct = q.correct_option === letter;
                return (
                  <p key={j} className={clsx(
                    "text-xs px-2 py-0.5 rounded",
                    correct ? "bg-success-100 dark:bg-success-900/40 text-success-800 dark:text-success-300 font-semibold" : "text-gray-500 dark:text-gray-400"
                  )}>
                    {letter}) {o}{correct ? "  ✓" : ""}
                  </p>
                );
              })}
            </div>
            {q.explanation && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 italic">{q.explanation}</p>}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-success-600 dark:text-success-400">Saved to Generated Papers · ID: {result.id?.slice(0, 8)}…</p>
    </div>
  );
}

// ── Question Generator ────────────────────────────────────────────────────────
function QuestionGenerator() {
  const [board,   setBoard]   = useState("");
  const [cls,     setCls]     = useState("");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [topic,   setTopic]   = useState("");
  const [count,   setCount]   = useState("10");
  const [diff,    setDiff]    = useState("medium");
  const [result,  setResult]  = useState<any | null>(null);
  const { boardOpts, classOpts, subjectOpts } = useCurriculum(board, cls);

  const gen = useMutation({
    mutationFn: () => generateAndPoll({
      paper_type:    "quiz_paper",
      board, class_num: Number(cls), subject, chapter, topic: topic || undefined,
      difficulty:    diff,
      count:         Number(count),
      title:         `${count} Questions – ${chapter || subject}`,
    }),
    onSuccess: (data) => { setResult(data); toast.success("Questions generated!"); },
    onError: (e: any) => toast.error(e?.message?.slice?.(0, 140) || "Generation failed — is Ollama running?"),
  });

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
          <FileQuestion className="w-4 h-4 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Question Generator</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">Generate MCQs and short-answer questions via local LLM</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Sel label="Board"      value={board}   onChange={setBoard}   options={boardOpts}      />
        <Sel label="Class"      value={cls}     onChange={setCls}     options={classOpts}     />
        <Sel label="Subject"    value={subject} onChange={setSubject} options={subjectOpts}    />
        <Sel label="Difficulty" value={diff}    onChange={setDiff}    options={DIFFICULTIES}/>
        <Inp label="Chapter"    value={chapter} onChange={setChapter} placeholder="Real Numbers" />
        <Inp label="Topic"      value={topic}   onChange={setTopic}   placeholder="Optional" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Number of Questions</label>
        <input type="number" min={5} max={50} value={count} onChange={e => setCount(e.target.value)}
          className="w-24 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
      </div>

      <Button
        onClick={() => gen.mutate()}
        disabled={gen.isPending || !board || !cls || !subject || !chapter}
        isLoading={gen.isPending}
        fullWidth
        className="justify-center"
      >
        {!gen.isPending && <Wand2 className="w-4 h-4" />}
        {gen.isPending ? "Generating via Ollama…" : "Generate Questions"}
      </Button>

      <GeneratedPreview result={result} />
    </Card>
  );
}

// ── Quiz Builder ──────────────────────────────────────────────────────────────
function QuizBuilder() {
  const [board,   setBoard]   = useState("");
  const [cls,     setCls]     = useState("");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [title,   setTitle]   = useState("");
  const [diff,    setDiff]    = useState("medium");
  const [marks,   setMarks]   = useState("20");
  const [dur,     setDur]     = useState("30");
  const [result,  setResult]  = useState<any | null>(null);
  const { boardOpts, classOpts, subjectOpts } = useCurriculum(board, cls);

  const gen = useMutation({
    mutationFn: () => generateAndPoll({
      paper_type:   "quiz_paper",
      board, class_num: Number(cls), subject, chapter,
      title:        title || `${subject} Quiz – ${chapter}`,
      difficulty:   diff,
      count:        Math.min(Number(marks) || 10, 25),
    }),
    onSuccess: (data) => { setResult(data); toast.success("Quiz generated!"); },
    onError: (e: any) => toast.error(e?.message?.slice?.(0, 140) || "Generation failed — is Ollama running?"),
  });

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Quiz Builder</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">Create a structured quiz paper record</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Sel label="Board"      value={board}   onChange={setBoard}   options={boardOpts}      />
        <Sel label="Class"      value={cls}     onChange={setCls}     options={classOpts}     />
        <Sel label="Subject"    value={subject} onChange={setSubject} options={subjectOpts}    />
        <Sel label="Difficulty" value={diff}    onChange={setDiff}    options={DIFFICULTIES}/>
        <Inp label="Chapter"    value={chapter} onChange={setChapter} placeholder="Chapter name" />
        <Inp label="Quiz Title" value={title}   onChange={setTitle}   placeholder="Auto-generated if blank" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Inp label="Total Marks"    value={marks} onChange={setMarks} placeholder="20" />
        <Inp label="Duration (min)" value={dur}   onChange={setDur}   placeholder="30" />
      </div>

      <Button
        onClick={() => gen.mutate()}
        disabled={gen.isPending || !board || !cls || !subject || !chapter}
        isLoading={gen.isPending}
        fullWidth
        className="justify-center"
      >
        {!gen.isPending && <Plus className="w-4 h-4" />}
        {gen.isPending ? "Generating via Ollama…" : "Generate Quiz"}
      </Button>

      <GeneratedPreview result={result} />
    </Card>
  );
}

// ── Full Paper Generator ──────────────────────────────────────────────────────
function PaperGenerator() {
  const qc = useQueryClient();
  const [board,   setBoard]   = useState("");
  const [cls,     setCls]     = useState("");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [type,    setType]    = useState("quiz_paper");
  const [diff,    setDiff]    = useState("medium");
  const [title,   setTitle]   = useState("");
  const [marks,   setMarks]   = useState("50");
  const [dur,     setDur]     = useState("60");
  const [result,  setResult]  = useState<any | null>(null);
  const { boardOpts, classOpts, subjectOpts } = useCurriculum(board, cls);

  const gen = useMutation({
    mutationFn: () => generateAndPoll({
      paper_type:   type,
      board, class_num: Number(cls), subject, chapter,
      title:        title || `${subject} ${type.replace("_", " ")} – ${chapter}`,
      difficulty:   diff,
      count:        Math.min(Number(marks) || 10, 25),
    }),
    onSuccess: (data) => {
      setResult(data);
      toast.success("Paper generated!");
      qc.invalidateQueries({ queryKey: ["generated-papers"] });
    },
    onError: (e: any) => toast.error(e?.message?.slice?.(0, 140) || "Generation failed — is Ollama running?"),
  });

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
          <ScrollText className="w-4 h-4 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Paper Generator</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">Create quiz, revision, practice or mock test papers</p>
        </div>
      </div>

      {/* Type pills */}
      <div className="flex gap-2 flex-wrap">
        {PAPER_TYPES.map(t => (
          <button key={t} onClick={() => setType(t)}
            className={clsx(
              "px-3 py-1 rounded-full text-xs font-medium border transition-all",
              type === t
                ? "bg-primary-600 text-white border-primary-600"
                : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-primary-300 dark:hover:border-primary-500"
            )}
          >{t.replace(/_/g, " ")}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Sel label="Board"      value={board}   onChange={setBoard}   options={boardOpts}      />
        <Sel label="Class"      value={cls}     onChange={setCls}     options={classOpts}     />
        <Sel label="Subject"    value={subject} onChange={setSubject} options={subjectOpts}    />
        <Sel label="Difficulty" value={diff}    onChange={setDiff}    options={DIFFICULTIES}/>
        <Inp label="Chapter"    value={chapter} onChange={setChapter} placeholder="Chapter name" />
        <Inp label="Title"      value={title}   onChange={setTitle}   placeholder="Auto-generated if blank" />
        <Inp label="Total Marks"    value={marks} onChange={setMarks} placeholder="50" />
        <Inp label="Duration (min)" value={dur}   onChange={setDur}   placeholder="60" />
      </div>

      <Button
        onClick={() => gen.mutate()}
        disabled={gen.isPending || !board || !cls || !subject || !chapter}
        isLoading={gen.isPending}
        fullWidth
        className="justify-center"
      >
        {!gen.isPending && <Brain className="w-4 h-4" />}
        {gen.isPending ? "Generating via Ollama…" : "Generate Paper"}
      </Button>

      <GeneratedPreview result={result} />
    </Card>
  );
}

// ── Custom Generator ──────────────────────────────────────────────────────────
function CustomGenerator() {
  const qc = useQueryClient();
  const [board,   setBoard]   = useState("");
  const [cls,     setCls]     = useState("");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [focus,   setFocus]   = useState("");
  const [title,   setTitle]   = useState("");
  const [diff,    setDiff]    = useState("mixed");
  const [count,   setCount]   = useState("10");
  const [result,  setResult]  = useState<any | null>(null);
  const { boardOpts, classOpts, subjectOpts } = useCurriculum(board, cls);

  const gen = useMutation({
    mutationFn: () => generateAndPoll({
      paper_type:   "custom",
      board, class_num: Number(cls), subject,
      chapter:      chapter || undefined,
      topic:        focus || undefined,
      title:        title || `Custom – ${focus || chapter || subject}`,
      difficulty:   diff,
      count:        Math.min(Number(count) || 10, 30),
    }),
    onSuccess: (data) => {
      setResult(data);
      toast.success("Custom set generated!");
      qc.invalidateQueries({ queryKey: ["generated-papers"] });
    },
    onError: (e: any) => toast.error(e?.message?.slice?.(0, 140) || "Generation failed"),
  });

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
          <Wand2 className="w-4 h-4 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Custom Generator</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">Build a custom set from your own focus/topic</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Sel label="Board"      value={board}   onChange={setBoard}   options={boardOpts}   />
        <Sel label="Class"      value={cls}     onChange={setCls}     options={classOpts}   />
        <Sel label="Subject"    value={subject} onChange={setSubject} options={subjectOpts} />
        <Sel label="Difficulty" value={diff}    onChange={setDiff}    options={["easy", "medium", "hard", "mixed"]} />
        <Inp label="Chapter"    value={chapter} onChange={setChapter} placeholder="Optional" />
        <Inp label="Title"      value={title}   onChange={setTitle}   placeholder="Auto if blank" />
      </div>
      <Inp label="Custom focus / topic" value={focus} onChange={setFocus} placeholder="e.g. word problems on HCF & LCM" />
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Number of Questions</label>
        <input type="number" min={5} max={30} value={count} onChange={e => setCount(e.target.value)}
          className="w-24 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
      </div>

      <Button
        onClick={() => gen.mutate()}
        disabled={gen.isPending || !board || !cls || !subject || !focus}
        isLoading={gen.isPending}
        fullWidth
        className="justify-center"
      >
        {!gen.isPending && <Wand2 className="w-4 h-4" />}
        {gen.isPending ? "Generating…" : "Generate Custom Set"}
      </Button>

      <GeneratedPreview result={result} />
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AIGeneratePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Generator</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
          Generate questions, quizzes, papers and custom sets. Uses the local Ollama LLM
          when available, with an automatic offline fallback so generation always completes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <QuestionGenerator />
        <QuizBuilder />
        <PaperGenerator />
        <CustomGenerator />
      </div>
    </div>
  );
}
