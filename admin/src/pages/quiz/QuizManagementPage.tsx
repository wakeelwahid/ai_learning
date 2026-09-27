import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { quizApi } from "@/lib/api";
import { useForm, useFieldArray } from "react-hook-form";
import Modal from "@/components/ui/Modal";
import DataTable from "@/components/ui/DataTable";
import { Plus, Trash2, FileQuestion, RefreshCw, Eye, Edit2, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";

const QUESTION_TYPES = ["mcq", "true_false", "fill_blank", "subjective"];
const QUIZ_TYPES = ["chapter", "mock_test", "practice", "adaptive"];

interface Quiz {
  id: string;
  title: string;
  quiz_type: string;
  chapter_id: string | null;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number;
  is_premium: boolean;
  is_active: boolean;
  created_at?: string;
}

interface QuizStats {
  total_quizzes: number;
  chapter_quizzes: number;
  mock_tests: number;
  total_questions: number;
}

interface QuizForm {
  title: string;
  chapter_id: string;
  quiz_type: string;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number;
  is_premium: boolean;
}

const CHAPTER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// chapter_id is optional backend-side (uuid.UUID | None); the form field
// defaults to "" for quizzes with no chapter, which fails UUID validation
// if sent as-is — both create and edit must normalize it the same way.
function normalizeChapterId(value: string): string | null {
  return value && CHAPTER_UUID_RE.test(value) ? value : null;
}

interface QuestionForm {
  quiz_id: string;
  questions: {
    text: string;
    question_type: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_answer: string;
    explanation: string;
    marks: number;
    negative_marks: number;
  }[];
}

const quizTypeColor: Record<string, string> = {
  chapter: "badge-info",
  mock_test: "badge-primary",
  practice: "badge-success",
  adaptive: "badge-warning",
};

export default function QuizManagementPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<"quiz" | "questions" | "view" | "edit" | null>(null);
  const [createdQuizId, setCreatedQuizId] = useState<string | null>(null);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Quiz | null>(null);
  const [typeFilter, setTypeFilter] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────
  const {
    data: quizzes = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Quiz[]>({
    queryKey: ["admin-quizzes", typeFilter],
    queryFn: () =>
      quizApi.adminList(typeFilter ? { quiz_type: typeFilter } : {}).then((r) => r.data),
  });

  const { data: stats } = useQuery<QuizStats>({
    queryKey: ["admin-quiz-stats"],
    queryFn: () => quizApi.adminStats().then((r) => r.data),
  });

  const { data: selectedQuestions = [], isLoading: qLoading } = useQuery({
    queryKey: ["quiz-questions", selectedQuiz?.id],
    queryFn: () => quizApi.questions(selectedQuiz!.id).then((r) => r.data),
    enabled: !!selectedQuiz && modal === "view",
  });

  // ── Forms ─────────────────────────────────────────────────────────────────
  const { register, handleSubmit, reset } = useForm<QuizForm>();
  const { register: re, handleSubmit: hse, reset: resetEdit } = useForm<QuizForm>();
  const { register: rq, handleSubmit: hsq, control, reset: resetQ } = useForm<QuestionForm>({
    defaultValues: {
      questions: [{
        text: "", question_type: "mcq",
        option_a: "", option_b: "", option_c: "", option_d: "",
        correct_answer: "", explanation: "", marks: 1, negative_marks: 0,
      }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "questions" });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createQuizMutation = useMutation({
    mutationFn: (data: QuizForm) => {
      const payload = {
        ...data,
        chapter_id: normalizeChapterId(data.chapter_id),
        duration_minutes: Number(data.duration_minutes),
        total_marks: Number(data.total_marks),
        passing_marks: Number(data.passing_marks),
      };
      return quizApi.createQuiz(payload);
    },
    onSuccess: (res) => {
      setCreatedQuizId(res.data.id);
      qc.invalidateQueries({ queryKey: ["admin-quizzes"] });
      qc.invalidateQueries({ queryKey: ["admin-quiz-stats"] });
      toast.success("Quiz created. Now add questions.");
      reset();
      setModal("questions");
    },
    onError: () => toast.error("Failed to create quiz"),
  });

  const addQuestionsMutation = useMutation({
    mutationFn: async (data: QuestionForm) => {
      for (const q of data.questions) {
        const options = q.question_type === "mcq"
          ? { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }
          : null;
        await quizApi.createQuestion({
          quiz_id: createdQuizId,
          text: q.text,
          question_type: q.question_type,
          options,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
          marks: Number(q.marks),
          negative_marks: Number(q.negative_marks),
        });
      }
    },
    onSuccess: () => {
      toast.success(`${fields.length} question(s) added.`);
      qc.invalidateQueries({ queryKey: ["admin-quiz-stats"] });
      setModal(null);
      resetQ();
      setCreatedQuizId(null);
    },
    onError: () => toast.error("Failed to add questions"),
  });

  const deleteQuizMutation = useMutation({
    mutationFn: (quizId: string) => quizApi.adminDelete(quizId),
    onSuccess: () => {
      toast.success("Quiz deleted.");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-quizzes"] });
      qc.invalidateQueries({ queryKey: ["admin-quiz-stats"] });
    },
    onError: () => toast.error("Failed to delete quiz"),
  });

  const updateQuizMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: QuizForm }) => {
      const payload = {
        ...data,
        chapter_id: normalizeChapterId(data.chapter_id),
        duration_minutes: Number(data.duration_minutes),
        total_marks: Number(data.total_marks),
        passing_marks: Number(data.passing_marks),
      };
      return quizApi.adminUpdate(id, payload);
    },
    onSuccess: () => {
      toast.success("Quiz updated.");
      setModal(null);
      setSelectedQuiz(null);
      resetEdit();
      qc.invalidateQueries({ queryKey: ["admin-quizzes"] });
    },
    onError: () => toast.error("Failed to update quiz"),
  });

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    { header: "Title", accessor: "title" as keyof Quiz },
    {
      header: "Type",
      accessor: (r: Quiz) => (
        <span className={`badge ${quizTypeColor[r.quiz_type] ?? "badge-gray"}`}>
          {r.quiz_type.replace("_", " ")}
        </span>
      ),
    },
    {
      header: "Marks",
      accessor: (r: Quiz) => `${r.total_marks} (pass: ${r.passing_marks})`,
    },
    {
      header: "Duration",
      accessor: (r: Quiz) => `${r.duration_minutes} min`,
    },
    {
      header: "Premium",
      accessor: (r: Quiz) =>
        r.is_premium
          ? <span className="badge badge-warning">Yes</span>
          : <span className="badge badge-gray">No</span>,
    },
    {
      header: "Created",
      accessor: (r: Quiz) =>
        r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—",
    },
    {
      header: "Actions",
      accessor: (r: Quiz) => (
        <div className="flex gap-1.5">
          <button
            onClick={() => { setSelectedQuiz(r); setModal("view"); }}
            className="btn btn-sm btn-secondary"
          >
            <Eye className="w-3.5 h-3.5" /> View
          </button>
          <button
            onClick={() => {
              setSelectedQuiz(r);
              resetEdit({
                title: r.title, quiz_type: r.quiz_type, chapter_id: r.chapter_id ?? "",
                duration_minutes: r.duration_minutes, total_marks: r.total_marks,
                passing_marks: r.passing_marks, is_premium: r.is_premium,
              });
              setModal("edit");
            }}
            className="btn btn-sm btn-secondary text-primary-600 dark:text-primary-400"
          >
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => setDeleteTarget(r)}
            disabled={deleteQuizMutation.isPending}
            className="btn btn-sm btn-danger"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Quiz Management</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Create and manage quizzes and questions</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input w-36 text-sm"
          >
            <option value="">All Types</option>
            {QUIZ_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace("_", " ")}</option>
            ))}
          </select>
          <button onClick={() => refetch()} className="btn btn-sm btn-secondary">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button className="btn-primary" onClick={() => setModal("quiz")}>
            <Plus className="w-4 h-4" /> Create Quiz
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Chapter Quizzes", value: stats?.chapter_quizzes ?? "…", color: "bg-info-500" },
          { label: "Mock Tests", value: stats?.mock_tests ?? "…", color: "bg-primary-500" },
          { label: "Total Questions", value: stats?.total_questions?.toLocaleString() ?? "…", color: "bg-success-500" },
          { label: "Total Quizzes", value: stats?.total_quizzes ?? "…", color: "bg-warning-500" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className={`w-3 h-10 rounded-full ${color}`} />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quiz list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            All Quizzes{quizzes.length > 0 ? ` (${quizzes.length})` : ""}
          </h3>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading quizzes…</div>
        ) : isError ? (
          <div className="p-8 text-center text-danger-600 dark:text-danger-400">
            Failed to load quizzes.{" "}
            <button onClick={() => refetch()} className="underline">Retry</button>
          </div>
        ) : quizzes.length === 0 ? (
          <div className="p-10 text-center text-gray-400 dark:text-gray-500">
            <FileQuestion className="w-12 h-12 mx-auto mb-3" />
            <p className="font-medium">No quizzes yet</p>
            <p className="text-sm mt-1">Create a new quiz using the button above</p>
          </div>
        ) : (
          <DataTable columns={columns} data={quizzes} searchKey="title" />
        )}
      </div>

      {/* ── Create Quiz Modal ── */}
      {modal === "quiz" && (
        <Modal title="Create Quiz" onClose={() => { setModal(null); reset(); }}>
          <form onSubmit={handleSubmit((d) => createQuizMutation.mutate(d))} className="space-y-4">
            <div>
              <label className="label">Quiz Title</label>
              <input
                className="input"
                {...register("title", { required: true })}
                placeholder="e.g. Chapter 1 — Real Numbers"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Quiz Type</label>
                <select className="input" {...register("quiz_type", { required: true })}>
                  {QUIZ_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">
                  Chapter ID <span className="text-gray-400 font-normal">(optional UUID)</span>
                </label>
                <input
                  className="input"
                  {...register("chapter_id")}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Duration (min)</label>
                <input type="number" className="input" {...register("duration_minutes", { valueAsNumber: true })} defaultValue={30} />
              </div>
              <div>
                <label className="label">Total Marks</label>
                <input type="number" className="input" {...register("total_marks", { valueAsNumber: true })} defaultValue={20} />
              </div>
              <div>
                <label className="label">Passing Marks</label>
                <input type="number" className="input" {...register("passing_marks", { valueAsNumber: true })} defaultValue={12} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="prem" {...register("is_premium")} className="checkbox" />
              <label htmlFor="prem" className="text-sm font-medium text-gray-700 dark:text-gray-300">Premium only</label>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createQuizMutation.isPending}>
                {createQuizMutation.isPending ? "Creating…" : "Create & Add Questions →"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Add Questions Modal ── */}
      {modal === "questions" && (
        <Modal title="Add Questions" onClose={() => setModal(null)} size="xl">
          <form onSubmit={hsq((d) => addQuestionsMutation.mutate(d))} className="space-y-6">
            {fields.map((field, idx) => (
              <div key={field.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Question {idx + 1}</p>
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(idx)} className="text-danger-500 hover:text-danger-700 dark:text-danger-400 dark:hover:text-danger-300">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <textarea
                  className="input"
                  rows={2}
                  {...rq(`questions.${idx}.text`, { required: true })}
                  placeholder="Question text…"
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Type</label>
                    <select className="input" {...rq(`questions.${idx}.question_type`)}>
                      {QUESTION_TYPES.map((t) => (
                        <option key={t} value={t}>{t.replace("_", " ")}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Correct Answer</label>
                    <input
                      className="input"
                      {...rq(`questions.${idx}.correct_answer`, { required: true })}
                      placeholder="A / True / keyword"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input className="input" {...rq(`questions.${idx}.option_a`)} placeholder="Option A" />
                  <input className="input" {...rq(`questions.${idx}.option_b`)} placeholder="Option B" />
                  <input className="input" {...rq(`questions.${idx}.option_c`)} placeholder="Option C" />
                  <input className="input" {...rq(`questions.${idx}.option_d`)} placeholder="Option D" />
                </div>

                <input
                  className="input"
                  {...rq(`questions.${idx}.explanation`)}
                  placeholder="Explanation (optional)"
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Marks</label>
                    <input type="number" className="input" {...rq(`questions.${idx}.marks`)} defaultValue={1} />
                  </div>
                  <div>
                    <label className="label text-xs">Negative Marks</label>
                    <input type="number" step="0.25" className="input" {...rq(`questions.${idx}.negative_marks`)} defaultValue={0} />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => append({
                text: "", question_type: "mcq",
                option_a: "", option_b: "", option_c: "", option_d: "",
                correct_answer: "", explanation: "", marks: 1, negative_marks: 0,
              })}
              className="btn-secondary w-full justify-center"
            >
              <Plus className="w-4 h-4" /> Add Another Question
            </button>

            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={addQuestionsMutation.isPending}>
                {addQuestionsMutation.isPending ? "Saving…" : `Save ${fields.length} Question(s)`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Edit Quiz Modal ── */}
      {modal === "edit" && selectedQuiz && (
        <Modal title={`Edit — ${selectedQuiz.title}`} onClose={() => { setModal(null); setSelectedQuiz(null); }}>
          <form onSubmit={hse((d) => updateQuizMutation.mutate({ id: selectedQuiz.id, data: d }))} className="space-y-4">
            <div>
              <label className="label">Quiz Title</label>
              <input className="input" {...re("title", { required: true })} placeholder="Quiz title" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Quiz Type</label>
                <select className="input" {...re("quiz_type", { required: true })}>
                  {QUIZ_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Chapter ID <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
                <input className="input" {...re("chapter_id")} placeholder="UUID or leave blank" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Duration (min)</label>
                <input type="number" className="input" {...re("duration_minutes", { valueAsNumber: true })} />
              </div>
              <div>
                <label className="label">Total Marks</label>
                <input type="number" className="input" {...re("total_marks", { valueAsNumber: true })} />
              </div>
              <div>
                <label className="label">Passing Marks</label>
                <input type="number" className="input" {...re("passing_marks", { valueAsNumber: true })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="edit_prem" {...re("is_premium")} className="checkbox" />
              <label htmlFor="edit_prem" className="text-sm font-medium text-gray-700 dark:text-gray-300">Premium only</label>
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={updateQuizMutation.isPending}>
                {updateQuizMutation.isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <Modal title="Confirm Delete" onClose={() => setDeleteTarget(null)} size="sm">
          <div className="space-y-4">
            <div className="alert-danger">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">This action cannot be undone</p>
                <p className="text-xs mt-0.5 opacity-90">
                  Delete <strong>"{deleteTarget.title}"</strong> and all its questions permanently?
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="btn btn-secondary">Cancel</button>
              <button
                onClick={() => deleteQuizMutation.mutate(deleteTarget.id)}
                disabled={deleteQuizMutation.isPending}
                className="btn btn-danger"
              >
                {deleteQuizMutation.isPending ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── View Quiz Questions Modal ── */}
      {modal === "view" && selectedQuiz && (
        <Modal
          title={`Questions — ${selectedQuiz.title}`}
          onClose={() => { setModal(null); setSelectedQuiz(null); }}
          size="xl"
        >
          {qLoading ? (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading questions…</div>
          ) : selectedQuestions.length === 0 ? (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500">No questions added yet.</div>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {selectedQuestions.map((q: { id: string; text: string; question_type: string; correct_answer: string; options?: Record<string, string>; marks: number }, i: number) => (
                <div key={q.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Q{i + 1}. {q.text}</p>
                  {q.options && (
                    <div className="grid grid-cols-2 gap-1 mt-2 mb-2">
                      {Object.entries(q.options).map(([k, v]) => (
                        <p key={k} className={`text-xs px-2 py-1 rounded ${q.correct_answer === k ? "bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-300 font-semibold" : "text-gray-600 dark:text-gray-400"}`}>
                          {k}. {v}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-3 text-xs text-gray-400 dark:text-gray-500 mt-1">
                    <span>Type: {q.question_type}</span>
                    <span>Correct: <strong className="text-success-600 dark:text-success-400">{q.correct_answer}</strong></span>
                    <span>Marks: {q.marks}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
