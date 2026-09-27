import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { planApi } from "@/lib/api";
import {
  Layers, Plus, Trash2, ToggleLeft, ToggleRight, Pencil,
  RefreshCw, X, AlertTriangle, Star, GripVertical,
} from "lucide-react";

interface Plan {
  id: string;
  plan_key: string;
  name: string;
  price: number;           // rupees
  currency: string;
  duration_days: number;
  badge: string | null;
  description: string | null;
  features: string[];
  limits: Record<string, number>;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
}

interface PlanForm {
  plan_key: string;
  name: string;
  price: string;
  duration_days: string;
  badge: string;
  description: string;
  features: string[];
  ai_queries_per_day: string;
  flashcards_per_day: string;
  is_popular: boolean;
  is_active: boolean;
  sort_order: string;
}

const DEFAULT_FORM: PlanForm = {
  plan_key: "", name: "", price: "", duration_days: "30", badge: "", description: "",
  features: [""], ai_queries_per_day: "", flashcards_per_day: "",
  is_popular: false, is_active: true, sort_order: "0",
};

function formToPayload(f: PlanForm) {
  const limits: Record<string, number> = {};
  if (f.ai_queries_per_day.trim()) limits.ai_queries_per_day = parseInt(f.ai_queries_per_day);
  if (f.flashcards_per_day.trim()) limits.flashcards_per_day = parseInt(f.flashcards_per_day);
  return {
    name: f.name.trim(),
    price: Math.round(parseFloat(f.price)),
    duration_days: parseInt(f.duration_days),
    badge: f.badge.trim() || null,
    description: f.description.trim() || null,
    features: f.features.map((x) => x.trim()).filter(Boolean),
    limits,
    is_popular: f.is_popular,
    is_active: f.is_active,
    sort_order: parseInt(f.sort_order) || 0,
  };
}

