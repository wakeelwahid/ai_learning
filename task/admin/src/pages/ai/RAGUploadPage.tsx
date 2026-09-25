import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ragApi, contentApi } from "@/lib/api";
import {
  Upload, FileText, File, CheckCircle, XCircle, Clock,
  RefreshCw, Loader, ChevronDown, Trash2, Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button, Card, Input, Badge } from "@/components/ui";
import clsx from "clsx";

const DOC_TYPES = [
  { v: "pdf",                l: "PDF / Textbook" },
  { v: "ppt",                l: "PPT / Slides" },
  { v: "notes",              l: "Notes" },
  { v: "question_bank",      l: "Question Bank" },
  { v: "mcq_bank",           l: "MCQ Bank" },
  { v: "exercise_solutions", l: "Exercise Solutions" },
  { v: "sample_paper",       l: "Sample Paper" },
];

// Content-category pills are selectable filter chips, not status — kept
// neutral (primary when selected) rather than a different hue per option.
const CONTENT_TYPES = [
  { value: "syllabus",         label: "Syllabus Content",   collection: "school_subjects" },
  { value: "general_knowledge",label: "General Knowledge",  collection: "general_knowledge" },
  { value: "current_affairs",  label: "Current Affairs",    collection: "current_affairs" },
  { value: "custom",           label: "Custom Collection",  collection: "" },
];

const ACCEPT = ".pdf,.pptx,.docx,.txt,.md";

type Status = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

const statusVariant: Record<Status, "warning" | "info" | "success" | "danger"> = {
  PENDING:    "warning",
  PROCESSING: "info",
  COMPLETED:  "success",
  FAILED:     "danger",
};
const statusIcon: Record<Status, React.ReactNode> = {
  PENDING:    <Clock className="w-3.5 h-3.5" />,
  PROCESSING: <Loader className="w-3.5 h-3.5 animate-spin" />,
  COMPLETED:  <CheckCircle className="w-3.5 h-3.5" />,
  FAILED:     <XCircle className="w-3.5 h-3.5" />,
};

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

