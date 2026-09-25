import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { couponApi, planApi } from "@/lib/api";
import {
  Tag, Plus, Trash2, Copy, ToggleLeft, ToggleRight,
  RefreshCw, X, Check, AlertTriangle,
} from "lucide-react";

interface Coupon {
  id: string;
  code: string;
  discount_type: "percent" | "flat";
  discount_value: number;
  applicable_plans: string[];
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface CreateCouponForm {
  code: string;
  discount_type: "percent" | "flat";
  discount_value: string;
  applicable_plans: string[];
  max_uses: string;
  expires_at: string;
  is_active: boolean;
}

function couponStatus(c: Coupon): { label: string; cls: string } {
  if (!c.is_active) return { label: "Inactive", cls: "badge-gray" };
  if (c.expires_at && new Date(c.expires_at) < new Date())
    return { label: "Expired", cls: "badge-red" };
  if (c.max_uses > 0 && c.used_count >= c.max_uses)
    return { label: "Used Up", cls: "badge-red" };
  return { label: "Active", cls: "badge-green" };
}

function formatDate(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const DEFAULT_FORM: CreateCouponForm = {
  code: "",
  discount_type: "percent",
  discount_value: "",
  applicable_plans: [],
  max_uses: "",
  expires_at: "",
  is_active: true,
};

export default function CouponsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CreateCouponForm>(DEFAULT_FORM);
  const [formError, setFormError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: coupons = [], isLoading, isError, refetch } = useQuery<Coupon[]>({
    queryKey: ["admin-coupons"],
    queryFn: () => couponApi.list().then((r) => r.data),
  });

  // Dynamic plan list — replaces the old hardcoded ["monthly","quarterly","annual"]
  const { data: plans = [] } = useQuery<{ plan_key: string; name: string }[]>({
    queryKey: ["admin-plans"],
    queryFn: () => planApi.list().then((r) => r.data),
  });
  const PLANS = plans.map((p) => p.plan_key);

  const createMutation = useMutation({
    mutationFn: (data: object) => couponApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
      setShowModal(false);
      setForm(DEFAULT_FORM);
      setFormError("");
    },
    onError: (err: any) => {
      setFormError(
        err?.response?.data?.detail ?? "Failed to create coupon. Please try again."
      );
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      couponApi.toggle(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-coupons"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => couponApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
      setDeleteConfirm(null);
    },
  });

  function openModal() {
    setForm(DEFAULT_FORM);
    setFormError("");
    setShowModal(true);
  }

  function handlePlanToggle(plan: string) {
    setForm((f) => ({
      ...f,
      applicable_plans: f.applicable_plans.includes(plan)
        ? f.applicable_plans.filter((p) => p !== plan)
        : [...f.applicable_plans, plan],
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const value = parseFloat(form.discount_value);
    if (!form.code.trim()) { setFormError("Coupon code is required."); return; }
    if (isNaN(value) || value <= 0) { setFormError("Discount value must be positive."); return; }
    if (form.discount_type === "percent" && value > 100) {
      setFormError("Percent discount cannot exceed 100."); return;
    }
    createMutation.mutate({
      code: form.code.trim().toUpperCase(),
      discount_type: form.discount_type,
      discount_value: Math.round(value),
      applicable_plans: form.applicable_plans,
      max_uses: form.max_uses ? parseInt(form.max_uses) : 0,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      is_active: form.is_active,
    });
  }

  async function copyCode(code: string, id: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // fallback silently
    }
  }

  const activeCoupons = coupons.filter((c) => c.is_active).length;
  const expiredCoupons = coupons.filter(
    (c) => c.expires_at && new Date(c.expires_at) < new Date()
  ).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Coupon Codes</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Manage discount coupons for subscription plans
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn btn-sm btn-secondary">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={openModal} className="btn btn-sm btn-primary flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            New Coupon
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
            <Tag className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Coupons</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{coupons.length}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-success-50 dark:bg-success-900/30 flex items-center justify-center">
            <ToggleRight className="w-5 h-5 text-success-600 dark:text-success-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Active</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{activeCoupons}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-danger-50 dark:bg-danger-900/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-danger-500 dark:text-danger-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Expired</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{expiredCoupons}</p>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">All Coupons</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">{coupons.length} total</span>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-gray-400 dark:text-gray-500">Loading coupons…</div>
        ) : isError ? (
          <div className="p-10 text-center text-danger-500 dark:text-danger-400">
            Failed to load.{" "}
            <button onClick={() => refetch()} className="underline">Retry</button>
          </div>
        ) : coupons.length === 0 ? (
          <div className="p-10 text-center text-gray-400 dark:text-gray-500">
            <Tag className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No coupons yet. Create your first one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="table-th">
                    Code
                  </th>
                  <th className="table-th">
                    Type / Value
                  </th>
                  <th className="table-th">
                    Applicable Plans
                  </th>
                  <th className="table-th">
                    Uses
                  </th>
                  <th className="table-th">
                    Expires
                  </th>
                  <th className="table-th">
                    Status
                  </th>
                  <th className="table-th text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {coupons.map((coupon) => {
                  const status = couponStatus(coupon);
                  return (
                    <tr key={coupon.id} className="table-row-hover">
                      {/* Code */}
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono font-semibold text-gray-800 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                            {coupon.code}
                          </code>
                          <button
                            onClick={() => copyCode(coupon.code, coupon.id)}
                            className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                            title="Copy code"
                          >
                            {copiedId === coupon.id ? (
                              <Check className="w-3.5 h-3.5 text-success-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Type / Value */}
                      <td className="table-td">
                        <span
                          className={
                            coupon.discount_type === "percent" ? "badge-info" : "badge-warning"
                          }
                        >
                          {coupon.discount_type === "percent"
                            ? `${coupon.discount_value}%`
                            : `₹${coupon.discount_value}`}
                        </span>
                      </td>

                      {/* Plans */}
                      <td className="table-td">
                        {coupon.applicable_plans.length === 0 ? (
                          <span className="text-gray-400 dark:text-gray-500 text-xs italic">All plans</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {coupon.applicable_plans.map((p) => (
                              <span
                                key={p}
                                className="text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded capitalize"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Uses */}
                      <td className="table-td font-mono text-xs">
                        {coupon.used_count}
                        <span className="text-gray-400 dark:text-gray-500">
                          /{coupon.max_uses === 0 ? "∞" : coupon.max_uses}
                        </span>
                      </td>

                      {/* Expires */}
                      <td className="table-td text-xs">
                        {formatDate(coupon.expires_at)}
                      </td>

                      {/* Status */}
                      <td className="table-td">
                        <span className={status.cls}>{status.label}</span>
                      </td>

                      {/* Actions */}
                      <td className="table-td">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Toggle active */}
                          <button
                            onClick={() =>
                              toggleMutation.mutate({
                                id: coupon.id,
                                isActive: !coupon.is_active,
                              })
                            }
                            disabled={toggleMutation.isPending}
                            className={`p-1.5 rounded transition-colors ${
                              coupon.is_active
                                ? "text-success-600 hover:bg-success-50 dark:hover:bg-success-900/30"
                                : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                            title={coupon.is_active ? "Deactivate" : "Activate"}
                          >
                            {coupon.is_active ? (
                              <ToggleRight className="w-4 h-4" />
                            ) : (
                              <ToggleLeft className="w-4 h-4" />
                            )}
                          </button>

                          {/* Delete */}
                          {deleteConfirm === coupon.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => deleteMutation.mutate(coupon.id)}
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
                              onClick={() => setDeleteConfirm(coupon.id)}
                              className="p-1.5 rounded text-gray-400 hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/30 transition-colors"
                              title="Delete coupon"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Coupon Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />

          {/* Modal panel */}
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-md w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/40 rounded-lg flex items-center justify-center">
                  <Tag className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Create Coupon</h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {formError && (
                <div className="alert-danger">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {formError}
                </div>
              )}

              {/* Code */}
              <div>
                <label className="label">
                  Coupon Code <span className="text-danger-600">*</span>
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                  }
                  placeholder="e.g. SAVE20"
                  className="input w-full font-mono uppercase"
                  maxLength={50}
                  required
                />
              </div>

              {/* Discount type + value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">
                    Discount Type <span className="text-danger-600">*</span>
                  </label>
                  <select
                    value={form.discount_type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        discount_type: e.target.value as "percent" | "flat",
                      }))
                    }
                    className="input w-full"
                  >
                    <option value="percent">Percent (%)</option>
                    <option value="flat">Flat (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="label">
                    Discount Value <span className="text-danger-600">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm font-medium select-none">
                      {form.discount_type === "percent" ? "%" : "₹"}
                    </span>
                    <input
                      type="number"
                      value={form.discount_value}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, discount_value: e.target.value }))
                      }
                      placeholder="0"
                      className="input w-full pl-7"
                      min={1}
                      max={form.discount_type === "percent" ? 100 : undefined}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Applicable plans */}
              <div>
                <label className="label">
                  Applicable Plans{" "}
                  <span className="text-gray-400 dark:text-gray-500 font-normal">(leave empty for all)</span>
                </label>
                <div className="flex gap-3">
                  {PLANS.map((plan) => (
                    <label
                      key={plan}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm capitalize select-none ${
                        form.applicable_plans.includes(plan)
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                          : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={form.applicable_plans.includes(plan)}
                        onChange={() => handlePlanToggle(plan)}
                      />
                      {form.applicable_plans.includes(plan) ? (
                        <Check className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded border border-gray-300 dark:border-gray-600" />
                      )}
                      {plan}
                    </label>
                  ))}
                </div>
              </div>

              {/* Max uses + expires at */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">
                    Max Uses{" "}
                    <span className="text-gray-400 dark:text-gray-500 font-normal">(0 = unlimited)</span>
                  </label>
                  <input
                    type="number"
                    value={form.max_uses}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, max_uses: e.target.value }))
                    }
                    placeholder="0"
                    className="input w-full"
                    min={0}
                  />
                </div>
                <div>
                  <label className="label">
                    Expires At
                  </label>
                  <input
                    type="datetime-local"
                    value={form.expires_at}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, expires_at: e.target.value }))
                    }
                    className="input w-full"
                  />
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between py-2 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Active on creation</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Users can immediately apply this coupon
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex w-11 h-6 rounded-full transition-colors focus:outline-none ${
                    form.is_active ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      form.is_active ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Footer buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {createMutation.isPending ? "Creating…" : "Create Coupon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
