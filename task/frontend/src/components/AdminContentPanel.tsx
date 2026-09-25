import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Edit2, ChevronRight, ChevronDown, X, Check,
  BookOpen, AlertCircle, Loader2,
} from "lucide-react";
import { contentApi, api } from "@/lib/api";
import {
  DIFFICULTY_OPTIONS,
  EXAM_TYPE_OPTIONS,
  ADMIN_CONTENT_TABS,
  type AdminContentTabId,
} from "@/lib/constants";

// ─── Shared helpers ──────────────────────────────────────────────────────────

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg animate-slide-up">
      <Check className="w-4 h-4 shrink-0" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

function ErrorMsg({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function InputField({
  label, value, onChange, type = "text", placeholder = "", required = false,
}: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-100"
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options, required = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-100"
      >
        <option value="">Select {label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Admin API helpers (endpoints not yet in contentApi) ─────────────────────

const adminApi = {
  // Boards
  createBoard: (data: { name: string; code: string }) =>
    api.post("/v1/content/admin/boards", data),
  deleteBoard: (id: string) => api.delete(`/v1/content/admin/boards/${id}`),

  // Classes
  createClass: (boardId: string, data: { number: number; label?: string }) =>
    api.post(`/v1/content/admin/boards/${boardId}/classes`, data),
  deleteClass: (id: string) => api.delete(`/v1/content/admin/classes/${id}`),

  // Subjects
  createSubject: (classId: string, data: { name: string; code?: string }) =>
    api.post(`/v1/content/admin/classes/${classId}/subjects`, data),
  deleteSubject: (id: string) => api.delete(`/v1/content/admin/subjects/${id}`),

  // Chapters
  createChapter: (subjectId: string, data: { name: string; order?: number }) =>
    api.post(`/v1/content/admin/subjects/${subjectId}/chapters`, data),
  deleteChapter: (id: string) => api.delete(`/v1/content/admin/chapters/${id}`),

  // Previous Year Papers — delegates to contentApi (real endpoints)
  getPyps: (params?: { board?: string; class_num?: number; subject?: string; limit?: number }) =>
    contentApi.previousYearPapers(params),
  createPyp: (data: object) => contentApi.createPreviousYearPaper(data as Parameters<typeof contentApi.createPreviousYearPaper>[0]),
  updatePyp: (id: string, data: object) => contentApi.updatePreviousYearPaper(id, data),
  deletePyp: (id: string) => contentApi.deletePreviousYearPaper(id),

  // Knowledge Hub Categories — delegates to contentApi (real endpoints)
  getHubCategories: () => contentApi.knowledgeCategories(),
  createHubCategory: (data: { name: string; description?: string }) =>
    contentApi.createKnowledgeCategory(data),
  deleteHubCategory: (id: string) => contentApi.deleteKnowledgeCategory(id),

  // Knowledge Hub Articles — delegates to contentApi (real endpoints)
  getHubArticles: (params?: { category_id?: string; limit?: number }) =>
    contentApi.knowledgeArticles(params),
  createHubArticle: (data: object) =>
    contentApi.createKnowledgeArticle(data as Parameters<typeof contentApi.createKnowledgeArticle>[0]),
  updateHubArticle: (id: string, data: object) => contentApi.updateKnowledgeArticle(id, data),
  deleteHubArticle: (id: string) => contentApi.deleteKnowledgeArticle(id),
};

// ─── Tab 1: Content Hierarchy ─────────────────────────────────────────────────

interface HierarchyNode {
  id: string; name: string; [key: string]: unknown;
}

function AddInlineForm({
  fields,
  onSubmit,
  onCancel,
  loading,
}: {
  fields: { key: string; label: string; type?: string; placeholder?: string }[];
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, ""]))
  );

  return (
    <div className="flex flex-wrap gap-2 items-end p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl mt-2">
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1 flex-1 min-w-[120px]">
          <label className="text-xs text-gray-500">{f.label}</label>
          <input
            type={f.type ?? "text"}
            value={values[f.key]}
            placeholder={f.placeholder ?? f.label}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            className="text-sm bg-white dark:bg-gray-900 rounded-lg px-2 py-1.5 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      ))}
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit(values)}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function BoardTree() {
  const qc = useQueryClient();
  const [expandedBoards, setExpandedBoards] = useState<Record<string, boolean>>({});
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
  const [addingBoard, setAddingBoard] = useState(false);
  const [addingClass, setAddingClass] = useState<string | null>(null);
  const [addingSubject, setAddingSubject] = useState<string | null>(null);
  const [addingChapter, setAddingChapter] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const { data: boards = [], isLoading: boardsLoading } = useQuery({
    queryKey: ["admin-boards"],
    queryFn: () => contentApi.boards().then((r) => r.data as HierarchyNode[]),
  });

  const { mutate: createBoard, isPending: creatingBoard } = useMutation({
    mutationFn: (vals: Record<string, string>) =>
      adminApi.createBoard({ name: vals.name, code: vals.code }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-boards"] }); setAddingBoard(false); showToast("Board created"); },
  });

  const { mutate: deleteBoard } = useMutation({
    mutationFn: (id: string) => adminApi.deleteBoard(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-boards"] }); showToast("Board deleted"); },
  });

  const { mutate: createClass, isPending: creatingClass } = useMutation({
    mutationFn: ({ boardId, vals }: { boardId: string; vals: Record<string, string> }) =>
      adminApi.createClass(boardId, { number: Number(vals.number), label: vals.label }),
    onSuccess: (_, { boardId }) => {
      qc.invalidateQueries({ queryKey: ["admin-classes", boardId] });
      setAddingClass(null);
      showToast("Class created");
    },
  });

  const { mutate: deleteClass } = useMutation({
    mutationFn: (id: string) => adminApi.deleteClass(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-classes"] }); showToast("Class deleted"); },
  });

  const { mutate: createSubject, isPending: creatingSubject } = useMutation({
    mutationFn: ({ classId, vals }: { classId: string; vals: Record<string, string> }) =>
      adminApi.createSubject(classId, { name: vals.name }),
    onSuccess: (_, { classId }) => {
      qc.invalidateQueries({ queryKey: ["admin-subjects", classId] });
      setAddingSubject(null);
      showToast("Subject created");
    },
  });

  const { mutate: deleteSubject } = useMutation({
    mutationFn: (id: string) => adminApi.deleteSubject(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-subjects"] }); showToast("Subject deleted"); },
  });

  const { mutate: createChapter, isPending: creatingChapter } = useMutation({
    mutationFn: ({ subjectId, vals }: { subjectId: string; vals: Record<string, string> }) =>
      adminApi.createChapter(subjectId, { name: vals.name, order: vals.order ? Number(vals.order) : undefined }),
    onSuccess: (_, { subjectId }) => {
      qc.invalidateQueries({ queryKey: ["admin-chapters", subjectId] });
      setAddingChapter(null);
      showToast("Chapter created");
    },
  });

  const { mutate: deleteChapter } = useMutation({
    mutationFn: (id: string) => adminApi.deleteChapter(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-chapters"] }); showToast("Chapter deleted"); },
  });

  if (boardsLoading) return <div className="flex items-center gap-2 text-gray-500 p-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading boards...</div>;

  return (
    <div className="space-y-2">
      {toast && <Toast message={toast} />}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Boards</h3>
        <button onClick={() => setAddingBoard(true)} className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
          <Plus className="w-3.5 h-3.5" /> Add Board
        </button>
      </div>

      {addingBoard && (
        <AddInlineForm
          fields={[{ key: "name", label: "Board Name" }, { key: "code", label: "Code", placeholder: "e.g. CBSE" }]}
          onSubmit={(vals) => createBoard(vals)}
          onCancel={() => setAddingBoard(false)}
          loading={creatingBoard}
        />
      )}

      {(boards as HierarchyNode[]).map((board) => (
        <BoardNode
          key={board.id}
          board={board}
          expanded={!!expandedBoards[board.id]}
          onToggle={() => setExpandedBoards((e) => ({ ...e, [board.id]: !e[board.id] }))}
          onDelete={() => deleteBoard(board.id)}
          addingClass={addingClass}
          setAddingClass={setAddingClass}
          creatingClass={creatingClass}
          onCreateClass={(boardId: any, vals: any) => createClass({ boardId, vals })}
          expandedClasses={expandedClasses}
          setExpandedClasses={setExpandedClasses}
          addingSubject={addingSubject}
          setAddingSubject={setAddingSubject}
          creatingSubject={creatingSubject}
          onCreateSubject={(classId: any, vals: any) => createSubject({ classId, vals })}
          onDeleteClass={deleteClass}
          expandedSubjects={expandedSubjects}
          setExpandedSubjects={setExpandedSubjects}
          addingChapter={addingChapter}
          setAddingChapter={setAddingChapter}
          creatingChapter={creatingChapter}
          onCreateChapter={(subjectId: any, vals: any) => createChapter({ subjectId, vals })}
          onDeleteSubject={deleteSubject}
          onDeleteChapter={deleteChapter}
          showToast={showToast}
        />
      ))}
    </div>
  );
}

function BoardNode({
  board, expanded, onToggle, onDelete,
  addingClass, setAddingClass, creatingClass, onCreateClass,
  expandedClasses, setExpandedClasses,
  addingSubject, setAddingSubject, creatingSubject, onCreateSubject, onDeleteClass,
  expandedSubjects, setExpandedSubjects,
  addingChapter, setAddingChapter, creatingChapter, onCreateChapter,
  onDeleteSubject, onDeleteChapter,
}: any) {
  const { data: classes = [] } = useQuery({
    queryKey: ["admin-classes", board.id],
    queryFn: () => contentApi.classes(board.id).then((r) => r.data as HierarchyNode[]),
    enabled: expanded,
  });

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
        <button onClick={onToggle} className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 text-left">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {board.name} <span className="text-xs text-gray-400 font-normal">({board.code})</span>
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => setAddingClass(board.id)} className="p-1 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 py-2 space-y-1">
          {addingClass === board.id && (
            <AddInlineForm
              fields={[{ key: "number", label: "Class No.", type: "number" }, { key: "label", label: "Label", placeholder: "e.g. Class 10" }]}
              onSubmit={(vals) => onCreateClass(board.id, vals)}
              onCancel={() => setAddingClass(null)}
              loading={creatingClass}
            />
          )}
          {(classes as HierarchyNode[]).map((cls: any) => (
            <ClassNode
              key={cls.id}
              cls={cls}
              expanded={!!expandedClasses[cls.id]}
              onToggle={() => setExpandedClasses((e: any) => ({ ...e, [cls.id]: !e[cls.id] }))}
              onDelete={() => onDeleteClass(cls.id)}
              addingSubject={addingSubject}
              setAddingSubject={setAddingSubject}
              creatingSubject={creatingSubject}
              onCreateSubject={onCreateSubject}
              expandedSubjects={expandedSubjects}
              setExpandedSubjects={setExpandedSubjects}
              addingChapter={addingChapter}
              setAddingChapter={setAddingChapter}
              creatingChapter={creatingChapter}
              onCreateChapter={onCreateChapter}
              onDeleteSubject={onDeleteSubject}
              onDeleteChapter={onDeleteChapter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClassNode({
  cls, expanded, onToggle, onDelete,
  addingSubject, setAddingSubject, creatingSubject, onCreateSubject,
  expandedSubjects, setExpandedSubjects,
  addingChapter, setAddingChapter, creatingChapter, onCreateChapter,
  onDeleteSubject, onDeleteChapter,
}: any) {
  const { data: subjects = [] } = useQuery({
    queryKey: ["admin-subjects", cls.id],
    queryFn: () => contentApi.subjects(cls.id).then((r) => r.data as HierarchyNode[]),
    enabled: expanded,
  });

  return (
    <div className="ml-4 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
      <div className="flex items-center justify-between py-1.5">
        <button onClick={onToggle} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 flex-1 text-left">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Class {cls.number} {cls.label ? `— ${cls.label}` : ""}
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => setAddingSubject(cls.id)} className="p-1 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded">
            <Plus className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-1">
          {addingSubject === cls.id && (
            <AddInlineForm
              fields={[{ key: "name", label: "Subject Name" }]}
              onSubmit={(vals) => onCreateSubject(cls.id, vals)}
              onCancel={() => setAddingSubject(null)}
              loading={creatingSubject}
            />
          )}
          {(subjects as HierarchyNode[]).map((sub: any) => (
            <SubjectNode
              key={sub.id}
              sub={sub}
              expanded={!!expandedSubjects[sub.id]}
              onToggle={() => setExpandedSubjects((e: any) => ({ ...e, [sub.id]: !e[sub.id] }))}
              onDelete={() => onDeleteSubject(sub.id)}
              addingChapter={addingChapter}
              setAddingChapter={setAddingChapter}
              creatingChapter={creatingChapter}
              onCreateChapter={onCreateChapter}
              onDeleteChapter={onDeleteChapter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubjectNode({ sub, expanded, onToggle, onDelete, addingChapter, setAddingChapter, creatingChapter, onCreateChapter, onDeleteChapter }: any) {
  const { data: chapters = [] } = useQuery({
    queryKey: ["admin-chapters", sub.id],
    queryFn: () => contentApi.chapters(sub.id).then((r) => r.data as HierarchyNode[]),
    enabled: expanded,
  });

  return (
    <div className="ml-4 border-l-2 border-primary-100 dark:border-primary-900/40 pl-3">
      <div className="flex items-center justify-between py-1">
        <button onClick={onToggle} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 flex-1 text-left">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {sub.name}
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => setAddingChapter(sub.id)} className="p-0.5 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded">
            <Plus className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="p-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="ml-3 space-y-0.5">
          {addingChapter === sub.id && (
            <AddInlineForm
              fields={[{ key: "name", label: "Chapter Name" }, { key: "order", label: "Order", type: "number" }]}
              onSubmit={(vals) => onCreateChapter(sub.id, vals)}
              onCancel={() => setAddingChapter(null)}
              loading={creatingChapter}
            />
          )}
          {(chapters as HierarchyNode[]).map((ch: any) => (
            <div key={ch.id} className="flex items-center justify-between py-0.5 text-xs text-gray-500 dark:text-gray-500">
              <span className="flex items-center gap-1.5"><BookOpen className="w-3 h-3" />{ch.name}</span>
              <button onClick={() => onDeleteChapter(ch.id)} className="p-0.5 text-red-400 hover:text-red-600 rounded">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Previous Year Papers ─────────────────────────────────────────────

interface PypItem {
  id: string; board: string; class_num: number; subject: string;
  year: number; exam_type: string; title: string; file_url: string; difficulty: string;
}

function emptyPyp(): Omit<PypItem, "id"> {
  return { board: "", class_num: 10, subject: "", year: new Date().getFullYear(), exam_type: "", title: "", file_url: "", difficulty: "medium" };
}

function PypForm({
  initial,
  onSubmit,
  onCancel,
  loading,
  error,
}: {
  initial: Omit<PypItem, "id">;
  onSubmit: (data: Omit<PypItem, "id">) => void;
  onCancel: () => void;
  loading: boolean;
  error: string;
}) {
  const [form, setForm] = useState(initial);
  const set = (key: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [key]: key === "class_num" || key === "year" ? Number(v) : v }));

  return (
    <div className="card p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <InputField label="Board" value={form.board} onChange={set("board")} placeholder="e.g. CBSE" required />
        <InputField label="Class Number" value={form.class_num} onChange={set("class_num")} type="number" required />
        <InputField label="Subject" value={form.subject} onChange={set("subject")} required />
        <InputField label="Year" value={form.year} onChange={set("year")} type="number" required />
        <SelectField label="Exam Type" value={form.exam_type} onChange={set("exam_type")} options={EXAM_TYPE_OPTIONS} required />
        <SelectField label="Difficulty" value={form.difficulty} onChange={set("difficulty")} options={DIFFICULTY_OPTIONS} />
        <div className="sm:col-span-2 lg:col-span-3">
          <InputField label="Title" value={form.title} onChange={set("title")} placeholder="Paper title" required />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <InputField label="File URL" value={form.file_url} onChange={set("file_url")} placeholder="https://..." />
        </div>
      </div>
      {error && <ErrorMsg message={error} />}
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit(form)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save Paper
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">
          Cancel
        </button>
      </div>
    </div>
  );
}

function PreviousYearPapersTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<PypItem | null>(null);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const { data: pyps = [], isLoading } = useQuery({
    queryKey: ["admin-pyps"],
    queryFn: () => adminApi.getPyps({ limit: 100 }).then((r) => r.data as PypItem[]),
  });

  const { mutate: createPyp, isPending: creating } = useMutation({
    mutationFn: (data: object) => adminApi.createPyp(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pyps"] });
      setShowForm(false); setFormError(""); showToast("Paper created successfully");
    },
    onError: (e: any) => setFormError(e?.response?.data?.detail ?? "Failed to create paper"),
  });

  const { mutate: updatePyp, isPending: updating } = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => adminApi.updatePyp(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pyps"] });
      setEditItem(null); setFormError(""); showToast("Paper updated successfully");
    },
    onError: (e: any) => setFormError(e?.response?.data?.detail ?? "Failed to update paper"),
  });

  const { mutate: deletePyp } = useMutation({
    mutationFn: (id: string) => adminApi.deletePyp(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-pyps"] }); showToast("Paper deleted"); },
  });

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast} />}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Previous Year Papers</h3>
        {!showForm && !editItem && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium rounded-xl">
            <Plus className="w-3.5 h-3.5" /> Add New
          </button>
        )}
      </div>

      {showForm && (
        <PypForm
          initial={emptyPyp()}
          onSubmit={(data) => createPyp(data)}
          onCancel={() => { setShowForm(false); setFormError(""); }}
          loading={creating}
          error={formError}
        />
      )}

      {editItem && (
        <PypForm
          initial={{ board: editItem.board, class_num: editItem.class_num, subject: editItem.subject, year: editItem.year, exam_type: editItem.exam_type, title: editItem.title, file_url: editItem.file_url, difficulty: editItem.difficulty }}
          onSubmit={(data) => updatePyp({ id: editItem.id, data })}
          onCancel={() => { setEditItem(null); setFormError(""); }}
          loading={updating}
          error={formError}
        />
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 p-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading papers...</div>
      ) : (pyps as PypItem[]).length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">No papers yet. Add one above.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {["Title", "Board", "Class", "Subject", "Year", "Exam Type", "Difficulty", "Actions"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(pyps as PypItem[]).map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-gray-200 max-w-[180px] truncate">{p.title}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{p.board}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{p.class_num}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{p.subject}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{p.year}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 capitalize">{p.exam_type.replace("_", " ")}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${p.difficulty === "easy" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : p.difficulty === "hard" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"}`}>
                      {p.difficulty}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditItem(p); setShowForm(false); setFormError(""); }} className="p-1 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deletePyp(p.id)} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Knowledge Hub ─────────────────────────────────────────────────────

interface HubCategory { id: string; name: string; description?: string; }
interface HubArticle {
  id: string; category_id: string; category?: string;
  title: string; description: string; duration_min: number; is_trending: boolean;
  content: string; cover_image_url: string; author: string; is_published: boolean;
  content_type: "article" | "video"; video_url: string; external_url: string;
}

function emptyArticle(): Omit<HubArticle, "id"> {
  return {
    category_id: "", category: "", title: "", description: "", duration_min: 5, is_trending: false,
    content: "", cover_image_url: "", author: "", is_published: true,
    content_type: "article", video_url: "", external_url: "",
  };
}

function HubCategoriesSubtab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["admin-hub-categories"],
    queryFn: () => adminApi.getHubCategories().then((r) => r.data as HubCategory[]),
  });

  const { mutate: createCat, isPending: creating } = useMutation({
    mutationFn: () => adminApi.createHubCategory({ name, description: desc }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-hub-categories"] });
      setShowForm(false); setName(""); setDesc(""); setError(""); showToast("Category created");
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Failed to create"),
  });

  const { mutate: deleteCat } = useMutation({
    mutationFn: (id: string) => adminApi.deleteHubCategory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-hub-categories"] }); showToast("Category deleted"); },
  });

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast} />}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Categories</h4>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium rounded-xl">
            <Plus className="w-3.5 h-3.5" /> Add Category
          </button>
        )}
      </div>

      {showForm && (
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InputField label="Category Name" value={name} onChange={setName} required />
            <InputField label="Description" value={desc} onChange={setDesc} />
          </div>
          {error && <ErrorMsg message={error} />}
          <div className="flex gap-2">
            <button onClick={() => createCat()} disabled={creating || !name} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl disabled:opacity-50">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
            </button>
            <button onClick={() => { setShowForm(false); setError(""); }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 p-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : (categories as HubCategory[]).length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">No categories yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {["Name", "Description", "Actions"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(categories as HubCategory[]).map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-gray-200">{c.name}</td>
                  <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 max-w-[300px] truncate">{c.description ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => deleteCat(c.id)} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ArticleForm({
  initial, categories, onSubmit, onCancel, loading, error,
}: {
  initial: Omit<HubArticle, "id">;
  categories: HubCategory[];
  onSubmit: (data: Omit<HubArticle, "id">) => void;
  onCancel: () => void;
  loading: boolean;
  error: string;
}) {
  const [form, setForm] = useState(initial);
  const setStr = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const setNum = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: Number(v) }));
  const isVideo = form.content_type === "video";

  const submit = () => {
    // Strip the empty-string link field for whichever type isn't selected
    // so a stale value from a prior edit doesn't get saved as content_type
    // flips back and forth in this form.
    const { category, ...rest } = form;
    onSubmit({
      ...rest,
      video_url: isVideo ? form.video_url : "",
      external_url: isVideo ? form.external_url : "",
    } as Omit<HubArticle, "id">);
  };

  return (
    <div className="card p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SelectField
          label="Category"
          value={form.category_id}
          onChange={setStr("category_id")}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          required
        />
        <InputField label="Title" value={form.title} onChange={setStr("title")} required />

        <SelectField
          label="Type"
          value={form.content_type}
          onChange={(v) => setForm((f) => ({ ...f, content_type: v as "article" | "video" }))}
          options={[{ value: "article", label: "Article" }, { value: "video", label: "Video" }]}
          required
        />
        <InputField label="Duration (min)" value={form.duration_min} onChange={setNum("duration_min")} type="number" />

        <InputField label="Author" value={form.author} onChange={setStr("author")} placeholder="e.g. Science Desk" />
        <InputField label="Cover Image URL" value={form.cover_image_url} onChange={setStr("cover_image_url")} placeholder="https://..." />

        {isVideo && (
          <>
            <InputField label="Video URL (YouTube etc.)" value={form.video_url} onChange={setStr("video_url")} placeholder="https://youtube.com/watch?v=..." />
            <InputField label="External URL (optional link fallback)" value={form.external_url} onChange={setStr("external_url")} placeholder="https://..." />
          </>
        )}

        <div className="flex items-center gap-4 pt-5">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_trending}
              onChange={(e) => setForm((f) => ({ ...f, is_trending: e.target.checked }))}
              className="rounded"
            />
            Is Trending
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
              className="rounded"
            />
            Published
          </label>
        </div>

        {form.cover_image_url && (
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Cover Preview</label>
            <img
              src={form.cover_image_url}
              alt=""
              className="w-full max-w-xs aspect-video object-cover rounded-xl border border-gray-200 dark:border-gray-700"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            placeholder="A one-line summary shown on the article card"
            className="w-full text-sm bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-100 resize-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
            {isVideo ? "Video Description / Notes" : "Content"}
          </label>
          <textarea
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            rows={6}
            placeholder={isVideo ? "What the video covers..." : "Full article body..."}
            className="w-full text-sm bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-100 resize-none"
          />
        </div>
      </div>
      {error && <ErrorMsg message={error} />}
      <div className="flex gap-2">
        <button onClick={submit} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save Article
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">Cancel</button>
      </div>
    </div>
  );
}

function HubArticlesSubtab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<HubArticle | null>(null);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-hub-categories"],
    queryFn: () => adminApi.getHubCategories().then((r) => r.data as HubCategory[]),
  });

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["admin-hub-articles"],
    queryFn: () => adminApi.getHubArticles({ limit: 100 }).then((r) => r.data as HubArticle[]),
  });

  const { mutate: createArticle, isPending: creating } = useMutation({
    mutationFn: (data: object) => adminApi.createHubArticle(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-hub-articles"] });
      setShowForm(false); setFormError(""); showToast("Article created");
    },
    onError: (e: any) => setFormError(e?.response?.data?.detail ?? "Failed to create article"),
  });

  const { mutate: updateArticle, isPending: updating } = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => adminApi.updateHubArticle(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-hub-articles"] });
      setEditItem(null); setFormError(""); showToast("Article updated");
    },
    onError: (e: any) => setFormError(e?.response?.data?.detail ?? "Failed to update article"),
  });

  const { mutate: deleteArticle } = useMutation({
    mutationFn: (id: string) => adminApi.deleteHubArticle(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-hub-articles"] }); showToast("Article deleted"); },
  });

  const catName = (id: string) => (categories as HubCategory[]).find((c) => c.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast} />}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Articles</h4>
        {!showForm && !editItem && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium rounded-xl">
            <Plus className="w-3.5 h-3.5" /> Add Article
          </button>
        )}
      </div>

      {showForm && (
        <ArticleForm
          initial={emptyArticle()}
          categories={categories as HubCategory[]}
          onSubmit={(data) => createArticle(data)}
          onCancel={() => { setShowForm(false); setFormError(""); }}
          loading={creating}
          error={formError}
        />
      )}

      {editItem && (
        <ArticleForm
          initial={{
            category_id: editItem.category_id, category: editItem.category,
            title: editItem.title, description: editItem.description,
            duration_min: editItem.duration_min, is_trending: editItem.is_trending,
            content: editItem.content ?? "", cover_image_url: editItem.cover_image_url ?? "",
            author: editItem.author ?? "", is_published: editItem.is_published ?? true,
            content_type: editItem.content_type ?? "article",
            video_url: editItem.video_url ?? "", external_url: editItem.external_url ?? "",
          }}
          categories={categories as HubCategory[]}
          onSubmit={(data) => updateArticle({ id: editItem.id, data })}
          onCancel={() => { setEditItem(null); setFormError(""); }}
          loading={updating}
          error={formError}
        />
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 p-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading articles...</div>
      ) : (articles as HubArticle[]).length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">No articles yet. Add one above.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {["Cover", "Title", "Type", "Category", "Duration", "Trending", "Actions"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(articles as HubArticle[]).map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2.5">
                    {a.cover_image_url ? (
                      <img src={a.cover_image_url} alt="" className="w-12 h-8 object-cover rounded-lg" />
                    ) : (
                      <div className="w-12 h-8 rounded-lg bg-gray-100 dark:bg-gray-800" />
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-gray-200 max-w-[200px] truncate">{a.title}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${a.content_type === "video" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>
                      {a.content_type === "video" ? "Video" : "Article"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{a.category ?? catName(a.category_id)}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{a.duration_min} min</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${a.is_trending ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"}`}>
                      {a.is_trending ? "Trending" : "Normal"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditItem(a); setShowForm(false); setFormError(""); }} className="p-1 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteArticle(a.id)} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KnowledgeHubTab() {
  const [subTab, setSubTab] = useState<"categories" | "articles">("categories");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
        {(["categories", "articles"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${subTab === t ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {subTab === "categories" ? <HubCategoriesSubtab /> : <HubArticlesSubtab />}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminContentPanel() {
  const [activeTab, setActiveTab] = useState<AdminContentTabId>("hierarchy");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Content Management</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage boards, classes, subjects, chapters, papers, and knowledge hub content.
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {ADMIN_CONTENT_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === id
                ? "border-primary-600 text-primary-700 dark:text-primary-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "hierarchy" && <BoardTree />}
        {activeTab === "pyps" && <PreviousYearPapersTab />}
        {activeTab === "hub" && <KnowledgeHubTab />}
      </div>
    </div>
  );
}