export default function PlansPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(DEFAULT_FORM);
  const [formError, setFormError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: plans = [], isLoading, isError, refetch } = useQuery<Plan[]>({
    queryKey: ["admin-plans"],
    queryFn: () => planApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => planApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      setShowModal(false);
      setFormError("");
    },
    onError: (err: any) => setFormError(err?.response?.data?.detail ?? "Failed to save plan. Please try again."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => planApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      setShowModal(false);
      setFormError("");
    },
    onError: (err: any) => setFormError(err?.response?.data?.detail ?? "Failed to save plan. Please try again."),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => planApi.update(id, { is_active: isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-plans"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => planApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      setDeleteConfirm(null);
    },
  });

  function openCreateModal() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setFormError("");
    setShowModal(true);
  }

  function openEditModal(p: Plan) {
    setEditingId(p.id);
    setForm({
      plan_key: p.plan_key,
      name: p.name,
      price: String(p.price),
      duration_days: String(p.duration_days),
      badge: p.badge ?? "",
      description: p.description ?? "",
      features: p.features.length > 0 ? p.features : [""],
      ai_queries_per_day: p.limits?.ai_queries_per_day != null ? String(p.limits.ai_queries_per_day) : "",
      flashcards_per_day: p.limits?.flashcards_per_day != null ? String(p.limits.flashcards_per_day) : "",
      is_popular: p.is_popular,
      is_active: p.is_active,
      sort_order: String(p.sort_order),
    });
    setFormError("");
    setShowModal(true);
  }

  function handleFeatureChange(idx: number, value: string) {
    setForm((f) => ({ ...f, features: f.features.map((x, i) => (i === idx ? value : x)) }));
  }
  function addFeatureRow() {
    setForm((f) => ({ ...f, features: [...f.features, ""] }));
  }
  function removeFeatureRow(idx: number) {
    setForm((f) => ({ ...f, features: f.features.filter((_, i) => i !== idx) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!editingId && !/^[a-z0-9_-]+$/.test(form.plan_key.trim())) {
      setFormError("Plan key must be lowercase letters, numbers, - or _ only (e.g. monthly, annual-promo).");
      return;
    }
    if (!form.name.trim()) { setFormError("Plan name is required."); return; }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) { setFormError("Price must be a non-negative number."); return; }
    const days = parseInt(form.duration_days);
    if (isNaN(days) || days <= 0) { setFormError("Duration must be a positive number of days."); return; }

    const payload = formToPayload(form);
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate({ ...payload, plan_key: form.plan_key.trim().toLowerCase() });
    }
  }

  const activePlans = plans.filter((p) => p.is_active).length;
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Subscription Plans</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Manage plan pricing, duration & features — shown live on web and mobile checkout
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn btn-sm btn-secondary">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={openCreateModal} className="btn btn-sm btn-primary flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            New Plan
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
            <Layers className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Plans</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{plans.length}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-success-100 dark:bg-success-900/40 flex items-center justify-center">
            <ToggleRight className="w-5 h-5 text-success-600 dark:text-success-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Active (shown to users)</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{activePlans}</p>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">All Plans</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">{plans.length} total</span>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-gray-400 dark:text-gray-500">Loading plans…</div>
        ) : isError ? (
          <div className="p-10 text-center text-danger-600 dark:text-danger-400">
            Failed to load. <button onClick={() => refetch()} className="underline">Retry</button>
          </div>
        ) : plans.length === 0 ? (
          <div className="p-10 text-center text-gray-400 dark:text-gray-500">
            <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No plans yet. Create your first one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                  <th className="table-th text-left px-5">Plan</th>
                  <th className="table-th text-left">Price / Duration</th>
                  <th className="table-th text-left">Features</th>
                  <th className="table-th text-left">Badge</th>
                  <th className="table-th text-left">Status</th>
                  <th className="table-th text-right px-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {[...plans].sort((a, b) => a.sort_order - b.sort_order).map((plan) => (
                  <tr key={plan.id} className="table-row-hover">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                        <div>
                          <p className="font-semibold text-gray-800 dark:text-gray-200">{plan.name}</p>
                          <code className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">{plan.plan_key}</code>
                        </div>
                        {plan.is_popular && <Star className="w-3.5 h-3.5 text-warning-500 fill-warning-500" />}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">₹{plan.price}</span>{" "}
                      <span className="text-gray-400 dark:text-gray-500 text-xs">/ {plan.duration_days}d</span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400 text-xs">
                      {plan.features.length} feature{plan.features.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3.5">
                      {plan.badge ? (
                        <span className="badge badge-info">{plan.badge}</span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`badge ${plan.is_active ? "badge-success" : "badge-gray"}`}>
                        {plan.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(plan)}
                          className="p-1.5 rounded text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                          title="Edit plan"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate({ id: plan.id, isActive: !plan.is_active })}
                          disabled={toggleMutation.isPending}
                          className={`p-1.5 rounded transition-colors ${
                            plan.is_active ? "text-success-600 dark:text-success-400 hover:bg-success-50 dark:hover:bg-success-900/30" : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                          }`}
                          title={plan.is_active ? "Deactivate" : "Activate"}
                        >
                          {plan.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        {deleteConfirm === plan.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => deleteMutation.mutate(plan.id)}
                              disabled={deleteMutation.isPending}
                              className="text-[11px] px-2 py-1 bg-danger-600 text-white rounded hover:bg-danger-700 transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-[11px] px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(plan.id)}
                            className="p-1.5 rounded text-gray-400 dark:text-gray-500 hover:text-danger-500 dark:hover:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/30 transition-colors"
                            title="Deactivate plan"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Plan Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />

          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-md w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/40 rounded-lg flex items-center justify-center">
                  <Layers className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editingId ? "Edit Plan" : "Create Plan"}</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="alert-danger">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">
                    Plan Key {!editingId && <span className="text-danger-600 dark:text-danger-400">*</span>}
                  </label>
                  <input
                    type="text"
                    value={form.plan_key}
                    onChange={(e) => setForm((f) => ({ ...f, plan_key: e.target.value }))}
                    placeholder="e.g. monthly"
                    className="input w-full font-mono"
                    disabled={!!editingId}
                    required={!editingId}
                  />
                </div>
                <div>
                  <label className="label">
                    Display Name <span className="text-danger-600 dark:text-danger-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. 1 Month"
                    className="input w-full"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">
                    Price (₹) <span className="text-danger-600 dark:text-danger-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="149"
                    className="input w-full"
                    min={0}
                    required
                  />
                </div>
                <div>
                  <label className="label">
                    Duration (days) <span className="text-danger-600 dark:text-danger-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={form.duration_days}
                    onChange={(e) => setForm((f) => ({ ...f, duration_days: e.target.value }))}
                    placeholder="30"
                    className="input w-full"
                    min={1}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Badge</label>
                  <input
                    type="text"
                    value={form.badge}
                    onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
                    placeholder="e.g. Most Popular"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="label">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                    className="input w-full"
                  />
                </div>
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Short tagline shown under the plan name"
                  className="input w-full"
                  rows={2}
                />
              </div>

              {/* Features — dynamic list */}
              <div>
                <label className="label">Features</label>
                <div className="space-y-2">
                  {form.features.map((feat, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={feat}
                        onChange={(e) => handleFeatureChange(idx, e.target.value)}
                        placeholder="e.g. Unlimited AI Study Chat"
                        className="input w-full"
                      />
                      <button
                        type="button"
                        onClick={() => removeFeatureRow(idx)}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-danger-500 dark:hover:text-danger-400 transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addFeatureRow}
                  className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                >
                  <Plus className="w-3.5 h-3.5" /> Add feature
                </button>
              </div>

              {/* Optional numeric limits */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">
                    AI Queries / day <span className="text-gray-400 dark:text-gray-500 font-normal">(blank = unlimited)</span>
                  </label>
                  <input
                    type="number"
                    value={form.ai_queries_per_day}
                    onChange={(e) => setForm((f) => ({ ...f, ai_queries_per_day: e.target.value }))}
                    placeholder="Unlimited"
                    className="input w-full"
                    min={0}
                  />
                </div>
                <div>
                  <label className="label">
                    Flashcards / day <span className="text-gray-400 dark:text-gray-500 font-normal">(blank = unlimited)</span>
                  </label>
                  <input
                    type="number"
                    value={form.flashcards_per_day}
                    onChange={(e) => setForm((f) => ({ ...f, flashcards_per_day: e.target.value }))}
                    placeholder="Unlimited"
                    className="input w-full"
                    min={0}
                  />
                </div>
              </div>

              {/* Popular + Active toggles */}
              <div className="flex items-center justify-between py-2 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Mark as "Most Popular"</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Highlighted with a star badge in checkout UI</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_popular: !f.is_popular }))}
                  className={`relative inline-flex w-11 h-6 rounded-full transition-colors focus:outline-none ${
                    form.is_popular ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_popular ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>

              <div className="flex items-center justify-between py-2 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Shown to users on web & mobile checkout</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex w-11 h-6 rounded-full transition-colors focus:outline-none ${
                    form.is_active ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Create Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
