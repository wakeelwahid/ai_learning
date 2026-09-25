import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { paymentApi, planApi } from "@/lib/api";
import DataTable from "@/components/ui/DataTable";
import StatsCard from "@/components/ui/StatsCard";
import Modal from "@/components/ui/Modal";
import { DollarSign, Users, TrendingUp, CreditCard, RefreshCw, Undo2 } from "lucide-react";

interface Payment {
  id: string;
  user_id: string;
  plan_key: string | null;
  amount_paise: number;
  currency: string;
  status: string;
  gateway: string;
  cashfree_order_id: string | null;
  coupon_code_used: string | null;
  created_at: string;
}

interface AdminPaymentsResponse {
  total: number;
  page: number;
  limit: number;
  payments: Payment[];
}

const paymentStatusColor: Record<string, string> = {
  captured: "badge-success",
  refunded: "badge-gray",
  failed: "badge-danger",
  authorized: "badge-warning",
  created: "badge-warning",
};

interface Subscription {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
}

interface AdminSubsResponse {
  stats: {
    total_active: number;
    per_plan: Record<string, number>;
    monthly_revenue_paise: number;
  };
  subscriptions: Subscription[];
}

interface Plan {
  plan_key: string;
  name: string;
  price: number;
}

const statusColor: Record<string, string> = {
  active: "badge-success",
  expired: "badge-danger",
  cancelled: "badge-gray",
  pending: "badge-warning",
};

