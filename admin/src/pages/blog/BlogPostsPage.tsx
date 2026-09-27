import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { infoPageApi } from "@/lib/api";
import {
  Plus, Pencil, Trash2, X, Check, Loader2,
  BookOpen, Eye, EyeOff, Calendar, Clock,
} from "lucide-react";

const BLOG_PREFIX = "blog-";

interface PostData {
  slug: string;
  category: string;
  tags: string[];
  author: string;
  date: string;
  readTime: number;
  coverColor: string;
  excerpt: string;
  sections: { heading?: string; body?: string; list?: string[] }[];
}

interface InfoPage {
  slug: string;
  title: string;
  content: string;
  data: PostData | null;
  is_published: boolean;
  updated_at: string | null;
}

const COVER_COLORS = [
  { label: "Indigo→Purple", value: "from-indigo-600 to-purple-700" },
  { label: "Blue→Indigo",   value: "from-blue-600 to-indigo-700"  },
  { label: "Emerald→Teal",  value: "from-emerald-600 to-teal-700" },
  { label: "Violet→Purple", value: "from-violet-600 to-purple-700" },
  { label: "Rose→Pink",     value: "from-rose-600 to-pink-700"    },
  { label: "Orange→Red",    value: "from-orange-500 to-red-600"   },
];

const CATEGORIES = ["CBSE Tips", "Study Strategy", "AI Learning", "Exam Prep", "Motivation"];

