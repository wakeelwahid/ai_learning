import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { contentApi, aiApi } from "@/lib/api";
import {
  Sparkles, Download, Eye, EyeOff, Loader2, ChevronDown, CheckCircle, AlertCircle,
} from "lucide-react";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v?: string) => !!v && UUID_RE.test(v);

interface QBItem {
  question: string; options: string[];
  correct_option?: string; answer?: string; explanation?: string; chapter?: string;
}

/** AI Question Generate — student-facing random question fetch (Redis-first, 3/day). */
export default function AIQuestionBank() {
  const [board, setBoard]         = useState("");
  const [cls, setCls]             = useState("");
  const [subject, setSubject]     = useState("");
  const [chapter, setChapter]     = useState("");
  const [count, setCount]         = useState(10);
  const [items, setItems]         = useState<QBItem[] | null>(null);
  const [reveal, setReveal]       = useState<Record<number, boolean>>({});
  const [loading, setLoading]     = useState(false);
  const [source, setSource]       = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const { data: boards = [] } = useQuery({ queryKey: ["qb-boards"], queryFn: () => contentApi.boards().then(r => r.data), staleTime: 3e5 });
  const boardObj = (boards as any[]).find(b => b.name === board || b.code === board);
  const { data: classes = [] } = useQuery({ queryKey: ["qb-classes", boardObj?.id], queryFn: () => contentApi.classes(boardObj.id).then(r => r.data), enabled: isUUID(boardObj?.id) });
  const classObj = (classes as any[]).find(c => String(c.number) === cls);
  const { data: subjects = [] } = useQuery({ queryKey: ["qb-subjects", classObj?.id], queryFn: () => contentApi.subjects(classObj.id).then(r => r.data), enabled: isUUID(classObj?.id) });
  const subjectObj = (subjects as any[]).find(s => s.name === subject);
  const { data: chapters = [] } = useQuery({ queryKey: ["qb-chapters", subjectObj?.id], queryFn: () => contentApi.chapters(subjectObj.id).then(r => r.data), enabled: isUUID(subjectObj?.id) });

  const fetchQuestions = async () => {
    setLoading(true); setItems(null); setReveal({}); setError(null);
    try {
      const { data } = await aiApi.questions({
        board: board || undefined, class_num: cls ? Number(cls) : undefined,
        subject: subject || undefined, chapter: chapter || undefined, count,
      });
      setItems(Array.isArray(data.questions) ? data.questions : []);
      setSource(data.source ?? "");
      if (data.remaining_uses !== undefined && data.remaining_uses !== null) {
        setRemaining(data.remaining_uses as number);
      }
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;
      const detail: string | undefined = err?.response?.data?.detail;
      if (status === 429) {
        setError(detail ?? "Daily limit reached (3/day). Resets at midnight.");
        setRemaining(0);
      } else {
        setError(detail ?? "Failed to load questions. Please try again.");
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!items?.length) return;
    const lines = items.map((q, i) => {
      const opts = (q.options || []).map((o, j) => `   ${String.fromCharCode(97 + j)}) ${o}`).join("\n");
      return `Q${i + 1}. ${q.question}\n${opts}\n   Answer: ${q.correct_option?.toUpperCase() ?? q.answer ?? "-"}\n   ${q.explanation ? "Explanation: " + q.explanation : ""}`;
    });
    const blob = new Blob([`AI Questions — ${subject} ${chapter}\n\n${lines.join("\n\n")}`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `ai_questions_${subject || "bank"}.txt`; a.click();
    URL.revokeObjectURL(a.href);
  };

  const Sel = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: (string | number)[] }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full appearance-none text-sm bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 pr-8 border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-100">
          <option value="">{`Select ${label}`}</option>
          {options.map(o => <option key={o} value={String(o)}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Sel label="Board"   value={board}   onChange={v => { setBoard(v); setCls(""); setSubject(""); setChapter(""); }} options={(boards as any[]).map(b => b.name)} />
          <Sel label="Class"   value={cls}     onChange={v => { setCls(v); setSubject(""); setChapter(""); }} options={(classes as any[]).map(c => c.number)} />
          <Sel label="Subject" value={subject} onChange={v => { setSubject(v); setChapter(""); }} options={(subjects as any[]).map(s => s.name)} />
          <Sel label="Chapter" value={chapter} onChange={setChapter} options={(chapters as any[]).map(c => c.title)} />
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Questions: <span className="font-bold text-primary-600">{count}</span> (max 30)</label>
            <input type="range" min={1} max={30} value={count} onChange={e => setCount(Number(e.target.value))} className="w-44 accent-primary-600" />
          </div>
          <div className="flex flex-col gap-1">
            <button onClick={fetchQuestions} disabled={loading || !subject || remaining === 0}
              className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? "Generating…" : "AI Question Generate"}
            </button>
            {remaining !== null && (
              <span className={`text-[11px] text-center font-medium ${remaining === 0 ? "text-red-500" : remaining === 1 ? "text-amber-500" : "text-gray-400"}`}>
                {remaining === 0 ? "Limit reached · resets midnight" : `${remaining} use${remaining === 1 ? "" : "s"} left today`}
              </span>
            )}
          </div>
          {!!items?.length && (
            <button onClick={download} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-primary-400 flex items-center gap-2">
              <Download className="w-4 h-4" /> Download
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {!error && items !== null && items.length === 0 && (
        <div className="card py-12 text-center">
          <AlertCircle className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No questions available yet for this selection</p>
          <p className="text-xs text-gray-400 mt-1">Questions appear once generated by the admin.</p>
        </div>
      )}

      {!!items?.length && (
        <>
          <p className="text-xs text-gray-400 px-1">{items.length} questions · {source === "cache" ? "⚡ from cache" : "from database"}</p>
          {items.map((q, i) => {
            const shown = reveal[i];
            return (
              <div key={i} className="card p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{i + 1}. {q.question}</p>
                <div className="space-y-1.5">
                  {(q.options || []).map((o, j) => {
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
                  <button onClick={() => setReveal(r => ({ ...r, [i]: !r[i] }))}
                    className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                    {shown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {shown ? "Hide Answer" : "Show Answer"}
                  </button>
                  {shown && q.explanation && <p className="text-xs text-gray-500 dark:text-gray-400 italic">{q.explanation}</p>}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
