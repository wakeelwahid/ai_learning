import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { infoPageApi } from "@/lib/api";
import { FileText, Pencil, Plus, Trash2, X, Check, Loader2 } from "lucide-react";

interface InfoPage {
  slug: string;
  title: string;
  content: string;
  data: any;
  is_published: boolean;
  updated_at: string | null;
}

// Fixed set of CMS pages the platform expects.
const PAGES: { slug: string; label: string; group: string }[] = [
  // Core app CMS
  { slug: "about-us",       label: "About Us",          group: "App Pages" },
  { slug: "contact-us",     label: "Contact Us",         group: "App Pages" },
  { slug: "faq",            label: "FAQ",                group: "App Pages" },
  { slug: "privacy-policy", label: "Privacy Policy",     group: "App Pages" },
  { slug: "terms",          label: "Terms & Conditions", group: "App Pages" },
  { slug: "refund-policy",  label: "Refund Policy",      group: "App Pages" },
  { slug: "footer",         label: "Footer Text",        group: "App Pages" },
  // SEO public marketing pages
  { slug: "about",          label: "About Page (SEO)",   group: "SEO Pages" },
  { slug: "contact",        label: "Contact Page (SEO)", group: "SEO Pages" },
  { slug: "courses",        label: "Courses Page",       group: "SEO Pages" },
  { slug: "features",       label: "Features Page",      group: "SEO Pages" },
  { slug: "pricing",        label: "Pricing Page",       group: "SEO Pages" },
  { slug: "docs",           label: "Documentation",      group: "SEO Pages" },
];

export default function InfoPagesPage() {
  const qc = useQueryClient();
  const { data: pages = [], isLoading } = useQuery<InfoPage[]>({
    queryKey: ["info-pages"],
    queryFn: () => infoPageApi.list().then((r) => r.data),
  });

  const [editing, setEditing] = useState<{ slug: string; label: string } | null>(null);

  const bySlug = (slug: string) => pages.find((p) => p.slug === slug);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Info Pages (CMS)</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Edit the platform's About, Contact, FAQ, Privacy, Terms, Refund and footer content.
          Changes appear instantly on web &amp; mobile.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-8">
          {["App Pages", "SEO Pages"].map(group => (
            <div key={group}>
              <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">{group}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {PAGES.filter(p => p.group === group).map((p) => {
                  const row = bySlug(p.slug);
                  return (
                    <button key={p.slug} onClick={() => setEditing(p)}
                      className="card-hover text-left p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                        </div>
                        {row ? (
                          <span className={row.is_published ? "badge-success" : "badge-gray"}>
                            {row.is_published ? "Published" : "Hidden"}
                          </span>
                        ) : (
                          <span className="badge-warning">Not created</span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100 mt-3">{row?.title || p.label}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">/{p.slug}</p>
                      <span className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 font-medium mt-3">
                        <Pencil className="w-3 h-3" /> Edit
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          slug={editing.slug}
          label={editing.label}
          existing={bySlug(editing.slug)}
          onClose={() => setEditing(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["info-pages"] }); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ── Editor modal ──────────────────────────────────────────────────────────────
function EditModal({
  slug, label, existing, onClose, onSaved,
}: {
  slug: string;
  label: string;
  existing?: InfoPage;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isFaq = slug === "faq";
  const isContact = slug === "contact-us";

  const [title, setTitle] = useState(existing?.title ?? label);
  const [content, setContent] = useState(existing?.content ?? "");
  const [published, setPublished] = useState(existing?.is_published ?? true);

  // FAQ items
  const [items, setItems] = useState<{ q: string; a: string }[]>(
    Array.isArray(existing?.data?.items) ? existing!.data.items : [{ q: "", a: "" }]
  );
  // Contact fields
  const [contact, setContact] = useState({
    email: existing?.data?.email ?? "",
    phone: existing?.data?.phone ?? "",
    address: existing?.data?.address ?? "",
    hours: existing?.data?.hours ?? "",
    predefined_message: existing?.data?.predefined_message ?? "",
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: () => {
      const data =
        isFaq ? { items: items.filter((it) => it.q.trim()) } :
        isContact ? { ...contact } :
        null;
      return infoPageApi.upsert(slug, { title, content, data, is_published: published });
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); },
    onError: () => toast.error("Failed to save"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl my-8 shadow-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 rounded-t-2xl">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Edit · {label}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">/{slug}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Title */}
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </Field>

          {/* Content (intro / body) */}
          <Field label={isFaq ? "Intro text" : isContact ? "Intro text" : "Content"}>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={slug === "footer" ? 2 : isFaq || isContact ? 3 : 10}
              placeholder={slug === "footer" ? "© 2026 Your Platform. All rights reserved. Built for the future of learning." : "Separate paragraphs with a blank line."}
              className="input resize-y font-mono text-xs leading-relaxed"
            />
          </Field>

          {/* FAQ items */}
          {isFaq && (
            <Field label="Questions & Answers">
              <div className="space-y-3">
                {items.map((it, i) => (
                  <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Q{i + 1}</span>
                      <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-danger-500 hover:text-danger-700 dark:hover:text-danger-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <input value={it.q} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, q: e.target.value } : x))} placeholder="Question" className="input" />
                    <textarea value={it.a} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, a: e.target.value } : x))} placeholder="Answer" rows={2} className="input resize-y" />
                  </div>
                ))}
                <button onClick={() => setItems([...items, { q: "", a: "" }])} className="inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 font-medium hover:text-primary-700 dark:hover:text-primary-300">
                  <Plus className="w-4 h-4" /> Add question
                </button>
              </div>
            </Field>
          )}

          {/* Contact fields */}
          {isContact && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Email"><input value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className="input" /></Field>
              <Field label="Phone"><input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className="input" /></Field>
              <Field label="Address"><input value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} className="input" /></Field>
              <Field label="Hours"><input value={contact.hours} onChange={(e) => setContact({ ...contact, hours: e.target.value })} className="input" /></Field>
              <div className="sm:col-span-2">
                <Field label="Predefined message (prefilled in the contact form)">
                  <textarea value={contact.predefined_message} onChange={(e) => setContact({ ...contact, predefined_message: e.target.value })} rows={2} className="input resize-y" />
                </Field>
              </div>
            </div>
          )}

          {/* Published toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="checkbox" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Published (visible to users)</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !title.trim()}
            className="btn btn-primary"
          >
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
