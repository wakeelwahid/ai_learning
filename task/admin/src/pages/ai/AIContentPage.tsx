import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { aiContentApi } from "@/lib/api";
import { useForm } from "react-hook-form";
import { FileQuestion, BookOpen, ScrollText, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import { Button, Card, Input, Textarea, Select, Checkbox, Alert } from "@/components/ui";

type TabKey = "questions" | "notes" | "practice";

const TABS: { key: TabKey; label: string; icon: typeof FileQuestion }[] = [
  { key: "questions", label: "Chapter Questions", icon: FileQuestion },
  { key: "notes", label: "Notes", icon: BookOpen },
  { key: "practice", label: "Practice Papers", icon: ScrollText },
];

interface UploadForm {
  chapter_id: string;
  title: string;
  content: string;
  ingest_qdrant: boolean;
  difficulty?: string;
  subject?: string;
}

interface UploadResult {
  id: string;
  chunks_indexed?: number;
  message: string;
}

export default function AIContentPage() {
  const [tab, setTab] = useState<TabKey>("questions");
  const [result, setResult] = useState<UploadResult | null>(null);
  const { register, handleSubmit, reset, watch } = useForm<UploadForm>({
    defaultValues: { ingest_qdrant: true, difficulty: "medium" },
  });

  const uploadFn = {
    questions: aiContentApi.uploadQuestions,
    notes: aiContentApi.uploadNotes,
    practice: aiContentApi.uploadPractice,
  }[tab];

  const mutation = useMutation<UploadResult, Error, UploadForm>({
    mutationFn: (data) => uploadFn(data).then(r => r.data),
    onSuccess: (data) => {
      setResult(data);
      const extra = data.chunks_indexed ? ` · ${data.chunks_indexed} chunks in Qdrant` : "";
      toast.success(`Uploaded successfully${extra}`);
      reset({ ingest_qdrant: true, difficulty: "medium" });
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? "Upload failed"),
  });

  const ingestEnabled = watch("ingest_qdrant");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Content Upload</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
          Upload AI-generated questions, notes, and practice papers — saved to PostgreSQL and optionally indexed in Qdrant for RAG retrieval
        </p>
      </div>

      {/* Architecture info */}
      <Alert variant="info">
        <strong>Flow:</strong> Admin uploads → stored in PostgreSQL (source of truth) → if "Index in Qdrant" is on, content is embedded (OpenAI text-embedding-3-small) and stored as vectors in Qdrant →
        when students click <em>"Generate Questions/Notes"</em> the API fetches from PostgreSQL; semantic search queries hit Qdrant for fast context-aware results.
      </Alert>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setResult(null); reset({ ingest_qdrant: true, difficulty: "medium" }); }}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === key
                ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Form */}
        <Card className="lg:col-span-2">
          <form
            key={tab}
            onSubmit={handleSubmit((d) => mutation.mutate(d))}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Chapter ID"
                {...register("chapter_id", { required: true })}
                placeholder="UUID from Content page"
              />
              <Input
                label="Title"
                {...register("title", { required: true })}
                placeholder={
                  tab === "questions"
                    ? "e.g. MCQ Set — Real Numbers"
                    : tab === "notes"
                    ? "e.g. Chapter Summary — Polynomials"
                    : "e.g. Practice Paper 1 — Class 10 Maths"
                }
              />
            </div>

            {tab === "questions" && (
              <Select label="Difficulty" {...register("difficulty")}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="mixed">Mixed</option>
              </Select>
            )}

            <Textarea
              label="Content"
              helperText="For questions: JSON array preferred. For notes/papers: plain text or Markdown."
              className="font-mono text-xs leading-relaxed"
              rows={14}
              {...register("content", { required: true })}
              placeholder={
                tab === "questions"
                  ? `[\n  {\n    "question": "What is the HCF of 12 and 18?",\n    "type": "mcq",\n    "options": ["2","4","6","8"],\n    "correct": "6",\n    "explanation": "HCF = product of lowest powers of common factors"\n  }\n]`
                  : tab === "notes"
                  ? `# Real Numbers\n\n## Key Concepts\n\n**Euclid's Division Lemma**: For any positive integers a and b, there exist unique integers q and r such that a = bq + r, where 0 ≤ r < b.\n\n...`
                  : `# Practice Paper 1 — Mathematics Class 10\n\n**Time: 3 Hours | Max Marks: 80**\n\n## Section A (1 mark each)\n\n1. Find HCF(867, 255)...`
              }
            />

            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl">
              <Checkbox id="qdrant" {...register("ingest_qdrant")} className="mt-0.5" />
              <label htmlFor="qdrant" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <span className="font-semibold">Index in Qdrant</span>{" "}
                <span className="text-gray-500 dark:text-gray-400">
                  — splits content into chunks, generates embeddings, and stores in Qdrant for semantic search.
                  Recommended for notes and practice papers. Slower but enables AI-powered retrieval.
                </span>
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <Button type="submit" isLoading={mutation.isPending}>
                {mutation.isPending ? (
                  <>Uploading{ingestEnabled ? " & Indexing" : ""}...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Upload {tab === "questions" ? "Questions" : tab === "notes" ? "Notes" : "Practice Paper"}</>
                )}
              </Button>
              <Button
                type="reset"
                variant="secondary"
                onClick={() => { reset({ ingest_qdrant: true, difficulty: "medium" }); setResult(null); }}
              >
                Clear
              </Button>
            </div>

            {result && (
              <Alert variant="success" title="Upload Successful">
                <p>{result.message}</p>
                {result.chunks_indexed && (
                  <p className="text-xs mt-0.5 opacity-90">
                    {result.chunks_indexed} vectors indexed in Qdrant
                  </p>
                )}
                {result.id && (
                  <p className="text-xs mt-0.5 font-mono opacity-90">ID: {result.id}</p>
                )}
              </Alert>
            )}
          </form>
        </Card>

        {/* Info panel */}
        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Student Experience</h3>
            <ol className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <span>Student opens a chapter and clicks <strong>"Generate Questions"</strong> or <strong>"View Notes"</strong></span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <span>Frontend calls <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">GET /v1/ai/content/questions?chapter_id=…</code> — fetches from PostgreSQL</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <span>AI Assistant (Study Mode) queries Qdrant for semantically relevant notes/context</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                <span>Claude composes personalized answers using RAG context</span>
              </li>
            </ol>
          </Card>

          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Tips</h3>
            <ul className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
              <li>• Questions JSON: include <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">type</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">options</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">correct</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">explanation</code></li>
              <li>• Always enable Qdrant indexing for notes so the AI assistant can reference them</li>
              <li>• One practice paper per POST — keep them chapter-focused for better RAG precision</li>
              <li>• Content is auto-chunked at ~500 tokens with 50-token overlap</li>
              <li>• Re-uploading the same chapter_id+title will create a new version, not overwrite</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
