import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { moderationApi } from "@/lib/api";
import DataTable from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { ShieldCheck, RefreshCw } from "lucide-react";

interface ContentReport {
  id: string;
  reporter_id: string;
  target_type: "chat_message" | "chat_room" | "battle_player" | "user_profile";
  target_user_id: string;
  target_ref_id: string | null;
  reason: string;
  details: string | null;
  content_snapshot: string | null;
  status: "pending" | "actioned" | "dismissed";
  resolved_by: string | null;
  resolution_action: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
}

const statusColor: Record<string, string> = {
  pending: "badge-warning",
  actioned: "badge-success",
  dismissed: "badge-gray",
};

const targetTypeLabel: Record<string, string> = {
  chat_message: "Chat message",
  chat_room: "Chat room",
  battle_player: "Battle opponent",
  user_profile: "User profile",
};

export default function ModerationPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"pending" | "actioned" | "dismissed" | "">("pending");
  const [reviewTarget, setReviewTarget] = useState<ContentReport | null>(null);
  const [note, setNote] = useState("");
  const [muteHours, setMuteHours] = useState(24);

  const { data: reports = [], isLoading, isError, refetch } = useQuery<ContentReport[]>({
    queryKey: ["moderation-reports", statusFilter],
    queryFn: () =>
      moderationApi.listReports(statusFilter ? { status: statusFilter } : {}).then((r) => r.data),
  });

  const resolveMutation = useMutation({
    mutationFn: (action: "dismiss" | "warn" | "mute" | "deactivate") =>
      moderationApi.resolveReport(reviewTarget!.id, {
        action,
        note: note || undefined,
        mute_hours: action === "mute" ? muteHours : undefined,
      }),
    onSuccess: () => {
      toast.success("Report resolved.");
      qc.invalidateQueries({ queryKey: ["moderation-reports"] });
      setReviewTarget(null);
      setNote("");
    },
    onError: (e: any) => {
      const detail = e?.response?.data?.detail;
      toast.error(detail ?? "Could not reach the server to resolve this report.");
    },
  });

  const cols = [
    {
      header: "Reported",
      accessor: (r: ContentReport) => (
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {new Date(r.created_at).toLocaleString("en-IN")}
        </span>
      ),
    },
    {
      header: "Type",
      accessor: (r: ContentReport) => targetTypeLabel[r.target_type] ?? r.target_type,
    },
    {
      header: "Reason",
      accessor: (r: ContentReport) => <span className="badge badge-info capitalize">{r.reason.replace(/_/g, " ")}</span>,
    },
    {
      header: "Reported User",
      accessor: (r: ContentReport) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{r.target_user_id.slice(0, 8)}…</span>
      ),
    },
    {
      header: "Reporter",
      accessor: (r: ContentReport) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{r.reporter_id.slice(0, 8)}…</span>
      ),
    },
    {
      header: "Status",
      accessor: (r: ContentReport) => (
        <span className={`badge ${statusColor[r.status] ?? "badge-gray"}`}>{r.status}</span>
      ),
    },
    {
      header: "Actions",
      accessor: (r: ContentReport) =>
        r.status === "pending" ? (
          <button className="btn btn-sm btn-secondary" onClick={() => setReviewTarget(r)}>
            Review
          </button>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {r.resolution_action} by {r.resolved_by?.slice(0, 8)}…
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Moderation</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Abuse reports filed against chat messages, rooms, battle opponents, or profiles
          </p>
        </div>
        <button onClick={() => refetch()} className="btn btn-sm btn-secondary">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="input w-40 text-sm"
          >
            <option value="pending">Pending</option>
            <option value="actioned">Actioned</option>
            <option value="dismissed">Dismissed</option>
            <option value="">All</option>
          </select>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading reports…</div>
        ) : isError ? (
          <div className="p-8 text-center text-danger-600 dark:text-danger-400">
            Failed to load.{" "}
            <button onClick={() => refetch()} className="underline">Retry</button>
          </div>
        ) : reports.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No reports" description="Reports filed by students will appear here for review." />
        ) : (
          <DataTable columns={cols} data={reports} pageSize={20} />
        )}
      </div>

      {reviewTarget && (
        <Modal
          title="Review Report"
          onClose={() => { setReviewTarget(null); setNote(""); }}
          size="lg"
          footer={
            <>
              <button
                className="btn btn-sm btn-secondary"
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate("dismiss")}
              >
                Dismiss
              </button>
              <button
                className="btn btn-sm btn-secondary"
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate("warn")}
              >
                Warn Only
              </button>
              <button
                className="btn btn-sm btn-secondary"
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate("mute")}
              >
                Mute {muteHours}h
              </button>
              <button
                className="btn btn-sm btn-danger"
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate("deactivate")}
              >
                Deactivate Account
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-gray-400 dark:text-gray-500 text-xs">Reported type</div>
                <div>{targetTypeLabel[reviewTarget.target_type] ?? reviewTarget.target_type}</div>
              </div>
              <div>
                <div className="text-gray-400 dark:text-gray-500 text-xs">Reason</div>
                <div className="capitalize">{reviewTarget.reason.replace(/_/g, " ")}</div>
              </div>
              <div>
                <div className="text-gray-400 dark:text-gray-500 text-xs">Reported user</div>
                <div className="font-mono text-xs">{reviewTarget.target_user_id}</div>
              </div>
              <div>
                <div className="text-gray-400 dark:text-gray-500 text-xs">Reporter</div>
                <div className="font-mono text-xs">{reviewTarget.reporter_id}</div>
              </div>
            </div>
            {reviewTarget.details && (
              <div>
                <div className="text-gray-400 dark:text-gray-500 text-xs mb-1">Reporter's note</div>
                <p className="text-sm bg-gray-50 dark:bg-gray-900/40 rounded-lg p-3">{reviewTarget.details}</p>
              </div>
            )}
            {reviewTarget.content_snapshot && (
              <div>
                <div className="text-gray-400 dark:text-gray-500 text-xs mb-1">Reported message content</div>
                <p className="text-sm bg-gray-50 dark:bg-gray-900/40 rounded-lg p-3 font-mono">{reviewTarget.content_snapshot}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Mute duration (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  className="input w-full"
                  value={muteHours}
                  onChange={(e) => setMuteHours(Number(e.target.value))}
                />
              </div>
            </div>
            <div>
              <label className="label">Admin note (optional, shown in audit log)</label>
              <textarea
                className="input w-full"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Confirmed via chat log, first offense"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