export default function RAGUploadPage() {
  const qc   = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [files,       setFiles]       = useState<File[]>([]);
  const [dragging,    setDragging]    = useState(false);
  const [contentType, setContentType] = useState("syllabus");
  const [board,       setBoard]       = useState("");
  const [cls,         setCls]         = useState("");
  const [subject,     setSubject]     = useState("");
  const [chapter,     setChapter]     = useState("");
  const [topic,       setTopic]       = useState("");
  const [docType,     setDocType]     = useState("notes");
  const [customColl,  setCustomColl]  = useState("");

  const isSyllabus = contentType === "syllabus";
  const selectedType = CONTENT_TYPES.find(t => t.value === contentType)!;
  const collection = contentType === "custom" ? customColl : selectedType.collection;
  const [jobPage, setJobPage] = useState(1);

  // ── Dynamic curriculum from the real content service ──
  const { data: boards = [] } = useQuery({ queryKey: ["adm-boards"], queryFn: () => contentApi.boards().then(r => r.data) });
  const boardId = (boards as any[]).find((b: any) => b.name === board || b.code === board)?.id;
  const { data: classesD = [] } = useQuery({ queryKey: ["adm-classes", boardId], queryFn: () => contentApi.classes(boardId).then(r => r.data), enabled: !!boardId });
  const classId = (classesD as any[]).find((c: any) => String(c.number) === cls)?.id;
  const { data: subjectsD = [] } = useQuery({ queryKey: ["adm-subjects", classId], queryFn: () => contentApi.subjects(classId).then(r => r.data), enabled: !!classId });
  const subjectId = (subjectsD as any[]).find((s: any) => s.name === subject)?.id;
  const { data: chaptersD = [] } = useQuery({ queryKey: ["adm-chapters", subjectId], queryFn: () => contentApi.chapters(subjectId).then(r => r.data), enabled: !!subjectId });

  const boardOpts   = (boards as any[]).map((b: any) => b.name);
  const classOpts   = (classesD as any[]).map((c: any) => c.number);
  const subjectOpts = (subjectsD as any[]).map((s: any) => s.name);
  const chapterOpts = (chaptersD as any[]).map((c: any) => c.title);

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ["rag-jobs", jobPage],
    queryFn: () => ragApi.listJobs({ page: jobPage, limit: 20 }).then(r => r.data),
    refetchInterval: 8000,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("content_type", contentType);
      fd.append("document_type", docType);
      if (collection) fd.append("collection", collection);
      if (board)   fd.append("board",     board);
      if (cls)     fd.append("class_num", cls);
      if (subject) fd.append("subject",   subject);
      if (chapter) fd.append("chapter",   chapter);
      if (topic)   fd.append("topic",     topic);
      return ragApi.uploadFile(fd).then(r => r.data);
    },
    onSuccess: (_, file) => {
      toast.success(`${file.name} uploaded — auto-processing started`);
      qc.invalidateQueries({ queryKey: ["rag-jobs"] });
    },
    onError: (_, file) => toast.error(`Failed to upload ${file.name}`),
  });

  async function handleUploadAll() {
    if (!files.length) return;
    if (isSyllabus && (!board || !cls || !subject)) {
      toast.error("Syllabus content requires Board, Class and Subject");
      return;
    }
    if (contentType === "custom" && !customColl.trim()) {
      toast.error("Enter a collection name");
      return;
    }
    for (const f of files) await upload.mutateAsync(f);
    setFiles([]);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      /\.(pdf|pptx|docx|txt|md)$/i.test(f.name)
    );
    setFiles(prev => [...prev, ...dropped]);
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const jobs: any[] = jobsData?.jobs ?? [];
  const total: number = jobsData?.total ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">RAG File Upload</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Upload PDF / PPTX / DOCX / TXT — auto-extracts, embeds &amp; indexes to Qdrant (subject/class/chapter), then auto-generates a verified quiz.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── Upload form ── */}
        <Card className="space-y-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary-600 dark:text-primary-400" /> Upload Files
          </h3>

          {/* Content type */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Content Category</label>
            <div className="flex flex-wrap gap-2">
              {CONTENT_TYPES.map(t => (
                <button key={t.value} onClick={() => setContentType(t.value)}
                  className={clsx(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                    contentType === t.value
                      ? "bg-primary-600 text-white border-transparent"
                      : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500"
                  )}
                >{t.label}</button>
              ))}
            </div>
            {contentType === "custom" && (
              <Input
                value={customColl}
                onChange={e => setCustomColl(e.target.value)}
                placeholder="Collection name (e.g. company_docs)"
                className="mt-2"
              />
            )}
            {!isSyllabus && contentType !== "custom" && (
              <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                Will be stored in <span className="font-mono text-gray-600 dark:text-gray-400">{selectedType.collection}</span> collection · Board/Class/Subject are optional
              </p>
            )}
          </div>

          {/* Metadata — dynamic curriculum (board → class → subject → chapter) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Sel label={isSyllabus ? "Board *" : "Board"} value={board}
              onChange={(v) => { setBoard(v); setCls(""); setSubject(""); setChapter(""); }} options={boardOpts} />
            <Sel label={isSyllabus ? "Class *" : "Class"} value={cls}
              onChange={(v) => { setCls(v); setSubject(""); setChapter(""); }} options={classOpts} />
            <Sel label={isSyllabus ? "Subject *" : "Subject"} value={subject}
              onChange={(v) => { setSubject(v); setChapter(""); }} options={subjectOpts} />
            {chapterOpts.length > 0 ? (
              <Sel label={`Chapter ${isSyllabus ? "" : "(optional)"}`} value={chapter} onChange={setChapter} options={chapterOpts} />
            ) : (
              <Input
                label={`Chapter ${isSyllabus ? "" : "(optional)"}`}
                value={chapter}
                onChange={e => setChapter(e.target.value)}
                placeholder="e.g. Real Numbers"
              />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Topic (optional)"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Euclid's Division Lemma"
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Document Type</label>
              <div className="relative">
                <select
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                  className="w-full appearance-none text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {DOC_TYPES.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={clsx(
              "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-2 cursor-pointer transition-colors",
              dragging
                ? "border-primary-400 bg-primary-50 dark:bg-primary-900/20"
                : "border-gray-200 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-800/60"
            )}
          >
            <Upload className={clsx("w-8 h-8", dragging ? "text-primary-500" : "text-gray-300 dark:text-gray-600")} />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Drop files here or <span className="text-primary-600 dark:text-primary-400">click to browse</span></p>
            <p className="text-xs text-gray-400 dark:text-gray-500">PDF · PPTX · DOCX · TXT (max 50 MB each)</p>
          </div>
          <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={onInputChange} />

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/40 rounded-xl">
                  <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                  <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 dark:text-gray-600 hover:text-danger-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleUploadAll}
            disabled={upload.isPending || files.length === 0}
            isLoading={upload.isPending}
            fullWidth
            className="justify-center"
          >
            {!upload.isPending && <Upload className="w-4 h-4" />}
            {upload.isPending ? "Uploading…" : `Upload ${files.length} file${files.length !== 1 ? "s" : ""}`}
          </Button>
        </Card>

        {/* ── Job monitor ── */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary-600 dark:text-primary-400" /> Ingestion Jobs
              <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({total})</span>
            </h3>
            <button onClick={() => qc.invalidateQueries({ queryKey: ["rag-jobs"] })} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {jobsLoading && (
            <div className="flex items-center justify-center py-12 text-gray-400 dark:text-gray-500">
              <Loader className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          )}

          {!jobsLoading && jobs.length === 0 && (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">No ingestion jobs yet.</div>
          )}

          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {jobs.map((j: any) => (
              <div key={j.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors">
                <File className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{j.file_name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {[j.board, j.class_num && `Class ${j.class_num}`, j.subject, j.chapter].filter(Boolean).join(" · ")}
                  </p>
                  {j.status === "COMPLETED" && (
                    <p className="text-xs text-success-600 dark:text-success-400 mt-0.5 flex items-start gap-1">
                      <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{j.error_message || `${j.chunks_indexed} chunks indexed`}</span>
                    </p>
                  )}
                  {j.status === "FAILED" && (
                    <p className="text-xs text-danger-500 dark:text-danger-400 mt-0.5 truncate">{j.error_message}</p>
                  )}
                </div>
                <Badge variant={statusVariant[j.status as Status] ?? "gray"} className="shrink-0 gap-1">
                  {statusIcon[j.status as Status]}
                  {j.status}
                </Badge>
              </div>
            ))}
          </div>

          {total > 20 && (
            <div className="flex items-center justify-between pt-1">
              <button disabled={jobPage <= 1} onClick={() => setJobPage(p => p - 1)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30">← Prev</button>
              <span className="text-xs text-gray-400 dark:text-gray-500">Page {jobPage}</span>
              <button disabled={jobPage * 20 >= total} onClick={() => setJobPage(p => p + 1)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30">Next →</button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
