import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { careerApi } from "@/lib/api";
import DataTable from "@/components/ui/DataTable";
import StatsCard from "@/components/ui/StatsCard";
import Modal from "@/components/ui/Modal";
import { useForm } from "react-hook-form";
import { Briefcase, Plus, Target, Calendar, BookOpen, Trash2, Edit2, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Opportunity {
  id: string;
  title: string;
  description?: string;
  category: string;
  subcategory: string;
  organization: string;
  last_date?: string;
  official_url?: string;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
}

interface Career {
  id: string;
  title: string;
  category: string;
  description?: string;
  created_at: string;
}

// Backend schema fields — must match OpportunityCreate exactly
interface OpportunityFormData {
  title: string;
  organization: string;
  description: string;
  category: string;       // enum: government_jobs | scholarships | entrance_exams | internships | olympiads
  subcategory: string;    // free text, e.g. "SSC CGL", "DRDO", "IIT JEE"
  last_date: string;      // date as YYYY-MM-DD
  official_url: string;
  is_featured: boolean;
}

// ─── Constants matching backend OpportunityCategory enum ─────────────────────

const CATEGORIES = [
  { value: "government_jobs", label: "Government Jobs" },
  { value: "scholarships",    label: "Scholarships" },
  { value: "entrance_exams",  label: "Entrance Exams" },
  { value: "internships",     label: "Internships" },
  { value: "olympiads",       label: "Olympiads" },
];

const CATEGORY_BADGE: Record<string, string> = {
  government_jobs: "badge-danger",
  scholarships:    "badge-success",
  entrance_exams:  "badge-info",
  internships:     "badge-primary",
  olympiads:       "badge-warning",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUpcomingWithin30Days(last_date?: string): boolean {
  if (!last_date) return false;
  const d = new Date(last_date);
  const now = new Date();
  const in30 = new Date();
  in30.setDate(now.getDate() + 30);
  return d >= now && d <= in30;
}

function formatDate(d?: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  title,
  onConfirm,
  onCancel,
  isPending,
}: { title: string; onConfirm: () => void; onCancel: () => void; isPending: boolean }) {
  return (
    <Modal title="Confirm Delete" onClose={onCancel} size="sm">
      <div className="space-y-4">
        <div className="alert-danger">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">This action cannot be undone</p>
            <p className="text-xs mt-0.5">
              Delete <strong>"{title}"</strong>? It will be permanently removed.
            </p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} disabled={isPending} className="btn-danger">
            {isPending ? "Deleting…" : "Yes, Delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Opportunity Form Modal ───────────────────────────────────────────────────

interface OpportunityModalProps {
  editing: Opportunity | null;
  onClose: () => void;
  onSuccess: () => void;
}

function OpportunityModal({ editing, onClose, onSuccess }: OpportunityModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OpportunityFormData>({
    defaultValues: editing
      ? {
          title:        editing.title,
          organization: editing.organization ?? "",
          description:  editing.description ?? "",
          category:     editing.category,
          subcategory:  editing.subcategory ?? "",
          last_date:    editing.last_date ? editing.last_date.slice(0, 10) : "",
          official_url: editing.official_url ?? "",
          is_featured:  editing.is_featured ?? false,
        }
      : {
          title: "", organization: "", description: "",
          category: "", subcategory: "", last_date: "", official_url: "",
          is_featured: false,
        },
  });

  const createMutation = useMutation({
    mutationFn: (data: OpportunityFormData) => careerApi.createOpportunity(data),
  });

  const updateMutation = useMutation({
    mutationFn: (data: OpportunityFormData) =>
      careerApi.updateOpportunity(editing!.id, data),
  });

  const onSubmit = async (data: OpportunityFormData) => {
    try {
      // Backend expects date as "YYYY-MM-DD" (not datetime)
      const payload: OpportunityFormData = {
        ...data,
        last_date: data.last_date || new Date().toISOString().slice(0, 10),
      };
      if (editing) {
        await updateMutation.mutateAsync(payload);
        toast.success("Opportunity updated");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Opportunity created");
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : editing ? "Failed to update" : "Failed to create");
    }
  };

  return (
    <Modal title={editing ? "Edit Opportunity" : "Add Opportunity"} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* Title */}
        <div>
          <label className="label">Title *</label>
          <input {...register("title", { required: "Title is required" })} className="input"
            placeholder="e.g. DRDO Summer Internship 2025" />
          {errors.title && <p className="error-text">{errors.title.message}</p>}
        </div>

        {/* Organization */}
        <div>
          <label className="label">Organization *</label>
          <input {...register("organization", { required: "Organization is required" })} className="input"
            placeholder="e.g. Ministry of Defence, ISRO, IIT Delhi" />
          {errors.organization && <p className="error-text">{errors.organization.message}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="label">Description</label>
          <textarea {...register("description")} rows={2} className="input resize-none"
            placeholder="Brief description…" />
        </div>

        {/* Category + Subcategory */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Category *</label>
            <select {...register("category", { required: "Category is required" })} className="input">
              <option value="">Select category</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {errors.category && <p className="error-text">{errors.category.message}</p>}
          </div>
          <div>
            <label className="label">Subcategory / Type *
              <span className="text-gray-400 dark:text-gray-500 font-normal ml-1 text-xs">(e.g. SSC CGL, DRDO, JEE)</span>
            </label>
            <input {...register("subcategory", { required: "Subcategory is required" })} className="input"
              placeholder="e.g. SSC CGL, DRDO Internship" />
            {errors.subcategory && <p className="error-text">{errors.subcategory.message}</p>}
          </div>
        </div>

        {/* Last Date + Official URL */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Last Date to Apply *</label>
            <input {...register("last_date", { required: "Last date is required" })}
              type="date" className="input" />
            {errors.last_date && <p className="error-text">{errors.last_date.message}</p>}
          </div>
          <div>
            <label className="label">Official URL *</label>
            <input {...register("official_url", { required: "Official URL is required" })}
              type="url" className="input" placeholder="https://…" />
            {errors.official_url && <p className="error-text">{errors.official_url.message}</p>}
          </div>
        </div>

        {/* Featured */}
        <div className="flex items-center gap-3">
          <input {...register("is_featured")} id="is_featured" type="checkbox" className="checkbox" />
          <label htmlFor="is_featured" className="text-sm font-medium text-gray-700 dark:text-gray-300 select-none">
            Feature this opportunity (shown prominently)
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? (editing ? "Saving…" : "Creating…") : (editing ? "Save Changes" : "Create Opportunity")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CareersPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"opportunities" | "careers">("opportunities");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Opportunity | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: opportunities = [], isLoading: loadingOpps } = useQuery<Opportunity[]>({
    queryKey: ["career-opportunities"],
    queryFn: () => careerApi.opportunities().then((r) => {
      const raw = r.data;
      if (Array.isArray(raw)) return raw;
      if (Array.isArray(raw?.items)) return raw.items;
      if (Array.isArray(raw?.opportunities)) return raw.opportunities;
      return [];
    }),
  });

  const { data: careers = [], isLoading: loadingCareers } = useQuery<Career[]>({
    queryKey: ["careers-list"],
    queryFn: () => careerApi.list().then((r) => {
      const raw = r.data;
      if (Array.isArray(raw)) return raw;
      if (Array.isArray(raw?.items)) return raw.items;
      if (Array.isArray(raw?.careers)) return raw.careers;
      return [];
    }),
    enabled: activeTab === "careers",
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: string) => careerApi.deleteOpportunity(id),
    onSuccess: () => {
      toast.success("Opportunity removed");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["career-opportunities"] });
    },
    onError: () => toast.error("Failed to delete opportunity"),
  });

  const handleModalSuccess = () => {
    qc.invalidateQueries({ queryKey: ["career-opportunities"] });
  };

  // ── Derived stats ─────────────────────────────────────────────────────────

  const totalOpps    = opportunities.length;
  const activeOpps   = opportunities.filter((o) => o.is_active).length;
  const featuredOpps = opportunities.filter((o) => o.is_featured).length;
  const upcomingCount = opportunities.filter((o) => isUpcomingWithin30Days(o.last_date)).length;

  // ── Opportunities table columns ───────────────────────────────────────────

  const oppColumns = [
    {
      header: "Title",
      accessor: (row: Opportunity) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100 line-clamp-1">{row.title}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{row.organization}</p>
        </div>
      ),
    },
    {
      header: "Category",
      accessor: (row: Opportunity) => {
        const label = CATEGORIES.find((c) => c.value === row.category)?.label ?? row.category;
        return (
          <span className={`badge ${CATEGORY_BADGE[row.category] ?? "badge-gray"}`}>{label}</span>
        );
      },
    },
    {
      header: "Subcategory",
      accessor: (row: Opportunity) => (
        <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">{row.subcategory || "—"}</span>
      ),
    },
    {
      header: "Last Date",
      accessor: (row: Opportunity) => (
        <span className={`text-xs whitespace-nowrap ${isUpcomingWithin30Days(row.last_date) ? "text-warning-600 dark:text-warning-400 font-semibold" : "text-gray-500 dark:text-gray-400"}`}>
          {formatDate(row.last_date)}
        </span>
      ),
    },
    {
      header: "Status",
      accessor: (row: Opportunity) => (
        <div className="flex items-center gap-1.5">
          <span className={`badge ${row.is_active ? "badge-success" : "badge-danger"}`}>
            {row.is_active ? "Active" : "Inactive"}
          </span>
          {row.is_featured && <span className="badge badge-warning">Featured</span>}
        </div>
      ),
    },
    {
      header: "Actions",
      accessor: (row: Opportunity) => (
        <div className="flex items-center gap-1.5">
          {row.official_url && (
            <a href={row.official_url} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Open URL">
              <BookOpen className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={() => { setEditing(row); setShowModal(true); }}
            className="p-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/30 text-primary-600 dark:text-primary-400" title="Edit">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setDeleteTarget(row)}
            disabled={deleteMutation.isPending}
            className="p-1.5 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-900/30 text-danger-500 dark:text-danger-400 disabled:opacity-40" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  // ── Careers table columns ─────────────────────────────────────────────────

  const careerColumns = [
    { header: "Career Title", accessor: (row: Career) => <p className="font-medium text-gray-900 dark:text-gray-100">{row.title}</p> },
    {
      header: "Category",
      accessor: (row: Career) => (
        <span className={`badge ${CATEGORY_BADGE[row.category] ?? "badge-gray"}`}>{row.category}</span>
      ),
    },
    {
      header: "Description",
      accessor: (row: Career) => (
        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 max-w-xs">{row.description ?? "—"}</p>
      ),
    },
    {
      header: "Added",
      accessor: (row: Career) => new Date(row.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary-600" /> Career &amp; Opportunities
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage career paths and student opportunities</p>
        </div>
        {activeTab === "opportunities" && (
          <button onClick={() => { setEditing(null); setShowModal(true); }}
            className="btn-primary flex items-center gap-2 self-start sm:self-auto">
            <Plus className="w-4 h-4" /> Add Opportunity
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(["opportunities", "careers"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab ? "border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}>
            {tab === "opportunities" ? "Opportunities" : "Careers"}
          </button>
        ))}
      </div>

      {/* ── Opportunities tab ── */}
      {activeTab === "opportunities" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard label="Total" value={totalOpps} icon={Target} color="bg-primary-600" />
            <StatsCard label="Active" value={activeOpps} icon={Briefcase} color="bg-success-500" />
            <StatsCard label="Featured" value={featuredOpps} icon={BookOpen} color="bg-warning-500" />
            <StatsCard label="Closing in 30d" value={upcomingCount} icon={Calendar} color="bg-gray-500" />
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">All Opportunities</h2>
            </div>
            <DataTable columns={oppColumns} data={opportunities} searchKey="title" loading={loadingOpps} pageSize={10} />
          </div>
        </div>
      )}

      {/* ── Careers tab ── */}
      {activeTab === "careers" && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary-600" /> Career Paths
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Managed via content pipeline</p>
            </div>
            <span className="badge badge-gray">{careers.length} total</span>
          </div>
          <DataTable columns={careerColumns} data={careers} searchKey="title" loading={loadingCareers} pageSize={10} />
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <OpportunityModal editing={editing} onClose={() => { setShowModal(false); setEditing(null); }} onSuccess={handleModalSuccess} />
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          title={deleteTarget.title}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