export default function PaymentsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"subscriptions" | "payments">("subscriptions");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const { data, isLoading, isError, refetch } = useQuery<AdminSubsResponse>({
    queryKey: ["admin-subscriptions", statusFilter],
    queryFn: () =>
      paymentApi.adminSubscriptions(statusFilter ? { status: statusFilter } : {}).then((r) => r.data),
  });

  // Dynamic plan lookup — replaces the old hardcoded "premium ? ₹149 : ₹99"
  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["admin-plans"],
    queryFn: () => planApi.list().then((r) => r.data),
  });
  const planMap = new Map(plans.map((p) => [p.plan_key, p]));

  const {
    data: paymentsData,
    isLoading: paymentsLoading,
    isError: paymentsError,
    refetch: refetchPayments,
  } = useQuery<AdminPaymentsResponse>({
    queryKey: ["admin-payments", paymentStatusFilter],
    queryFn: () =>
      paymentApi
        .adminListPayments(paymentStatusFilter ? { status: paymentStatusFilter } : {})
        .then((r) => r.data),
    enabled: tab === "payments",
  });
  const payments = paymentsData?.payments ?? [];

  const refundMutation = useMutation({
    mutationFn: () => paymentApi.adminRefundPayment(refundTarget!.id, refundReason || undefined),
    onSuccess: () => {
      toast.success("Payment refunded.");
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
      setRefundTarget(null);
      setRefundReason("");
    },
    onError: (e: any) => {
      // Backend-authored message only (e.g. "Only a captured payment can be
      // refunded (current status: refunded)") — never invent wording here.
      const detail = e?.response?.data?.detail;
      toast.error(detail ?? "Could not reach the server to process the refund.");
    },
  });

  const paymentCols = [
    {
      header: "Payment ID",
      accessor: (r: Payment) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{r.id.slice(0, 8)}…</span>
      ),
    },
    {
      header: "User ID",
      accessor: (r: Payment) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{r.user_id.slice(0, 8)}…</span>
      ),
    },
    {
      header: "Plan",
      accessor: (r: Payment) => (
        <span className="badge badge-info">{(planMap.get(r.plan_key ?? "")?.name ?? r.plan_key ?? "—").toUpperCase()}</span>
      ),
    },
    {
      header: "Amount",
      accessor: (r: Payment) => `₹${Math.round(r.amount_paise / 100).toLocaleString("en-IN")}`,
    },
    {
      header: "Status",
      accessor: (r: Payment) => (
        <span className={`badge ${paymentStatusColor[r.status] ?? "badge-gray"}`}>{r.status}</span>
      ),
    },
    {
      header: "Coupon",
      accessor: (r: Payment) => r.coupon_code_used ?? "—",
    },
    {
      header: "Date",
      accessor: (r: Payment) => new Date(r.created_at).toLocaleDateString("en-IN"),
    },
    {
      header: "Actions",
      accessor: (r: Payment) => (
        <button
          className="btn btn-sm btn-secondary"
          disabled={r.status !== "captured"}
          onClick={() => setRefundTarget(r)}
        >
          <Undo2 className="w-3.5 h-3.5 mr-1" />
          Refund
        </button>
      ),
    },
  ];

  const stats = data?.stats;
  const subs = data?.subscriptions ?? [];
  const perPlan = Object.entries(stats?.per_plan ?? {}).sort((a, b) => b[1] - a[1]);

  const subCols = [
    {
      header: "User ID",
      accessor: (r: Subscription) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{r.user_id.slice(0, 8)}…</span>
      ),
    },
    {
      header: "Plan",
      accessor: (r: Subscription) => (
        <span className="badge badge-info">{(planMap.get(r.plan)?.name ?? r.plan).toUpperCase()}</span>
      ),
    },
    {
      header: "Status",
      accessor: (r: Subscription) => (
        <span className={`badge ${statusColor[r.status] ?? "badge-gray"}`}>{r.status}</span>
      ),
    },
    {
      header: "Amount",
      accessor: (r: Subscription) => {
        const p = planMap.get(r.plan);
        return p ? `₹${p.price}` : "—";
      },
    },
    {
      header: "Expires",
      accessor: (r: Subscription) =>
        r.expires_at ? new Date(r.expires_at).toLocaleDateString("en-IN") : "—",
    },
    {
      header: "Actions",
      accessor: (r: Subscription) => (
        <button className="btn btn-sm btn-secondary" disabled={r.status !== "active"}>
          Cancel
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Payments & Subscriptions</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Manage Cashfree transactions and active plans</p>
        </div>
        <button onClick={() => refetch()} className="btn btn-sm btn-secondary">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          label="Active Subscribers"
          value={isLoading ? "…" : String(stats?.total_active ?? 0)}
          icon={Users}
          color="bg-info-600"
        />
        <StatsCard
          label="Monthly Revenue (est.)"
          value={isLoading ? "…" : `₹${Math.round((stats?.monthly_revenue_paise ?? 0) / 100).toLocaleString("en-IN")}`}
          icon={DollarSign}
          color="bg-success-600"
        />
        {perPlan.slice(0, 2).map(([planKey, count]) => (
          <StatsCard
            key={planKey}
            label={planMap.get(planKey)?.name ?? planKey}
            value={isLoading ? "…" : String(count)}
            icon={planKey === perPlan[0]?.[0] ? TrendingUp : CreditCard}
            color="bg-primary-600"
          />
        ))}
      </div>

      <div className="flex gap-1 border-b border-gray-100 dark:border-gray-700">
        {(["subscriptions", "payments"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`tab capitalize ${tab === t ? "tab-active" : ""}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "subscriptions" && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input w-36 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading subscriptions…</div>
          ) : isError ? (
            <div className="p-8 text-center text-danger-600 dark:text-danger-400">
              Failed to load.{" "}
              <button onClick={() => refetch()} className="underline">Retry</button>
            </div>
          ) : subs.length === 0 ? (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500">No subscriptions found.</div>
          ) : (
            <DataTable columns={subCols} data={subs} searchKey="user_id" />
          )}
        </div>
      )}

      {tab === "payments" && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="input w-36 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="captured">Captured</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
              <option value="created">Pending</option>
            </select>
            <button onClick={() => refetchPayments()} className="btn btn-sm btn-secondary">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {paymentsLoading ? (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading payments…</div>
          ) : paymentsError ? (
            <div className="p-8 text-center text-danger-600 dark:text-danger-400">
              Failed to load.{" "}
              <button onClick={() => refetchPayments()} className="underline">Retry</button>
            </div>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500">
              <CreditCard className="w-10 h-10 mx-auto mb-2" />
              <p>No payments found.</p>
            </div>
          ) : (
            <DataTable columns={paymentCols} data={payments} searchKey="user_id" />
          )}
        </div>
      )}

      {refundTarget && (
        <Modal
          title={`Refund Payment ${refundTarget.id.slice(0, 8)}…`}
          onClose={() => { setRefundTarget(null); setRefundReason(""); }}
          footer={
            <>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => { setRefundTarget(null); setRefundReason(""); }}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-danger"
                disabled={refundMutation.isPending}
                onClick={() => refundMutation.mutate()}
              >
                {refundMutation.isPending ? "Refunding…" : "Confirm Refund"}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This will refund ₹{Math.round(refundTarget.amount_paise / 100).toLocaleString("en-IN")} via{" "}
              {refundTarget.gateway} and revoke the subscription access it granted. This cannot be undone.
            </p>
            <div>
              <label className="label">Reason (optional, shown in the audit log)</label>
              <textarea
                className="input w-full"
                rows={3}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="e.g. Customer requested cancellation within cooling-off period"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
