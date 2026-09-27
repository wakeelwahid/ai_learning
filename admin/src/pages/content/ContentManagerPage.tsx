import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { contentApi, pypApi, knowledgeHubApi } from "@/lib/api";
import {
  FileArchive, BookMarked, Database,
  Plus, Pencil, Trash2, Loader, X, AlertTriangle,
  Flame, RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Shared micro-components ──────────────────────────────────────────────────

function TabBar({ tabs, active, onChange }: {
  tabs: { key: string; label: string; icon: React.ElementType }[];
  active: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
            active === key
              ? "border-primary-600 text-primary-700 bg-primary-50 dark:border-primary-400 dark:text-primary-300 dark:bg-primary-900/20"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

function ModalShell({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-md w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="py-16 text-center flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
      <Icon className="w-10 h-10 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500">
      <Loader className="w-5 h-5 animate-spin mr-2" /> Loading…
    </div>
  );
}

// ─── Tab 1: Previous Year Papers ──────────────────────────────────────────────

type PYPForm = {
  board: string;
  class_num: string;
  subject: string;
  year: string;
  exam_type: string;
  title: string;
  description: string;
  difficulty: string;
  file_url: string;
};

function PYPTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<any | null>(null);
  const [delTarget, setDelTarget] = useState<any | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pyp-list"],
    queryFn: () => pypApi.list({ limit: 100 }).then(r => r.data),
  });

  const papers: any[] = data?.papers ?? data ?? [];

  const { register, handleSubmit, reset, setValue } = useForm<PYPForm>({
    defaultValues: { difficulty: "medium", exam_type: "annual" },
  });

  function openAdd() {
    reset({ difficulty: "medium", exam_type: "annual" });
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(p: any) {
    setEditing(p);
    setValue("board",       p.board       ?? "");
    setValue("class_num",   String(p.class_num ?? ""));
    setValue("subject",     p.subject     ?? "");
    setValue("year",        String(p.year ?? ""));
    setValue("exam_type",   p.exam_type   ?? "annual");
    setValue("title",       p.title       ?? "");
    setValue("description", p.description ?? "");
    setValue("difficulty",  p.difficulty  ?? "medium");
    setValue("file_url",    p.file_url    ?? "");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  const createMut = useMutation({
    mutationFn: (d: PYPForm) => pypApi.create({ ...d, class_num: Number(d.class_num), year: Number(d.year) }),
    onSuccess: () => { toast.success("Paper added"); qc.invalidateQueries({ queryKey: ["pyp-list"] }); closeForm(); },
    onError:   () => toast.error("Failed to save paper"),
  });

  const updateMut = useMutation({
    mutationFn: (d: PYPForm) => pypApi.update(editing.id, { ...d, class_num: Number(d.class_num), year: Number(d.year) }),
    onSuccess: () => { toast.success("Paper updated"); qc.invalidateQueries({ queryKey: ["pyp-list"] }); closeForm(); },
    onError:   () => toast.error("Failed to update paper"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => pypApi.delete(id),
    onSuccess: () => { toast.success("Paper deleted"); qc.invalidateQueries({ queryKey: ["pyp-list"] }); setDelTarget(null); },
    onError:   () => toast.error("Failed to delete"),
  });

  const onSubmit = (d: PYPForm) => editing ? updateMut.mutate(d) : createMut.mutate(d);
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500 dark:text-gray-400">{papers.length} paper(s) found</p>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary btn-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={openAdd} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" /> Add Paper
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? <LoadingRow /> : papers.length === 0 ? (
          <EmptyState icon={FileArchive} text="No papers yet. Click 'Add Paper' to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  {["Board", "Class", "Subject", "Year", "Title", "Difficulty", "Actions"].map(h => (
                    <th key={h} className="table-th whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {papers.map((p: any) => (
                  <tr key={p.id} className="table-row-hover">
                    <td className="table-td font-medium text-gray-800 dark:text-gray-200">{p.board}</td>
                    <td className="table-td">{p.class_num}</td>
                    <td className="table-td">{p.subject}</td>
                    <td className="table-td">{p.year}</td>
                    <td className="table-td text-gray-700 dark:text-gray-300 max-w-xs truncate">{p.title}</td>
                    <td className="table-td">
                      <span className={`badge ${
                        p.difficulty === "easy"   ? "badge-success"
                        : p.difficulty === "hard" ? "badge-danger"
                        : "badge-warning"
                      }`}>{p.difficulty}</span>
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(p)} className="btn-secondary btn-sm">
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button onClick={() => setDelTarget(p)} className="btn-danger btn-sm">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
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

      {/* Add / Edit Form Modal */}
      {showForm && (
        <ModalShell title={editing ? "Edit Paper" : "Add Paper"} onClose={closeForm}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Board *</label>
                <input className="input w-full" {...register("board", { required: true })} placeholder="CBSE" />
              </div>
              <div>
                <label className="label">Class *</label>
                <input type="number" className="input w-full" {...register("class_num", { required: true })} placeholder="10" min={1} max={12} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Subject *</label>
                <input className="input w-full" {...register("subject", { required: true })} placeholder="Mathematics" />
              </div>
              <div>
                <label className="label">Year *</label>
                <input type="number" className="input w-full" {...register("year", { required: true })} placeholder="2024" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Exam Type</label>
                <select className="input w-full" {...register("exam_type")}>
                  <option value="annual">Annual</option>
                  <option value="midterm">Midterm</option>
                  <option value="sample">Sample</option>
                  <option value="compartment">Compartment</option>
                  <option value="supplementary">Supplementary</option>
                </select>
              </div>
              <div>
                <label className="label">Difficulty</label>
                <select className="input w-full" {...register("difficulty")}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Title *</label>
              <input className="input w-full" {...register("title", { required: true })} placeholder="CBSE Class 10 Math Annual 2024" />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input w-full min-h-[70px]" {...register("description")} placeholder="Short description…" />
            </div>
            <div>
              <label className="label">File URL</label>
              <input className="input w-full" {...register("file_url")} placeholder="https://…" />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary" disabled={isPending}>
                {isPending ? <><Loader className="w-3.5 h-3.5 animate-spin inline mr-1" />{editing ? "Saving…" : "Adding…"}</> : editing ? "Save Changes" : "Add Paper"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Delete Confirmation */}
      {delTarget && (
        <ModalShell title="Confirm Delete" onClose={() => setDelTarget(null)}>
          <div className="flex gap-3 items-start mb-5">
            <AlertTriangle className="w-5 h-5 text-danger-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Delete <strong>{delTarget.title}</strong>? This cannot be undone.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDelTarget(null)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => deleteMut.mutate(delTarget.id)}
              disabled={deleteMut.isPending}
              className="btn-danger"
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// ─── Tab 2: Knowledge Hub ─────────────────────────────────────────────────────

function KnowledgeHubTab() {
  const [subTab, setSubTab] = useState<"categories" | "articles">("categories");

  return (
    <div>
      <div className="flex gap-2 mb-5">
        {(["categories", "articles"] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
              subTab === t
                ? "bg-primary-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {subTab === "categories" ? <CategoriesSubTab /> : <ArticlesSubTab />}
    </div>
  );
}

// ── 2a. Categories ─────────────────────────────────────────────────────────────

type CatForm = { name: string; icon: string; sequence: string };

function CategoriesSubTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<any | null>(null);
  const [delTarget, setDelTarget] = useState<any | null>(null);

  const { data: categories = [], isLoading, refetch } = useQuery({
    queryKey: ["hub-categories"],
    queryFn: () => knowledgeHubApi.listCategories().then(r => r.data),
  });

  const { register, handleSubmit, reset, setValue } = useForm<CatForm>({
    defaultValues: { sequence: "1" },
  });

  function openAdd() { reset({ sequence: "1" }); setEditing(null); setShowForm(true); }
  function openEdit(c: any) {
    setEditing(c);
    setValue("name",     c.name     ?? "");
    setValue("icon",     c.icon     ?? "");
    setValue("sequence", String(c.sequence ?? 1));
    setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditing(null); }

  const createMut = useMutation({
    mutationFn: (d: CatForm) => knowledgeHubApi.createCategory({ ...d, sequence: Number(d.sequence) }),
    onSuccess: () => { toast.success("Category created"); qc.invalidateQueries({ queryKey: ["hub-categories"] }); closeForm(); },
    onError:   () => toast.error("Failed"),
  });
  const updateMut = useMutation({
    mutationFn: (d: CatForm) => knowledgeHubApi.updateCategory(editing.id, { ...d, sequence: Number(d.sequence) }),
    onSuccess: () => { toast.success("Category updated"); qc.invalidateQueries({ queryKey: ["hub-categories"] }); closeForm(); },
    onError:   () => toast.error("Failed"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => knowledgeHubApi.deleteCategory(id),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["hub-categories"] }); setDelTarget(null); },
    onError:   () => toast.error("Failed to delete"),
  });

  const onSubmit = (d: CatForm) => editing ? updateMut.mutate(d) : createMut.mutate(d);
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">{(categories as any[]).length} categories</p>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary btn-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={openAdd} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <LoadingRow /> : (categories as any[]).length === 0 ? (
          <EmptyState icon={BookMarked} text="No categories yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  {["Icon", "Name", "Sequence", "Actions"].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {(categories as any[]).map((c: any) => (
                  <tr key={c.id} className="table-row-hover">
                    <td className="table-td text-lg">{c.icon ?? "—"}</td>
                    <td className="table-td font-medium text-gray-800 dark:text-gray-200">{c.name}</td>
                    <td className="table-td">{c.sequence}</td>
                    <td className="table-td">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(c)} className="btn-secondary btn-sm">
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button onClick={() => setDelTarget(c)} className="btn-danger btn-sm">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
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

      {showForm && (
        <ModalShell title={editing ? "Edit Category" : "Add Category"} onClose={closeForm}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Name *</label>
              <input className="input w-full" {...register("name", { required: true })} placeholder="Science & Technology" />
            </div>
            <div>
              <label className="label">Icon (emoji or icon name)</label>
              <input className="input w-full" {...register("icon")} placeholder="🔬" />
            </div>
            <div>
              <label className="label">Sequence</label>
              <input type="number" className="input w-full" {...register("sequence")} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary" disabled={isPending}>
                {isPending ? "Saving…" : editing ? "Save Changes" : "Create"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {delTarget && (
        <ModalShell title="Confirm Delete" onClose={() => setDelTarget(null)}>
          <div className="flex gap-3 items-start mb-5">
            <AlertTriangle className="w-5 h-5 text-danger-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Delete category <strong>{delTarget.name}</strong>? This cannot be undone.</p>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDelTarget(null)} className="btn-secondary">Cancel</button>
            <button onClick={() => deleteMut.mutate(delTarget.id)} disabled={deleteMut.isPending} className="btn-danger">
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// ── 2b. Articles ───────────────────────────────────────────────────────────────

type ArticleForm = {
  title: string;
  category_id: string;
  duration_min: string;
  content: string;
  description: string;
  is_trending: boolean;
  author: string;
  cover_image_url: string;
  content_type: "article" | "video";
  video_url: string;
};

function ArticlesSubTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<any | null>(null);
  const [delTarget, setDelTarget] = useState<any | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["hub-categories"],
    queryFn: () => knowledgeHubApi.listCategories().then(r => r.data),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["hub-articles"],
    queryFn: () => knowledgeHubApi.listArticles({ limit: 100 }).then(r => r.data),
  });

  const articles: any[] = data?.articles ?? data ?? [];

  const { register, handleSubmit, reset, setValue, watch } = useForm<ArticleForm>({
    defaultValues: { is_trending: false, duration_min: "5", content_type: "article" },
  });
  const contentType = watch("content_type");

  function openAdd() { reset({ is_trending: false, duration_min: "5", content_type: "article" }); setEditing(null); setShowForm(true); }
  function openEdit(a: any) {
    setEditing(a);
    setValue("title",       a.title       ?? "");
    setValue("category_id", a.category_id ?? "");
    setValue("duration_min", String(a.duration_min ?? 5));
    setValue("content",     a.content     ?? "");
    setValue("description", a.description ?? "");
    setValue("is_trending", a.is_trending ?? false);
    setValue("author",      a.author      ?? "");
    setValue("cover_image_url", a.cover_image_url ?? "");
    setValue("content_type", a.content_type ?? "article");
    setValue("video_url",   a.video_url   ?? "");
    setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditing(null); }

  // Video articles don't need a separately typed cover — the YouTube link's
  // thumbnail is used automatically (see thumbForArticle below), so only
  // send video_url when it's actually a video to avoid stray stale values.
  function buildPayload(d: ArticleForm) {
    return {
      title: d.title,
      category_id: d.category_id || null,
      duration_min: Number(d.duration_min),
      content: d.content,
      description: d.description,
      is_trending: d.is_trending,
      author: d.author || null,
      cover_image_url: d.cover_image_url || null,
      content_type: d.content_type,
      video_url: d.content_type === "video" ? d.video_url : null,
    };
  }

  const createMut = useMutation({
    mutationFn: (d: ArticleForm) => knowledgeHubApi.createArticle(buildPayload(d)),
    onSuccess: () => { toast.success("Article created"); qc.invalidateQueries({ queryKey: ["hub-articles"] }); closeForm(); },
    onError:   (err: any) => toast.error(err?.response?.data?.detail?.[0]?.msg ?? err?.response?.data?.detail ?? "Failed"),
  });
  const updateMut = useMutation({
    mutationFn: (d: ArticleForm) => knowledgeHubApi.updateArticle(editing.id, buildPayload(d)),
    onSuccess: () => { toast.success("Article updated"); qc.invalidateQueries({ queryKey: ["hub-articles"] }); closeForm(); },
    onError:   (err: any) => toast.error(err?.response?.data?.detail?.[0]?.msg ?? err?.response?.data?.detail ?? "Failed"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => knowledgeHubApi.deleteArticle(id),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["hub-articles"] }); setDelTarget(null); },
    onError:   () => toast.error("Failed to delete"),
  });
  const trendingMut = useMutation({
    mutationFn: ({ id, v }: { id: string; v: boolean }) => knowledgeHubApi.toggleTrending(id, v),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["hub-articles"] }); },
    onError:   () => toast.error("Failed"),
  });

  const onSubmit = (d: ArticleForm) => editing ? updateMut.mutate(d) : createMut.mutate(d);
  const isPending = createMut.isPending || updateMut.isPending;

  const getCatName = (id: string) => (categories as any[]).find((c: any) => c.id === id)?.name ?? id;

  // Auto-derive a thumbnail from the YouTube link when no explicit cover was
  // set, so an admin uploading "just a title + YouTube link" still gets a
  // real thumbnail in the table and on the student-facing card — matching
  // how the curriculum-video feature already builds mqdefault.jpg thumbs.
  function extractYouTubeId(url: string): string | null {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
    return m ? m[1] : null;
  }
  function thumbForArticle(a: any): string | null {
    if (a.cover_image_url) return a.cover_image_url;
    if (a.content_type === "video" && a.video_url) {
      const ytId = extractYouTubeId(a.video_url);
      if (ytId) return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
    }
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">{articles.length} article(s)</p>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary btn-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={openAdd} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" /> Add Article
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <LoadingRow /> : articles.length === 0 ? (
          <EmptyState icon={BookMarked} text="No articles yet. Click 'Add Article' to create one." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  {["Cover", "Title", "Type", "Category", "Duration", "Trending", "Actions"].map(h => (
                    <th key={h} className="table-th whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {articles.map((a: any) => (
                  <tr key={a.id} className="table-row-hover">
                    <td className="table-td">
                      {thumbForArticle(a) ? (
                        <img src={thumbForArticle(a)!} alt="" className="w-14 h-9 object-cover rounded-lg" />
                      ) : (
                        <div className="w-14 h-9 rounded-lg bg-gray-100 dark:bg-gray-800" />
                      )}
                    </td>
                    <td className="table-td font-medium text-gray-800 dark:text-gray-200 max-w-xs truncate">{a.title}</td>
                    <td className="table-td">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.content_type === "video"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      }`}>
                        {a.content_type === "video" ? "Video" : "Article"}
                      </span>
                    </td>
                    <td className="table-td">{getCatName(a.category_id)}</td>
                    <td className="table-td">{a.duration_min} min</td>
                    <td className="table-td">
                      <button
                        onClick={() => trendingMut.mutate({ id: a.id, v: !a.is_trending })}
                        disabled={trendingMut.isPending}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          a.is_trending
                            ? "bg-warning-100 text-warning-700 hover:bg-warning-200 dark:bg-warning-900/40 dark:text-warning-300 dark:hover:bg-warning-900/60"
                            : "bg-gray-100 text-gray-400 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700"
                        }`}
                      >
                        <Flame className="w-3 h-3" />
                        {a.is_trending ? "Trending" : "Off"}
                      </button>
                    </td>
                    <td className="table-td">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(a)} className="btn-secondary btn-sm">
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button onClick={() => setDelTarget(a)} className="btn-danger btn-sm">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
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

      {showForm && (
        <ModalShell title={editing ? "Edit Article" : "Add Article"} onClose={closeForm}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Title *</label>
              <input className="input w-full" {...register("title", { required: true })} placeholder="How Photosynthesis Works" />
            </div>

            {/* Type toggle — decides whether a YouTube link or free-form
                article text is required below. */}
            <div>
              <label className="label">Type</label>
              <div className="flex gap-2">
                {(["article", "video"] as const).map((ct) => (
                  <label
                    key={ct}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium cursor-pointer transition-colors capitalize ${
                      contentType === ct
                        ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                        : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    <input type="radio" value={ct} {...register("content_type")} className="hidden" />
                    {ct}
                  </label>
                ))}
              </div>
            </div>

            {contentType === "video" && (
              <div>
                <label className="label">YouTube Video URL *</label>
                <input
                  className="input w-full"
                  {...register("video_url", { required: contentType === "video" })}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                <p className="text-xs text-gray-400 mt-1">
                  The thumbnail is pulled automatically from the video — no cover image needed.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Category</label>
                <select className="input w-full" {...register("category_id")}>
                  <option value="">— None —</option>
                  {(categories as any[]).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Duration (min)</label>
                <input type="number" className="input w-full" {...register("duration_min")} min={1} />
              </div>
              <div>
                <label className="label">Author</label>
                <input className="input w-full" {...register("author")} placeholder="e.g. Science Desk" />
              </div>
              {contentType === "article" && (
                <div>
                  <label className="label">Cover Image URL</label>
                  <input className="input w-full" {...register("cover_image_url")} placeholder="https://..." />
                </div>
              )}
            </div>
            <div>
              <label className="label">Description *</label>
              <textarea className="input w-full min-h-[70px]" {...register("description", { required: true })} placeholder="Brief overview shown on the card…" />
            </div>
            <div>
              <label className="label">{contentType === "video" ? "Video Notes" : "Content"}</label>
              <textarea
                className="input w-full min-h-[100px]"
                {...register("content")}
                placeholder={contentType === "video" ? "What the video covers…" : "Full article content…"}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" {...register("is_trending")} className="checkbox" />
              Mark as Trending
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary" disabled={isPending}>
                {isPending ? "Saving…" : editing ? "Save Changes" : "Create"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {delTarget && (
        <ModalShell title="Confirm Delete" onClose={() => setDelTarget(null)}>
          <div className="flex gap-3 items-start mb-5">
            <AlertTriangle className="w-5 h-5 text-danger-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Delete article <strong>{delTarget.title}</strong>? This cannot be undone.</p>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDelTarget(null)} className="btn-secondary">Cancel</button>
            <button onClick={() => deleteMut.mutate(delTarget.id)} disabled={deleteMut.isPending} className="btn-danger">
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// ─── Tab 3: Seed Data ─────────────────────────────────────────────────────────

function SeedDataTab() {
  const [result, setResult] = useState<string | null>(null);

  const seedMut = useMutation({
    mutationFn: () => contentApi.seedDemo(),
    onSuccess: (res) => {
      const msg = res.data?.message ?? JSON.stringify(res.data, null, 2);
      setResult(msg);
      toast.success("Seed complete!");
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? "Unknown error";
      setResult("Error: " + msg);
      toast.error("Seed failed");
    },
  });

  return (
    <div className="space-y-5 max-w-xl">
      <div className="card p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Seed Demo Content</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Calls <code className="bg-gray-100 dark:bg-gray-900/60 px-1.5 py-0.5 rounded text-xs">/v1/content/seed-demo</code> to
            populate the database with demo curriculum data (boards, classes, subjects, chapters, etc.).
            Safe to run multiple times — will skip already-existing records.
          </p>
        </div>
        <button
          onClick={() => seedMut.mutate()}
          disabled={seedMut.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-warning-500 hover:bg-warning-600 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {seedMut.isPending
            ? <><Loader className="w-4 h-4 animate-spin" /> Running Seed…</>
            : <><Database className="w-4 h-4" /> Run Seed Demo</>
          }
        </button>

        {result && (
          <div className={`rounded-xl px-4 py-3 text-sm font-mono whitespace-pre-wrap border ${
            result.startsWith("Error")
              ? "bg-danger-50 border-danger-100 text-danger-700 dark:bg-danger-900/20 dark:border-danger-900/40 dark:text-danger-300"
              : "bg-success-50 border-success-100 text-success-700 dark:bg-success-900/20 dark:border-success-900/40 dark:text-success-300"
          }`}>
            {result}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { key: "pyp",           label: "Previous Year Papers", icon: FileArchive },
  { key: "knowledge-hub", label: "Knowledge Hub",        icon: BookMarked  },
  { key: "seed",          label: "Seed Data",            icon: Database    },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function ContentManagerPage() {
  const [tab, setTab] = useState<TabKey>("pyp");

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Content Manager</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
          Manage Previous Year Papers, Knowledge Hub articles, and seed demo data.
        </p>
      </div>

      {/* Tabs */}
      <div className="card p-5">
        <TabBar
          tabs={TABS.map(t => ({ ...t }))}
          active={tab}
          onChange={k => setTab(k as TabKey)}
        />
        {tab === "pyp"           && <PYPTab />}
        {tab === "knowledge-hub" && <KnowledgeHubTab />}
        {tab === "seed"          && <SeedDataTab />}
      </div>
    </div>
  );
}
