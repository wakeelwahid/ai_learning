import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { contentApi, curriculumAdminApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import {
  BookOpen, ChevronRight, Plus, Trash2, Video, FileQuestion,
  X, CheckCircle, AlertTriangle, PlayCircle, HelpCircle,
  Layers, AlignLeft, Pencil, Milestone,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "boards" | "classes" | "subjects" | "chapters" | "chapter-detail" | "exercise-questions" | "question-detail";
type ChapterMode = "exercises" | "direct" | "topics";
type Modal =
  | null
  | "add-board" | "edit-board"
  | "add-class" | "edit-class"
  | "add-chapter" | "edit-chapter" | "add-subject" | "edit-subject"
  | "add-topic" | "edit-topic"
  | "add-exercise" | "add-question"
  | "set-video" | "add-practice"
  | "delete-confirm";

interface Sel { board: any; class_: any; subject: any; chapter: any; exercise: any; question: any }
interface DeleteTarget { label: string; fn: () => Promise<void> }

// ─── YouTube helpers ──────────────────────────────────────────────────────────

function extractYouTubeId(raw: string): string {
  const m = raw.match(/(?:v=|youtu\.be\/)([^&?/]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(raw.trim())) return raw.trim();
  return raw.trim();
}
function ytThumb(id: string) { return `https://img.youtube.com/vi/${id}/mqdefault.jpg`; }


// ─── Micro-components ─────────────────────────────────────────────────────────

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Badge({ label, color = "gray" }: { label: string; color?: string }) {
  const map: Record<string, string> = {
    gray: "badge-gray", blue: "badge-info",
    green: "badge-success", red: "badge-danger", yellow: "badge-warning",
  };
  return <span className={map[color] ?? map.gray}>{label}</span>;
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="py-12 text-center flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
      <Icon className="w-8 h-8" /><p className="text-sm">{text}</p>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const qc = useQueryClient();
  const [step, setStep]           = useState<Step>("boards");
  const [sel, setSel]             = useState<Sel>({ board: null, class_: null, subject: null, chapter: null, exercise: null, question: null });
  const [chapterMode, setMode]    = useState<ChapterMode>("exercises");
  const [modal, setModal]         = useState<Modal>(null);
  const [delTarget, setDelTarget] = useState<DeleteTarget | null>(null);

  const closeModal = () => setModal(null);
  const go = (s: Step, patch: Partial<Sel> = {}) => { setSel(p => ({ ...p, ...patch })); setStep(s); };

  const back = () => {
    switch (step) {
      case "classes":            return go("boards",            { class_: null, subject: null, chapter: null, exercise: null, question: null });
      case "subjects":           return go("classes",           { subject: null, chapter: null, exercise: null, question: null });
      case "chapters":           return go("subjects",          { chapter: null, exercise: null, question: null });
      case "chapter-detail":     return go("chapters",          { exercise: null, question: null });
      case "exercise-questions": return go("chapter-detail",    { question: null });
      case "question-detail":    return sel.exercise ? go("exercise-questions", { question: null }) : go("chapter-detail", { question: null });
    }
  };

  const confirmDelete = (label: string, fn: () => Promise<void>) => {
    setDelTarget({ label, fn });
    setModal("delete-confirm");
  };

  // breadcrumb
  const crumbs: { label: string; s: Step; patch: Partial<Sel> }[] = [];
  if (sel.board)    crumbs.push({ label: sel.board.name,               s: "classes",            patch: { class_: null, subject: null, chapter: null, exercise: null, question: null } });
  if (sel.class_)   crumbs.push({ label: sel.class_.name,              s: "subjects",           patch: { subject: null, chapter: null, exercise: null, question: null } });
  if (sel.subject)  crumbs.push({ label: sel.subject.name,             s: "chapters",           patch: { chapter: null, exercise: null, question: null } });
  if (sel.chapter)  crumbs.push({ label: sel.chapter.title,            s: "chapter-detail",     patch: { exercise: null, question: null } });
  if (sel.exercise) crumbs.push({ label: sel.exercise.name,            s: "exercise-questions", patch: { question: null } });
  if (sel.question) crumbs.push({ label: sel.question.question_number, s: "question-detail",    patch: {} });

  const shared = { sel, go, modal, setModal, closeModal, confirmDelete, qc };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary-600 dark:text-primary-400" /> Content Management
          </h1>
          <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mt-1 flex-wrap">
            <button onClick={() => go("boards", { board: null, class_: null, subject: null, chapter: null, exercise: null, question: null })} className="hover:text-primary-600 dark:hover:text-primary-400">Home</button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                <button onClick={() => go(c.s, c.patch)} className="hover:text-primary-600 dark:hover:text-primary-400 max-w-[150px] truncate">{c.label}</button>
              </span>
            ))}
          </nav>
        </div>
        <div className="flex gap-2">
          {step === "boards"   && <button onClick={() => contentApi.seedDemo().then(() => { toast.success("Demo data seeded!"); qc.invalidateQueries({ queryKey: ["boards"] }); }).catch(() => toast.error("Seed failed"))} className="btn btn-sm btn-secondary">Seed Demo Data</button>}
          {step === "boards"   && <button onClick={() => contentApi.seedExercises().then((r: any) => { toast.success(r.data?.already_seeded ? "Already seeded!" : `Seeded: ${r.data?.exercises} exercises, ${r.data?.questions} questions, ${r.data?.practice_questions} practice Qs`); }).catch(() => toast.error("Seed exercises failed"))} className="btn btn-sm btn-secondary">Seed Exercises</button>}
          {step !== "boards"   && <button onClick={back} className="btn btn-sm btn-secondary">← Back</button>}
        </div>
      </div>

      {step === "boards"             && <BoardsView {...shared} />}
      {step === "classes"            && <ClassesView {...shared} />}
      {step === "subjects"           && <SubjectsView {...shared} />}
      {step === "chapters"           && <ChaptersView {...shared} />}
      {step === "chapter-detail"     && <ChapterDetailView {...shared} chapterMode={chapterMode} setMode={setMode} />}
      {step === "exercise-questions" && <ExerciseQuestionsView {...shared} />}
      {step === "question-detail"    && <QuestionDetailView {...shared} />}

      {/* Delete confirm */}
      {modal === "delete-confirm" && delTarget && (
        <ModalShell title="Confirm Delete" onClose={closeModal}>
          <div className="flex gap-3 items-start mb-5">
            <AlertTriangle className="w-5 h-5 text-danger-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600 dark:text-gray-300">Delete <strong>{delTarget.label}</strong>? This cannot be undone.</p>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={closeModal} className="btn btn-secondary">Cancel</button>
            <button onClick={() => delTarget.fn().then(() => { toast.success("Deleted"); closeModal(); setDelTarget(null); }).catch((err: any) => toast.error(parseApiError(err)))} className="btn btn-danger">Delete</button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// ─── Boards ───────────────────────────────────────────────────────────────────

function BoardsView({ go, modal, setModal, closeModal, confirmDelete, qc }: any) {
  const { data: boards = [], isLoading, refetch } = useQuery({ queryKey: ["boards"], queryFn: () => curriculumAdminApi.listBoards(true).then(r => r.data) });
  const [editing, setEditing] = useState<any>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ name: string; code: string }>();
  const [apiError, setApiError] = useState("");

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["boards"] }); refetch(); };

  const createMut = useMutation({
    mutationFn: (d: any) => curriculumAdminApi.createBoard({ name: d.name, code: d.code.toUpperCase() }),
    onSuccess: () => { toast.success("Board created"); reset(); closeModal(); invalidate(); },
    onError: (err: any) => setApiError(parseApiError(err)),
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => curriculumAdminApi.updateBoard(editing.id, { name: d.name, code: d.code.toUpperCase() }),
    onSuccess: () => { toast.success("Board updated"); reset(); closeModal(); setEditing(null); invalidate(); },
    onError: (err: any) => setApiError(parseApiError(err)),
  });

  const openAdd = () => { setEditing(null); setApiError(""); reset({ name: "", code: "" }); setModal("add-board"); };
  const openEdit = (b: any) => { setEditing(b); setApiError(""); reset({ name: b.name, code: b.code }); setModal("edit-board"); };

  if (isLoading) return <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading…</div>;
  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={openAdd} className="btn btn-sm btn-primary"><Plus className="w-3.5 h-3.5" /> Add Board</button>
      </div>
      {!boards.length ? <EmptyState icon={BookOpen} text='No boards. Click "Seed Demo Data" or "Add Board" to create one.' /> : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {boards.map((b: any) => (
            <div key={b.id} className={`card-hover p-5 text-left group relative ${!b.is_active ? "opacity-60" : ""}`}>
              <button onClick={() => go("classes", { board: b, class_: null, subject: null, chapter: null, exercise: null, question: null })} className="w-full text-left">
                <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-3 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
                  <BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{b.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 uppercase tracking-wide">{b.code}</p>
                {!b.is_active && <span className="badge-gray mt-2 inline-block">inactive</span>}
              </button>
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); openEdit(b); }} className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-white dark:hover:bg-gray-700" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); confirmDelete(b.name, () => curriculumAdminApi.deleteBoard(b.id).then(() => invalidate())); }} className="p-1.5 text-gray-400 hover:text-danger-500 rounded-lg hover:bg-white dark:hover:bg-gray-700" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(modal === "add-board" || modal === "edit-board") && (
        <ModalShell title={modal === "edit-board" ? "Edit Board" : "Add Board"} onClose={() => { closeModal(); setEditing(null); }}>
          <form onSubmit={handleSubmit(d => modal === "edit-board" ? updateMut.mutate(d) : createMut.mutate(d))} className="space-y-4">
            {apiError && <div className="alert-danger"><AlertTriangle className="w-4 h-4 shrink-0" />{apiError}</div>}
            <div>
              <label className="label">Board Name</label>
              <input className="input w-full" {...register("name", { required: true })} placeholder="CBSE" />
              {errors.name && <p className="text-xs text-danger-500 mt-1">Name is required</p>}
            </div>
            <div>
              <label className="label">Board Code</label>
              <input className="input w-full" {...register("code", { required: true })} placeholder="CBSE" />
              {errors.code && <p className="text-xs text-danger-500 mt-1">Code is required</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { closeModal(); setEditing(null); }} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "Saving…" : modal === "edit-board" ? "Save Changes" : "Create"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

// ─── Classes ──────────────────────────────────────────────────────────────────

function ClassesView({ sel, go, modal, setModal, closeModal, confirmDelete }: any) {
  const { data: classes = [], isLoading, refetch } = useQuery({ queryKey: ["classes", sel.board?.id], queryFn: () => curriculumAdminApi.listClasses(sel.board.id, true).then(r => r.data), enabled: !!sel.board });
  const [editing, setEditing] = useState<any>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ name: string; number: number }>();
  const [apiError, setApiError] = useState("");

  const createMut = useMutation({
    mutationFn: (d: any) => curriculumAdminApi.createClass({ board_id: sel.board.id, name: d.name, number: Number(d.number) }),
    onSuccess: () => { toast.success("Class created"); reset(); closeModal(); refetch(); },
    onError: (err: any) => setApiError(parseApiError(err)),
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => curriculumAdminApi.updateClass(editing.id, { name: d.name, number: Number(d.number) }),
    onSuccess: () => { toast.success("Class updated"); reset(); closeModal(); setEditing(null); refetch(); },
    onError: (err: any) => setApiError(parseApiError(err)),
  });

  const openAdd = () => { setEditing(null); setApiError(""); reset({ name: "", number: 1 }); setModal("add-class"); };
  const openEdit = (c: any) => { setEditing(c); setApiError(""); reset({ name: c.name, number: c.number }); setModal("edit-class"); };

  if (isLoading) return <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading…</div>;
  return (
    <>
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a class under <strong>{sel.board?.name}</strong></p>
          <button onClick={openAdd} className="btn btn-sm btn-primary"><Plus className="w-3.5 h-3.5" /> Add Class</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {classes.map((c: any) => (
            <div key={c.id} className={`group relative flex items-center gap-1 rounded-xl border-2 ${!c.is_active ? "opacity-60" : ""} border-gray-200 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-500 transition-all`}>
              <button onClick={() => go("subjects", { class_: c, subject: null, chapter: null, exercise: null, question: null })}
                className="px-5 py-2.5 font-semibold text-gray-700 dark:text-gray-300 hover:text-primary-700 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-l-xl transition-all">
                {c.name}{!c.is_active && <span className="ml-1.5 badge-gray text-[10px]">inactive</span>}
              </button>
              <button onClick={() => openEdit(c)} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-primary-600 dark:hover:text-primary-400" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => confirmDelete(c.name, () => curriculumAdminApi.deleteClass(c.id).then(() => refetch()))} className="p-1.5 mr-1 text-gray-300 dark:text-gray-600 hover:text-danger-500" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {!classes.length && <p className="text-gray-400 dark:text-gray-500 text-sm">No classes found.</p>}
        </div>
      </div>

      {(modal === "add-class" || modal === "edit-class") && (
        <ModalShell title={modal === "edit-class" ? "Edit Class" : "Add Class"} onClose={() => { closeModal(); setEditing(null); }}>
          <form onSubmit={handleSubmit(d => modal === "edit-class" ? updateMut.mutate(d) : createMut.mutate(d))} className="space-y-4">
            {apiError && <div className="alert-danger"><AlertTriangle className="w-4 h-4 shrink-0" />{apiError}</div>}
            <div>
              <label className="label">Class Name</label>
              <input className="input w-full" {...register("name", { required: true })} placeholder="Class 10" />
              {errors.name && <p className="text-xs text-danger-500 mt-1">Name is required</p>}
            </div>
            <div>
              <label className="label">Class Number (1-12)</label>
              <input type="number" min={1} max={12} className="input w-full" {...register("number", { required: true, min: 1, max: 12 })} placeholder="10" />
              {errors.number && <p className="text-xs text-danger-500 mt-1">Number must be between 1 and 12</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { closeModal(); setEditing(null); }} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "Saving…" : modal === "edit-class" ? "Save Changes" : "Create"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

// ─── Subjects ─────────────────────────────────────────────────────────────────

function SubjectsView({ sel, go, modal, setModal, closeModal, confirmDelete }: any) {
  const { data: subjects = [], isLoading, refetch } = useQuery({ queryKey: ["subjects", sel.class_?.id], queryFn: () => curriculumAdminApi.listSubjects(sel.class_.id, true).then(r => r.data), enabled: !!sel.class_ });
  const [editing, setEditing] = useState<any>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ name: string; code: string; icon_url?: string }>();
  const [apiError, setApiError] = useState("");

  const createMut = useMutation({
    mutationFn: (d: any) => curriculumAdminApi.createSubject({ class_id: sel.class_.id, name: d.name, code: d.code.toUpperCase(), icon_url: d.icon_url?.trim() || null }),
    onSuccess: () => { toast.success("Subject created"); reset(); closeModal(); refetch(); },
    onError: (err: any) => setApiError(parseApiError(err)),
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => curriculumAdminApi.updateSubject(editing.id, { name: d.name, code: d.code.toUpperCase(), icon_url: d.icon_url?.trim() || null }),
    onSuccess: () => { toast.success("Subject updated"); reset(); closeModal(); setEditing(null); refetch(); },
    onError: (err: any) => setApiError(parseApiError(err)),
  });

  const openAdd = () => { setEditing(null); setApiError(""); reset({ name: "", code: "", icon_url: "" }); setModal("add-subject"); };
  const openEdit = (s: any) => { setEditing(s); setApiError(""); reset({ name: s.name, code: s.code, icon_url: s.icon_url ?? "" }); setModal("edit-subject"); };

  if (isLoading) return <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading…</div>;
  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={openAdd} className="btn btn-sm btn-primary"><Plus className="w-3.5 h-3.5" /> Add Subject</button>
      </div>
      {!subjects.length ? <EmptyState icon={Layers} text="No subjects yet. Click 'Add Subject'." /> : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {subjects.map((s: any) => (
            <div key={s.id} className={`card-hover p-5 text-left group relative ${!s.is_active ? "opacity-60" : ""}`}>
              <button onClick={() => go("chapters", { subject: s, chapter: null, exercise: null, question: null })} className="w-full text-left">
                <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-3 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
                  <AlignLeft className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{s.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 uppercase">{s.code}</p>
                {!s.is_active && <span className="badge-gray mt-2 inline-block">inactive</span>}
              </button>
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); openEdit(s); }} className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-white dark:hover:bg-gray-700" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); confirmDelete(s.name, () => curriculumAdminApi.deleteSubject(s.id).then(() => refetch())); }} className="p-1.5 text-gray-400 hover:text-danger-500 rounded-lg hover:bg-white dark:hover:bg-gray-700" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(modal === "add-subject" || modal === "edit-subject") && (
        <ModalShell title={modal === "edit-subject" ? "Edit Subject" : "Add Subject"} onClose={() => { closeModal(); setEditing(null); }}>
          <form onSubmit={handleSubmit(d => modal === "edit-subject" ? updateMut.mutate(d) : createMut.mutate(d))} className="space-y-4">
            {apiError && <div className="alert-danger"><AlertTriangle className="w-4 h-4 shrink-0" />{apiError}</div>}
            <div>
              <label className="label">Subject Name</label>
              <input className="input w-full" {...register("name", { required: true })} placeholder="Mathematics" />
              {errors.name && <p className="text-xs text-danger-500 mt-1">Name is required</p>}
            </div>
            <div>
              <label className="label">Subject Code</label>
              <input className="input w-full" {...register("code", { required: true })} placeholder="MATH" />
              {errors.code && <p className="text-xs text-danger-500 mt-1">Code is required</p>}
            </div>
            <div><label className="label">Icon URL (optional)</label><input className="input w-full" {...register("icon_url")} placeholder="https://…/icon.svg" /></div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { closeModal(); setEditing(null); }} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "Saving…" : modal === "edit-subject" ? "Save Changes" : "Create"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

// ─── Chapters ─────────────────────────────────────────────────────────────────

function ChaptersView({ sel, go, modal, setModal, closeModal, confirmDelete }: any) {
  const { data: chapters = [], isLoading, refetch } = useQuery({ queryKey: ["chapters", sel.subject?.id], queryFn: () => curriculumAdminApi.listChapters(sel.subject.id, true).then(r => r.data), enabled: !!sel.subject });
  const [editing, setEditing] = useState<any>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ title: string; description?: string; sequence: number }>();
  const [apiError, setApiError] = useState("");

  const createMut = useMutation({
    mutationFn: (d: any) => curriculumAdminApi.createChapter({ subject_id: sel.subject.id, title: d.title, description: d.description?.trim() || null, sequence: Number(d.sequence || 0) }),
    onSuccess: () => { toast.success("Chapter created"); reset(); closeModal(); refetch(); },
    onError: (err: any) => setApiError(parseApiError(err)),
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => curriculumAdminApi.updateChapter(editing.id, { title: d.title, description: d.description?.trim() || null, sequence: Number(d.sequence || 0) }),
    onSuccess: () => { toast.success("Chapter updated"); reset(); closeModal(); setEditing(null); refetch(); },
    onError: (err: any) => setApiError(parseApiError(err)),
  });

  const openAdd = () => { setEditing(null); setApiError(""); reset({ title: "", description: "", sequence: 1 }); setModal("add-chapter"); };
  const openEdit = (c: any) => { setEditing(c); setApiError(""); reset({ title: c.title, description: c.description ?? "", sequence: c.sequence }); setModal("edit-chapter"); };

  if (isLoading) return <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading…</div>;
  return (
    <>
      <SectionCard title={`Chapters — ${sel.subject?.name}`} action={<button onClick={openAdd} className="btn btn-sm btn-primary"><Plus className="w-3.5 h-3.5" /> Add Chapter</button>}>
        {!chapters.length ? <EmptyState icon={BookOpen} text="No chapters yet. Click 'Add Chapter'." /> : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {chapters.map((c: any) => (
              <div key={c.id} className={`flex items-center px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 gap-4 group transition-colors ${!c.is_active ? "opacity-60" : ""}`}>
                <button onClick={() => go("chapter-detail", { chapter: c, exercise: null, question: null })} className="flex-1 flex items-center gap-4 text-left min-w-0">
                  <span className="text-sm font-bold text-gray-400 dark:text-gray-500 w-6">{c.sequence || "—"}</span>
                  <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{c.title}</span>
                  {!c.is_active && <span className="badge-gray">inactive</span>}
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-500" />
                </button>
                <button onClick={() => openEdit(c)} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-primary-600 dark:hover:text-primary-400 rounded" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => confirmDelete(c.title, () => curriculumAdminApi.deleteChapter(c.id).then(() => refetch()))} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-danger-500 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      {(modal === "add-chapter" || modal === "edit-chapter") && (
        <ModalShell title={modal === "edit-chapter" ? "Edit Chapter" : "Add Chapter"} onClose={() => { closeModal(); setEditing(null); }}>
          <form onSubmit={handleSubmit(d => modal === "edit-chapter" ? updateMut.mutate(d) : createMut.mutate(d))} className="space-y-4">
            {apiError && <div className="alert-danger"><AlertTriangle className="w-4 h-4 shrink-0" />{apiError}</div>}
            <div>
              <label className="label">Chapter Title</label>
              <input className="input w-full" {...register("title", { required: true })} placeholder="Real Numbers" />
              {errors.title && <p className="text-xs text-danger-500 mt-1">Title is required</p>}
            </div>
            <div><label className="label">Description (optional)</label><textarea className="input w-full min-h-[70px]" {...register("description")} placeholder="Short chapter description…" /></div>
            <div><label className="label">Sequence</label><input type="number" className="input w-full" {...register("sequence")} defaultValue={1} /></div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { closeModal(); setEditing(null); }} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "Saving…" : modal === "edit-chapter" ? "Save Changes" : "Create"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

// ─── Chapter Detail ───────────────────────────────────────────────────────────

function ChapterDetailView({ sel, go, chapterMode, setMode, modal, setModal, closeModal, confirmDelete }: any) {
  const { data: exercises = [], isLoading: exLoading, refetch: refetchEx } = useQuery({ queryKey: ["exercises", sel.chapter?.id], queryFn: () => contentApi.chapterExercises(sel.chapter.id).then(r => r.data), enabled: !!sel.chapter && chapterMode === "exercises" });
  const { data: questions = [], isLoading: qLoading, refetch: refetchQ }   = useQuery({ queryKey: ["chapter-questions", sel.chapter?.id], queryFn: () => contentApi.chapterDirectQuestions(sel.chapter.id).then(r => r.data), enabled: !!sel.chapter && chapterMode === "direct" });

  const exForm = useForm<{ name: string; number: string; sequence: number }>();
  const qForm  = useForm<{ question_number: string; question_text: string; sequence: number }>();

  const createEx = useMutation({
    mutationFn: (d: any) => contentApi.createExercise({ chapter_id: sel.chapter.id, name: d.name, number: d.number || "", sequence: Number(d.sequence || 0) }),
    onSuccess: () => { toast.success("Exercise created"); exForm.reset(); closeModal(); refetchEx(); },
    onError: () => toast.error("Failed"),
  });
  const createQ = useMutation({
    mutationFn: (d: any) => contentApi.createQuestion({ chapter_id: sel.chapter.id, exercise_id: null, question_number: d.question_number, question_text: d.question_text || null, sequence: Number(d.sequence || 0) }),
    onSuccess: () => { toast.success("Question created"); qForm.reset(); closeModal(); refetchQ(); },
    onError: () => toast.error("Failed"),
  });

  return (
    <>
      {/* Mode toggle */}
      <div className="card p-4 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Upload Mode:</span>
        <div className="flex gap-2">
          <button onClick={() => setMode("exercises")} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 ${chapterMode === "exercises" ? "bg-primary-600 text-white shadow-sm" : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-300 dark:hover:border-primary-600"}`}>
            <Layers className="w-3.5 h-3.5" />Chapter → Exercise → Question
          </button>
          <button onClick={() => setMode("direct")} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 ${chapterMode === "direct" ? "bg-primary-600 text-white shadow-sm" : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-300 dark:hover:border-primary-600"}`}>
            <FileQuestion className="w-3.5 h-3.5" />Chapter → Question (No Exercise)
          </button>
          <button onClick={() => setMode("topics")} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 ${chapterMode === "topics" ? "bg-primary-600 text-white shadow-sm" : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-300 dark:hover:border-primary-600"}`}>
            <Milestone className="w-3.5 h-3.5" />Topics (for video feed)
          </button>
        </div>
      </div>

      {/* Topics mode */}
      {chapterMode === "topics" && (
        <TopicsPanel sel={sel} modal={modal} setModal={setModal} closeModal={closeModal} confirmDelete={confirmDelete} />
      )}

      {/* Exercises mode */}
      {chapterMode === "exercises" && (
        <SectionCard title="Exercises" action={<button onClick={() => setModal("add-exercise")} className="btn btn-sm btn-primary"><Plus className="w-3.5 h-3.5" /> Add Exercise</button>}>
          {exLoading ? <div className="p-6 text-center text-gray-400 dark:text-gray-500">Loading…</div> : !exercises.length ? <EmptyState icon={Layers} text="No exercises yet. Add e.g. 'Exercise 1.1'" /> : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {exercises.map((e: any) => (
                <div key={e.id} className="flex items-center px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 group transition-colors">
                  <button className="flex-1 flex items-center gap-3 text-left" onClick={() => go("exercise-questions", { exercise: e, question: null })}>
                    <span className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-300 text-xs font-bold flex-shrink-0">{e.number || "#"}</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{e.name}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 ml-auto" />
                  </button>
                  <button onClick={() => confirmDelete(e.name, () => contentApi.deleteExercise(e.id).then(() => refetchEx()))} className="ml-3 p-1.5 text-gray-300 dark:text-gray-600 hover:text-danger-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Direct questions mode */}
      {chapterMode === "direct" && (
        <SectionCard title="Questions" action={<button onClick={() => setModal("add-question")} className="btn btn-sm btn-primary"><Plus className="w-3.5 h-3.5" /> Add Question</button>}>
          {qLoading ? <div className="p-6 text-center text-gray-400 dark:text-gray-500">Loading…</div> : !questions.length ? <EmptyState icon={FileQuestion} text="No questions yet. Add a question." /> : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {questions.map((q: any) => (
                <div key={q.id} className="flex items-center px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 group transition-colors">
                  <button className="flex-1 flex items-center gap-3 text-left" onClick={() => go("question-detail", { question: q })}>
                    <span className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-300 text-xs font-bold flex-shrink-0">{q.question_number}</span>
                    <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{q.question_text || "—"}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-500" />
                  </button>
                  <button onClick={() => confirmDelete(q.question_number, () => contentApi.deleteQuestion(q.id).then(() => refetchQ()))} className="ml-3 p-1.5 text-gray-300 dark:text-gray-600 hover:text-danger-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Add Exercise modal */}
      {modal === "add-exercise" && (
        <ModalShell title="Add Exercise" onClose={closeModal}>
          <form onSubmit={exForm.handleSubmit(d => createEx.mutate(d))} className="space-y-4">
            <div><label className="label">Exercise Name</label><input className="input w-full" {...exForm.register("name", { required: true })} placeholder="Exercise 1.3" /></div>
            <div><label className="label">Number (optional)</label><input className="input w-full" {...exForm.register("number")} placeholder="1.3" /></div>
            <div><label className="label">Sequence</label><input type="number" className="input w-full" {...exForm.register("sequence")} defaultValue={1} /></div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={createEx.isPending}>{createEx.isPending ? "Creating…" : "Create"}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Add Question modal (direct mode) */}
      {modal === "add-question" && (
        <ModalShell title="Add Question" onClose={closeModal}>
          <form onSubmit={qForm.handleSubmit(d => createQ.mutate(d))} className="space-y-4">
            <div><label className="label">Question Number</label><input className="input w-full" {...qForm.register("question_number", { required: true })} placeholder="Q1 or 1(a)" /></div>
            <div><label className="label">Question Text (optional)</label><textarea className="input w-full min-h-[80px]" {...qForm.register("question_text")} placeholder="Find the HCF of 96 and 404…" /></div>
            <div><label className="label">Sequence</label><input type="number" className="input w-full" {...qForm.register("sequence")} defaultValue={1} /></div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={createQ.isPending}>{createQ.isPending ? "Creating…" : "Create"}</button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

// ─── Topics (Chapter → Topic, feeds the student video/practice hierarchy) ────

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

function TopicsPanel({ sel, modal, setModal, closeModal, confirmDelete }: any) {
  const { data: topics = [], isLoading, refetch } = useQuery({
    queryKey: ["topics", sel.chapter?.id],
    queryFn: () => curriculumAdminApi.listTopics(sel.chapter.id, true).then(r => r.data),
    enabled: !!sel.chapter,
  });
  const [editing, setEditing] = useState<any>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ title: string; description?: string; sequence: number; difficulty: "easy" | "medium" | "hard" }>();
  const [apiError, setApiError] = useState("");

  const createMut = useMutation({
    mutationFn: (d: any) => curriculumAdminApi.createTopic({ chapter_id: sel.chapter.id, title: d.title, description: d.description?.trim() || null, sequence: Number(d.sequence || 0), difficulty: d.difficulty }),
    onSuccess: () => { toast.success("Topic created"); reset(); closeModal(); refetch(); },
    onError: (err: any) => setApiError(parseApiError(err)),
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => curriculumAdminApi.updateTopic(editing.id, { title: d.title, description: d.description?.trim() || null, sequence: Number(d.sequence || 0), difficulty: d.difficulty }),
    onSuccess: () => { toast.success("Topic updated"); reset(); closeModal(); setEditing(null); refetch(); },
    onError: (err: any) => setApiError(parseApiError(err)),
  });

  const openAdd = () => { setEditing(null); setApiError(""); reset({ title: "", description: "", sequence: 1, difficulty: "medium" }); setModal("add-topic"); };
  const openEdit = (t: any) => { setEditing(t); setApiError(""); reset({ title: t.title, description: t.description ?? "", sequence: t.sequence, difficulty: t.difficulty ?? "medium" }); setModal("edit-topic"); };

  return (
    <>
      <SectionCard title="Topics" action={<button onClick={openAdd} className="btn btn-sm btn-primary"><Plus className="w-3.5 h-3.5" /> Add Topic</button>}>
        {isLoading ? <div className="p-6 text-center text-gray-400 dark:text-gray-500">Loading…</div> : !topics.length ? (
          <EmptyState icon={Milestone} text="No topics yet. Topics group videos shown to students on this chapter." />
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {(topics as any[]).map((t) => (
              <div key={t.id} className={`flex items-center px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 gap-4 group transition-colors ${!t.is_active ? "opacity-60" : ""}`}>
                <span className="text-sm font-bold text-gray-400 dark:text-gray-500 w-6">{t.sequence || "—"}</span>
                <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{t.title}</span>
                <Badge label={t.difficulty} color={t.difficulty === "easy" ? "green" : t.difficulty === "hard" ? "red" : "yellow"} />
                {!t.is_active && <span className="badge-gray">inactive</span>}
                <button onClick={() => openEdit(t)} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-primary-600 dark:hover:text-primary-400 rounded" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => confirmDelete(t.title, () => curriculumAdminApi.deleteTopic(t.id).then(() => refetch()))} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-danger-500 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {(modal === "add-topic" || modal === "edit-topic") && (
        <ModalShell title={modal === "edit-topic" ? "Edit Topic" : "Add Topic"} onClose={() => { closeModal(); setEditing(null); }}>
          <form onSubmit={handleSubmit(d => modal === "edit-topic" ? updateMut.mutate(d) : createMut.mutate(d))} className="space-y-4">
            {apiError && <div className="alert-danger"><AlertTriangle className="w-4 h-4 shrink-0" />{apiError}</div>}
            <div>
              <label className="label">Topic Title</label>
              <input className="input w-full" {...register("title", { required: true })} placeholder="Euclid's Division Lemma" />
              {errors.title && <p className="text-xs text-danger-500 mt-1">Title is required</p>}
            </div>
            <div><label className="label">Description (optional)</label><textarea className="input w-full min-h-[70px]" {...register("description")} placeholder="Short topic description…" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Sequence</label><input type="number" className="input w-full" {...register("sequence")} defaultValue={1} /></div>
              <div>
                <label className="label">Difficulty</label>
                <select className="input w-full" {...register("difficulty")}>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { closeModal(); setEditing(null); }} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "Saving…" : modal === "edit-topic" ? "Save Changes" : "Create"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

// ─── Exercise Questions ───────────────────────────────────────────────────────

function ExerciseQuestionsView({ sel, go, modal, setModal, closeModal, confirmDelete }: any) {
  const { data: questions = [], isLoading, refetch } = useQuery({ queryKey: ["exercise-questions", sel.exercise?.id], queryFn: () => contentApi.exerciseQuestions(sel.exercise.id).then(r => r.data), enabled: !!sel.exercise });
  const { register, handleSubmit, reset } = useForm<{ question_number: string; question_text: string; sequence: number }>();
  const mut = useMutation({
    mutationFn: (d: any) => contentApi.createQuestion({ chapter_id: sel.chapter.id, exercise_id: sel.exercise.id, question_number: d.question_number, question_text: d.question_text || null, sequence: Number(d.sequence || 0) }),
    onSuccess: () => { toast.success("Question created"); reset(); closeModal(); refetch(); },
    onError: () => toast.error("Failed"),
  });
  return (
    <>
      <SectionCard title={`Questions — ${sel.exercise?.name}`} action={<button onClick={() => setModal("add-question")} className="btn btn-sm btn-primary"><Plus className="w-3.5 h-3.5" /> Add Question</button>}>
        {isLoading ? <div className="p-6 text-center text-gray-400 dark:text-gray-500">Loading…</div> : !questions.length ? <EmptyState icon={FileQuestion} text="No questions yet. Add a question." /> : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {questions.map((q: any) => (
              <div key={q.id} className="flex items-center px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 group transition-colors">
                <button className="flex-1 flex items-center gap-3 text-left" onClick={() => go("question-detail", { question: q })}>
                  <span className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-300 text-xs font-bold flex-shrink-0">{q.question_number}</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{q.question_text || "—"}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-500" />
                </button>
                <button onClick={() => confirmDelete(q.question_number, () => contentApi.deleteQuestion(q.id).then(() => refetch()))} className="ml-3 p-1.5 text-gray-300 dark:text-gray-600 hover:text-danger-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {modal === "add-question" && (
        <ModalShell title="Add Question" onClose={closeModal}>
          <form onSubmit={handleSubmit(d => mut.mutate(d))} className="space-y-4">
            <div><label className="label">Question Number</label><input className="input w-full" {...register("question_number", { required: true })} placeholder="Q1 or 1(a)" /></div>
            <div><label className="label">Question Text (optional)</label><textarea className="input w-full min-h-[80px]" {...register("question_text")} placeholder="Prove that √2 is irrational…" /></div>
            <div><label className="label">Sequence</label><input type="number" className="input w-full" {...register("sequence")} defaultValue={1} /></div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={mut.isPending}>{mut.isPending ? "Creating…" : "Create"}</button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

// ─── Question Detail ──────────────────────────────────────────────────────────

function QuestionDetailView({ sel, modal, setModal, closeModal, confirmDelete }: any) {
  const qId = sel.question?.id;

  const { data: video,    isLoading: vLoading, refetch: refetchV } = useQuery({ queryKey: ["question-video",    qId], queryFn: () => contentApi.getQuestionVideo(qId).then(r => r.data),    enabled: !!qId });
  const { data: practice = [], isLoading: pLoading, refetch: refetchP } = useQuery({ queryKey: ["question-practice", qId], queryFn: () => contentApi.questionPractice(qId).then(r => r.data), enabled: !!qId });

  const vForm = useForm<{ title: string; youtube_id: string; youtube_id_hi: string; youtube_id_pa: string; youtube_id_bho: string; duration_minutes: string; notes_url: string; is_premium: boolean; target_board: string; target_class: string }>();
  const pForm = useForm<{ text: string; option_a: string; option_b: string; option_c: string; option_d: string; correct_option: string; explanation: string; difficulty: string; sequence: number }>();

  const setVideoMut = useMutation({
    mutationFn: (d: any) => {
      const [m = "0", s = "0"] = (d.duration_minutes || "0:00").split(":");
      return contentApi.setQuestionVideo(qId, {
        title: d.title,
        youtube_id:     extractYouTubeId(d.youtube_id),
        youtube_id_hi:  d.youtube_id_hi  ? extractYouTubeId(d.youtube_id_hi)  : null,
        youtube_id_pa:  d.youtube_id_pa  ? extractYouTubeId(d.youtube_id_pa)  : null,
        youtube_id_bho: d.youtube_id_bho ? extractYouTubeId(d.youtube_id_bho) : null,
        duration_seconds: Number(m) * 60 + Number(s),
        notes_url: d.notes_url?.trim() || null,
        is_premium: Boolean(d.is_premium),
        target_board: d.target_board || null,
        target_class: d.target_class ? Number(d.target_class) : null,
      });
    },
    onSuccess: () => { toast.success("Video saved"); vForm.reset(); closeModal(); refetchV(); },
    onError: () => toast.error("Failed to save video"),
  });

  const addPracticeMut = useMutation({
    mutationFn: (d: any) => contentApi.createPracticeQuestion({ question_id: qId, ...d, sequence: Number(d.sequence || 0) }),
    onSuccess: () => { toast.success("Practice question added"); pForm.reset(); closeModal(); refetchP(); },
    onError: () => toast.error("Failed"),
  });

  const ytId = video?.youtube_id;

  return (
    <div className="space-y-5">
      {/* Question header */}
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-sm">{sel.question?.question_number}</span>
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{sel.question?.question_text || "Question " + sel.question?.question_number}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sel.chapter?.title}{sel.exercise ? ` › ${sel.exercise.name}` : ""}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg px-3 py-2">Both <strong>Video</strong> and <strong>Practice Questions</strong> are optional. Upload either, both, or neither.</p>
      </div>

      {/* ── Video (optional) ─────────────────────────────────────────────────── */}
      <SectionCard title="Solution Video (Optional)" action={
        <button onClick={() => setModal("set-video")} className="btn btn-sm btn-primary">
          <Video className="w-3.5 h-3.5" />{video ? " Replace" : " Add Video"}
        </button>
      }>
        {vLoading ? <div className="p-6 text-center text-gray-400 dark:text-gray-500">Loading…</div> : !video ? (
          <EmptyState icon={PlayCircle} text="No video yet. Upload a YouTube solution video for this question." />
        ) : (
          <div className="p-5 flex gap-4 items-start flex-wrap">
            <a href={`https://youtu.be/${ytId}`} target="_blank" rel="noreferrer" className="relative flex-shrink-0 rounded-xl overflow-hidden group w-40">
              <img src={ytThumb(ytId!)} alt="thumb" className="w-40 h-24 object-cover" />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <PlayCircle className="w-8 h-8 text-white" />
              </div>
            </a>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{video.title}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge label={`EN: ${video.youtube_id}`} color="blue" />
                {video.youtube_id_hi  && <Badge label={`HI: ${video.youtube_id_hi}`}   color="green" />}
                {video.youtube_id_pa  && <Badge label={`PA: ${video.youtube_id_pa}`}   color="green" />}
                {video.youtube_id_bho && <Badge label={`BHO: ${video.youtube_id_bho}`} color="green" />}
                {video.is_premium && <Badge label="Premium" color="yellow" />}
                {video.duration_seconds > 0 && <Badge label={`${Math.floor(video.duration_seconds / 60)}:${String(video.duration_seconds % 60).padStart(2, "0")}`} />}
              </div>
            </div>
            <button onClick={() => confirmDelete(video.title, () => contentApi.deleteQuestionVideo(qId).then(() => refetchV()))} className="p-2 text-gray-300 dark:text-gray-600 hover:text-danger-500 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-900/30 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </SectionCard>

      {/* ── Practice Questions / Quiz (optional) ─────────────────────────────── */}
      <SectionCard title={`Practice Questions / Quiz (Optional) — ${practice.length} added`} action={
        <button onClick={() => setModal("add-practice")} className="btn btn-sm btn-primary"><Plus className="w-3.5 h-3.5" /> Add MCQ</button>
      }>
        {pLoading ? <div className="p-6 text-center text-gray-400 dark:text-gray-500">Loading…</div> : !practice.length ? (
          <EmptyState icon={HelpCircle} text="No practice MCQs yet. Add questions to help students test understanding after watching." />
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {(practice as any[]).map((pq: any, i: number) => (
              <div key={pq.id} className="px-5 py-4 flex gap-3">
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-6 flex-shrink-0 mt-0.5">Q{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{pq.text}</p>
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    {(["a", "b", "c", "d"] as const).filter(o => pq[`option_${o}`]).map(o => (
                      <div key={o} className={`text-xs px-2 py-1.5 rounded-lg flex items-center gap-1 ${pq.correct_option === o ? "bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-400 font-semibold" : "bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400"}`}>
                        <span className="font-bold">({o.toUpperCase()})</span> {pq[`option_${o}`]}
                        {pq.correct_option === o && <CheckCircle className="w-3 h-3 ml-auto flex-shrink-0" />}
                      </div>
                    ))}
                  </div>
                  {pq.explanation && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 italic">{pq.explanation}</p>}
                  <Badge label={pq.difficulty} color={pq.difficulty === "easy" ? "green" : pq.difficulty === "hard" ? "red" : "yellow"} />
                </div>
                <button onClick={() => confirmDelete(`Q${i + 1}`, () => contentApi.deletePracticeQuestion(pq.id).then(() => refetchP()))} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-danger-500 rounded flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Set Video modal */}
      {modal === "set-video" && (
        <ModalShell title="Add Solution Video" onClose={closeModal}>
          <form onSubmit={vForm.handleSubmit(d => setVideoMut.mutate(d))} className="space-y-4">
            <div><label className="label">Video Title</label><input className="input w-full" {...vForm.register("title", { required: true })} placeholder="Q1 Solution — Real Numbers" /></div>
            <div>
              <label className="label">YouTube URL or ID (English) *</label>
              <input className="input w-full" {...vForm.register("youtube_id", { required: true })} placeholder="https://youtu.be/xxxxx or video ID" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label text-xs">Hindi (opt)</label><input className="input w-full text-sm" {...vForm.register("youtube_id_hi")} placeholder="ID" /></div>
              <div><label className="label text-xs">Punjabi (opt)</label><input className="input w-full text-sm" {...vForm.register("youtube_id_pa")} placeholder="ID" /></div>
              <div><label className="label text-xs">Bhojpuri (opt)</label><input className="input w-full text-sm" {...vForm.register("youtube_id_bho")} placeholder="ID" /></div>
            </div>
            <div><label className="label">Duration mm:ss *</label><input className="input w-full" {...vForm.register("duration_minutes", { required: true })} placeholder="5:30" /></div>
            <div>
              <label className="label">Notes PDF URL (optional)</label>
              <input className="input w-full" {...vForm.register("notes_url")} placeholder="https://drive.google.com/file/d/... or any PDF URL" />
              <p className="helper-text">Students unlock notes after watching 70% of the video.</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" className="checkbox" {...vForm.register("is_premium")} /> Premium content</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Restrict to Board (optional)</label>
                <select className="input w-full text-sm" {...vForm.register("target_board")} defaultValue="">
                  <option value="">All boards</option>
                  <option value="cbse">CBSE</option>
                  <option value="hbse">HBSE</option>
                  <option value="up_board">UP Board</option>
                  <option value="icse">ICSE</option>
                  <option value="rbse">RBSE</option>
                  <option value="bihar">Bihar</option>
                </select>
                <p className="helper-text">Leave as "All boards" to show this video to every board.</p>
              </div>
              <div>
                <label className="label text-xs">Restrict to Class (optional)</label>
                <input type="number" min={1} max={12} className="input w-full text-sm" {...vForm.register("target_class")} placeholder="e.g. 10" />
                <p className="helper-text">Leave blank to show this video to every class.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={setVideoMut.isPending}>{setVideoMut.isPending ? "Saving…" : "Save Video"}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Add Practice Question modal */}
      {modal === "add-practice" && (
        <ModalShell title="Add Practice MCQ" onClose={closeModal}>
          <form onSubmit={pForm.handleSubmit(d => addPracticeMut.mutate(d))} className="space-y-4">
            <div><label className="label">Question</label><textarea className="input w-full min-h-[80px]" {...pForm.register("text", { required: true })} placeholder="Which of the following is irrational?" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Option A *</label><input className="input w-full" {...pForm.register("option_a", { required: true })} placeholder="√2" /></div>
              <div><label className="label">Option B *</label><input className="input w-full" {...pForm.register("option_b", { required: true })} placeholder="3/4" /></div>
              <div><label className="label">Option C (opt)</label><input className="input w-full" {...pForm.register("option_c")} placeholder="0.25" /></div>
              <div><label className="label">Option D (opt)</label><input className="input w-full" {...pForm.register("option_d")} placeholder="1.5" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Correct Option *</label>
                <select className="input w-full" {...pForm.register("correct_option", { required: true })}>
                  <option value="a">A</option><option value="b">B</option><option value="c">C</option><option value="d">D</option>
                </select>
              </div>
              <div>
                <label className="label">Difficulty</label>
                <select className="input w-full" {...pForm.register("difficulty")}>
                  <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div><label className="label">Explanation (opt)</label><textarea className="input w-full min-h-[60px]" {...pForm.register("explanation")} placeholder="√2 cannot be expressed as p/q…" /></div>
            <div><label className="label">Sequence</label><input type="number" className="input w-full" {...pForm.register("sequence")} defaultValue={1} /></div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={addPracticeMut.isPending}>{addPracticeMut.isPending ? "Adding…" : "Add Question"}</button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}
