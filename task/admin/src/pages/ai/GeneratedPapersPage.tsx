import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ragApi } from "@/lib/api";
import { useCurriculum } from "@/hooks/useCurriculum";
import {
  ScrollText, ChevronDown, Eye, Download,
  Loader, FileText, RefreshCw, X, Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button, Card, Badge, Pagination } from "@/components/ui";
import clsx from "clsx";

const PAPER_TYPES = ["quiz_paper", "revision_paper", "practice_paper", "mock_test"];

// Neutral gray badge for every paper type — status/feedback colors are
// reserved for real status signals (see difficulty badges below), not
// decorative type labels.
const typeColor: Record<string, string> = {
  quiz_paper:     "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
  revision_paper: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
  practice_paper: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
  mock_test:      "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
};

function Sel({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: (string | number)[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
      >
        <option value="">{label}</option>
        {options.map(o => <option key={o} value={String(o)}>{o}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ── Paper preview modal ───────────────────────────────────────────────────────
function PaperModal({ paper, onClose }: { paper: any; onClose: () => void }) {
  function downloadJSON() {
    const blob = new Blob([JSON.stringify(paper, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${paper.title?.replace(/\s+/g, "_") ?? "paper"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadText() {
    const lines: string[] = [
      paper.title ?? "Untitled Paper",
      `${paper.board ?? ""} · Class ${paper.class_num ?? ""} · ${paper.subject ?? ""} · ${paper.chapter ?? ""}`,
      `Difficulty: ${paper.difficulty ?? "-"}  |  Total Marks: ${paper.total_marks ?? "-"}  |  Duration: ${paper.duration_min ?? "-"} min`,
      "",
    ];

    (paper.content?.sections ?? []).forEach((sec: any) => {
      lines.push(`=== ${sec.section_name} (${sec.marks_per_question} mark each) ===`);
      (sec.questions ?? []).forEach((q: any) => {
        lines.push(`Q${q.q_no}. ${q.question}`);
        (q.options ?? []).forEach((o: string) => lines.push(`    ${o}`));
        if (q.answer) lines.push(`Answer: ${q.answer}`);
        if (q.explanation) lines.push(`Explanation: ${q.explanation}`);
        lines.push("");
      });
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${paper.title?.replace(/\s+/g, "_") ?? "paper"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-gray-100 dark:border-gray-700">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg leading-tight">{paper.title}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {[paper.board, paper.class_num && `Class ${paper.class_num}`, paper.subject, paper.chapter].filter(Boolean).join(" · ")}
              {" · "}{paper.difficulty}{" · "}{paper.total_marks} marks{" · "}{paper.duration_min} min
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="secondary" onClick={downloadText}>
              <Download className="w-3.5 h-3.5" /> TXT
            </Button>
            <Button size="sm" variant="secondary" onClick={downloadJSON}>
              <Download className="w-3.5 h-3.5" /> JSON
            </Button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {(paper.content?.sections ?? []).length === 0 && (
            <pre className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 overflow-x-auto">
              {JSON.stringify(paper.content, null, 2)}
            </pre>
          )}
          {(paper.content?.sections ?? []).map((sec: any, si: number) => (
            <div key={si}>
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                {sec.section_name}
                <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">{sec.marks_per_question} mark each</span>
              </h3>
              <div className="space-y-4">
                {(sec.questions ?? []).map((q: any, qi: number) => (
                  <div key={qi} className="p-4 bg-gray-50 dark:bg-gray-900/40 rounded-xl space-y-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Q{q.q_no ?? qi + 1}. {q.question}</p>
                    {q.options && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {q.options.map((o: string, oi: number) => (
                          <p key={oi} className={clsx(
                            "text-xs px-2 py-1 rounded-lg",
                            o.startsWith(q.answer ?? "~")
                              ? "bg-success-100 dark:bg-success-900/40 text-success-700 dark:text-success-300 font-medium"
                              : "text-gray-600 dark:text-gray-400"
                          )}>{o}</p>
                        ))}
                      </div>
                    )}
                    {q.answer && !q.options && (
                      <p className="text-xs text-success-700 dark:text-success-300 bg-success-50 dark:bg-success-900/20 px-3 py-1.5 rounded-lg"><span className="font-semibold">Answer:</span> {q.answer}</p>
                    )}
                    {q.explanation && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">{q.explanation}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GeneratedPapersPage() {
  const [board,      setBoard]      = useState("");
  const [cls,        setCls]        = useState("");
  const [subject,    setSubject]    = useState("");
  const [pType,      setPType]      = useState("");
  const [page,       setPage]       = useState(1);
  const [preview,    setPreview]    = useState<any | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null); // paper id being confirmed
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ragApi.deletePaper(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-papers"] });
      setConfirming(null);
      toast.success("Paper deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const { boardOpts, classOpts, subjectOpts } = useCurriculum(board, cls);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["generated-papers", board, cls, subject, pType, page],
    queryFn: () => ragApi.getPapers({
      board: board || undefined,
      class_num: cls ? Number(cls) : undefined,
      subject: subject || undefined,
      paper_type: pType || undefined,
      page, limit: 20,
    }).then(r => r.data),
  });

  const papers: any[] = data?.papers ?? [];
  const total:  number = data?.total ?? 0;

  return (
    <div className="space-y-5">
      {preview && <PaperModal paper={preview} onClose={() => setPreview(null)} />}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Generated Papers</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">AI-generated quiz, revision and practice papers</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Sel label="All Boards"      value={board}   onChange={v => { setBoard(v); setCls(""); setSubject(""); setPage(1); }} options={boardOpts}   />
        <Sel label="All Classes"     value={cls}     onChange={v => { setCls(v); setSubject(""); setPage(1); }} options={classOpts}   />
        <Sel label="All Subjects"    value={subject} onChange={v => { setSubject(v); setPage(1); }} options={subjectOpts} />
        <Sel label="All Types"       value={pType}   onChange={v => { setPType(v);   setPage(1); }} options={PAPER_TYPES} />
        {(board || cls || subject || pType) && (
          <button onClick={() => { setBoard(""); setCls(""); setSubject(""); setPType(""); setPage(1); }}
            className="flex items-center gap-1 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-danger-600 dark:hover:text-danger-400 transition-colors">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-gray-400 dark:text-gray-500">
          <Loader className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {!isLoading && papers.length === 0 && (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No papers found. Generate some using the AI Generator.</p>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {papers.map((p: any) => (
          <Card key={p.id} hover>
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className={clsx("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full", typeColor[p.paper_type] ?? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300")}>
                <FileText className="w-3 h-3" />
                {p.paper_type?.replace(/_/g, " ")}
              </span>
              <Badge variant={p.difficulty === "easy" ? "success" : p.difficulty === "hard" ? "danger" : "warning"}>
                {p.difficulty}
              </Badge>
            </div>

            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm line-clamp-2 mb-2">{p.title}</h4>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
              {[p.board, p.class_num && `Class ${p.class_num}`, p.subject].filter(Boolean).join(" · ")}
            </p>
            {p.chapter && <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 truncate">{p.chapter}</p>}

            <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mb-4">
              <span>{p.total_marks} marks</span>
              <span>•</span>
              <span>{p.duration_min} min</span>
              {p.generated_by && <><span>•</span><span className="truncate">{p.generated_by}</span></>}
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1 justify-center" onClick={() => setPreview(p)}>
                <Eye className="w-3.5 h-3.5" /> Preview
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1 justify-center"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement("a");
                  a.href     = url;
                  a.download = `${p.title?.replace(/\s+/g, "_") ?? "paper"}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("Downloaded");
                }}
              >
                <Download className="w-3.5 h-3.5" /> Download
              </Button>
              {confirming === p.id ? (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="danger"
                    isLoading={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(p.id)}
                  >
                    {!deleteMutation.isPending && "Confirm"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="danger" onClick={() => setConfirming(p.id)}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <Pagination
          page={page - 1}
          totalPages={Math.ceil(total / 20)}
          onPageChange={(p) => setPage(p + 1)}
          summary={`Page ${page} · ${total} total`}
        />
      )}
    </div>
  );
}