const inputCls = "input";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function toInfoSlug(postSlug: string) {
  return `${BLOG_PREFIX}${postSlug.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;
}

// ── Modal ───────────────────────────────────────────────────────────────────────
function PostModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: InfoPage;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!existing;
  const d = existing?.data;

  const [title,     setTitle]     = useState(existing?.title ?? "");
  const [postSlug,  setPostSlug]  = useState(d?.slug ?? "");
  const [excerpt,   setExcerpt]   = useState(d?.excerpt ?? "");
  const [category,  setCategory]  = useState(d?.category ?? CATEGORIES[0]);
  const [author,    setAuthor]    = useState(d?.author ?? "Team EduLearn");
  const [date,      setDate]      = useState(d?.date ?? new Date().toISOString().slice(0, 10));
  const [readTime,  setReadTime]  = useState<number>(d?.readTime ?? 5);
  const [color,     setColor]     = useState(d?.coverColor ?? COVER_COLORS[0].value);
  const [tags,      setTags]      = useState<string>((d?.tags ?? []).join(", "));
  const [published, setPublished] = useState(existing?.is_published ?? true);
  const [sections,  setSections]  = useState<{ heading: string; body: string; list: string }[]>(
    (d?.sections ?? [{ heading: "", body: "", list: "" }]).map(s => ({
      heading: s.heading ?? "",
      body:    s.body    ?? "",
      list:    Array.isArray(s.list) ? s.list.join("\n") : (s.list ?? ""),
    }))
  );

  const save = useMutation({
    mutationFn: () => {
      const slug = isEdit ? existing!.slug : toInfoSlug(postSlug || title);
      const postData: PostData = {
        slug: postSlug || slug.replace(BLOG_PREFIX, ""),
        category,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
        author,
        date,
        readTime: Number(readTime),
        coverColor: color,
        excerpt,
        sections: sections.map(s => ({
          heading: s.heading || undefined,
          body:    s.body    || undefined,
          list:    s.list ? s.list.split("\n").filter(Boolean) : undefined,
        })).filter(s => s.heading || s.body || s.list?.length),
      };
      return infoPageApi.upsert(slug, {
        title: title.trim(),
        content: excerpt,
        data: postData,
        is_published: published,
      });
    },
    onSuccess: () => { toast.success(isEdit ? "Post updated" : "Post created"); onSaved(); },
    onError:   () => toast.error("Failed to save"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl my-8 shadow-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 rounded-t-2xl z-10">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">{isEdit ? "Edit blog post" : "New blog post"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Title *">
              <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="How to Score 95% in CBSE Board Exams" />
            </Field>
            <Field label={isEdit ? "Slug (fixed)" : "Post slug (URL)"}>
              <input value={isEdit ? existing!.slug.replace(BLOG_PREFIX, "") : postSlug}
                onChange={e => !isEdit && setPostSlug(e.target.value)}
                readOnly={isEdit}
                className={inputCls + (isEdit ? " bg-gray-50 dark:bg-gray-900/40 text-gray-400 dark:text-gray-500" : "")}
                placeholder="how-to-score-95-cbse" />
            </Field>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Category">
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Author">
              <input value={author} onChange={e => setAuthor(e.target.value)} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date">
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Read time (min)">
                <input type="number" min={1} max={60} value={readTime} onChange={e => setReadTime(Number(e.target.value))} className={inputCls} />
              </Field>
            </div>
          </div>

          <Field label="Tags (comma-separated)">
            <input value={tags} onChange={e => setTags(e.target.value)} className={inputCls} placeholder="CBSE, Board Exams, Study Tips" />
          </Field>

          <Field label="Cover color">
            <div className="flex flex-wrap gap-2">
              {COVER_COLORS.map(c => (
                <button key={c.value} type="button" onClick={() => setColor(c.value)}
                  className={`h-8 w-28 rounded-lg bg-gradient-to-r ${c.value} text-white text-[10px] font-semibold border-2 transition-all ${color === c.value ? "border-gray-900 dark:border-gray-100 scale-105" : "border-transparent"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Excerpt (meta description)">
            <textarea value={excerpt} onChange={e => setExcerpt(e.target.value)} rows={2}
              className={inputCls + " resize-y"} placeholder="A short summary shown in blog cards and Google search results." />
          </Field>

          {/* Sections */}
          <div>
            <label className="label">Sections</label>
            <div className="space-y-3">
              {sections.map((s, i) => (
                <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">Section {i + 1}</span>
                    {sections.length > 1 && (
                      <button type="button" onClick={() => setSections(sections.filter((_, j) => j !== i))}
                        className="text-danger-500 hover:text-danger-700 dark:text-danger-400 dark:hover:text-danger-300"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                  <input value={s.heading} onChange={e => setSections(sections.map((x, j) => j === i ? { ...x, heading: e.target.value } : x))}
                    className={inputCls} placeholder="Section heading (optional)" />
                  <textarea value={s.body} onChange={e => setSections(sections.map((x, j) => j === i ? { ...x, body: e.target.value } : x))}
                    rows={3} className={inputCls + " resize-y"} placeholder="Body text (optional)" />
                  <textarea value={s.list} onChange={e => setSections(sections.map((x, j) => j === i ? { ...x, list: e.target.value } : x))}
                    rows={3} className={inputCls + " resize-y font-mono text-xs"}
                    placeholder={"Bullet points, one per line (optional)\nPoint 1\nPoint 2"} />
                </div>
              ))}
              <button type="button" onClick={() => setSections([...sections, { heading: "", body: "", list: "" }])}
                className="inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 font-medium hover:text-primary-700 dark:hover:text-primary-300">
                <Plus className="w-4 h-4" /> Add section
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} className="checkbox" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Published (visible on /blog)</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending || !title.trim()}
            className="btn-primary">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────────
export default function BlogPostsPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<"new" | InfoPage | null>(null);

  const { data: allPages = [], isLoading } = useQuery<InfoPage[]>({
    queryKey: ["info-pages-all"],
    queryFn: () => infoPageApi.list().then(r => r.data),
  });

  const blogPosts = allPages.filter(p => p.slug.startsWith(BLOG_PREFIX));

  const del = useMutation({
    mutationFn: (slug: string) => infoPageApi.remove(slug),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["info-pages-all"] }); },
    onError: () => toast.error("Failed to delete"),
  });

  const togglePublish = useMutation({
    mutationFn: (post: InfoPage) =>
      infoPageApi.upsert(post.slug, { title: post.title, content: post.content ?? "", data: post.data, is_published: !post.is_published }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["info-pages-all"] }),
    onError: () => toast.error("Failed to update"),
  });

  const onSaved = () => { qc.invalidateQueries({ queryKey: ["info-pages-all"] }); setModal(null); };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Blog Posts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create and manage blog posts that appear on the public /blog page.</p>
        </div>
        <button onClick={() => setModal("new")} className="btn-primary self-start sm:self-auto">
          <Plus className="w-4 h-4" /> New post
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : blogPosts.length === 0 ? (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No blog posts yet</p>
          <p className="text-sm mt-1">Click "New post" to create your first article.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {blogPosts.map(post => {
            const d = post.data as PostData | null;
            return (
              <div key={post.slug} className="card p-4 flex items-start gap-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${d?.coverColor ?? "from-indigo-600 to-purple-700"} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{post.title}</p>
                    <span className={`badge flex-shrink-0 ${post.is_published ? "badge-success" : "badge-gray"}`}>
                      {post.is_published ? "Published" : "Draft"}
                    </span>
                    {d?.category && (
                      <span className="badge badge-primary flex-shrink-0">{d.category}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate mb-1">{d?.excerpt}</p>
                  <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500">
                    {d?.date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{d.date}</span>}
                    {d?.readTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{d.readTime} min</span>}
                    <span className="text-gray-300 dark:text-gray-600">/blog/{d?.slug ?? post.slug.replace(BLOG_PREFIX, "")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => togglePublish.mutate(post)} title={post.is_published ? "Unpublish" : "Publish"}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700">
                    {post.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setModal(post)}
                    className="p-1.5 rounded-lg text-primary-500 hover:text-primary-700 hover:bg-primary-50 dark:text-primary-400 dark:hover:text-primary-300 dark:hover:bg-primary-900/30">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if (confirm(`Delete "${post.title}"?`)) del.mutate(post.slug); }}
                    className="p-1.5 rounded-lg text-danger-400 hover:text-danger-600 hover:bg-danger-50 dark:text-danger-400 dark:hover:text-danger-300 dark:hover:bg-danger-900/30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <PostModal
          existing={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
