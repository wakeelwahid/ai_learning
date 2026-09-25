import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditLogApi } from "@/lib/api";
import DataTable from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { History, RefreshCw } from "lucide-react";

interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  result: string;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  service: "auth_service" | "payment_service";
}

const resultColor: Record<string, string> = {
  success: "badge-success",
  denied: "badge-danger",
  failure: "badge-danger",
};

const serviceColor: Record<string, string> = {
  auth_service: "badge-info",
  payment_service: "badge-warning",
};

export default function AuditLogPage() {
  const [actionFilter, setActionFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState<"" | "auth_service" | "payment_service">("");

  const { data: authLogs = [], isLoading: authLoading, isError: authError, refetch: refetchAuth } = useQuery<AuditLogEntry[]>({
    queryKey: ["audit-logs-auth", actionFilter],
    queryFn: () =>
      auditLogApi.listAuth(actionFilter ? { action: actionFilter } : {}).then((r) => r.data),
    enabled: serviceFilter !== "payment_service",
  });

  const { data: paymentLogs = [], isLoading: paymentLoading, isError: paymentError, refetch: refetchPayment } = useQuery<AuditLogEntry[]>({
    queryKey: ["audit-logs-payment", actionFilter],
    queryFn: () =>
      auditLogApi.listPayment(actionFilter ? { action: actionFilter } : {}).then((r) => r.data),
    enabled: serviceFilter !== "auth_service",
  });

  const isLoading = (serviceFilter !== "payment_service" && authLoading) || (serviceFilter !== "auth_service" && paymentLoading);
  const isError = (serviceFilter !== "payment_service" && authError) || (serviceFilter !== "auth_service" && paymentError);

  const merged = useMemo(() => {
    const rows: AuditLogEntry[] = [];
    if (serviceFilter !== "payment_service") rows.push(...authLogs);
    if (serviceFilter !== "auth_service") rows.push(...paymentLogs);
    return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [authLogs, paymentLogs, serviceFilter]);

  const refetch = () => {
    if (serviceFilter !== "payment_service") refetchAuth();
    if (serviceFilter !== "auth_service") refetchPayment();
  };

  const cols = [
    {
      header: "Time",
      accessor: (r: AuditLogEntry) => (
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {new Date(r.created_at).toLocaleString("en-IN")}
        </span>
      ),
    },
    {
      header: "Service",
      accessor: (r: AuditLogEntry) => (
        <span className={`badge ${serviceColor[r.service] ?? "badge-gray"}`}>{r.service}</span>
      ),
    },
    {
      header: "Action",
      accessor: (r: AuditLogEntry) => <span className="font-mono text-xs">{r.action}</span>,
    },
    {
      header: "Actor",
      accessor: (r: AuditLogEntry) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
          {r.actor_id ? `${r.actor_id.slice(0, 8)}…` : "—"}
          {r.actor_role ? ` (${r.actor_role})` : ""}
        </span>
      ),
    },
    {
      header: "Resource",
      accessor: (r: AuditLogEntry) =>
        r.resource_type ? (
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {r.resource_type}
            {r.resource_id ? `:${r.resource_id.slice(0, 8)}…` : ""}
          </span>
        ) : (
          "—"
        ),
    },
    {
      header: "Result",
      accessor: (r: AuditLogEntry) => (
        <span className={`badge ${resultColor[r.result] ?? "badge-gray"}`}>{r.result}</span>
      ),
    },
    {
      header: "IP",
      accessor: (r: AuditLogEntry) => r.ip_address ?? "—",
    },
    {
      header: "Details",
      accessor: (r: AuditLogEntry) =>
        r.metadata && Object.keys(r.metadata).length > 0 ? (
          <code className="text-xs text-gray-500 dark:text-gray-500 max-w-xs truncate block" title={JSON.stringify(r.metadata)}>
            {JSON.stringify(r.metadata)}
          </code>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Audit Log</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Every admin-initiated security or billing action, across services
          </p>
        </div>
        <button onClick={refetch} className="btn btn-sm btn-secondary">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value as typeof serviceFilter)}
            className="input w-44 text-sm"
          >
            <option value="">All Services</option>
            <option value="auth_service">Auth Service</option>
            <option value="payment_service">Payment Service</option>
          </select>
          <input
            className="input w-56 text-sm"
            placeholder="Filter by action (e.g. user_deactivated)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading audit log…</div>
        ) : isError ? (
          <div className="p-8 text-center text-danger-600 dark:text-danger-400">
            Failed to load.{" "}
            <button onClick={refetch} className="underline">Retry</button>
          </div>
        ) : merged.length === 0 ? (
          <EmptyState icon={History} title="No audit log entries" description="Admin actions will appear here as they happen." />
        ) : (
          <DataTable columns={cols} data={merged} pageSize={25} />
        )}
      </div>
    </div>
  );
}
