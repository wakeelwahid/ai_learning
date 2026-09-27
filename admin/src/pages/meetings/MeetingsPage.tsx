import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  X,
} from "lucide-react";
import { meetingsApi, type MeetingRequest, type MeetingStatus, type MeetingUpdate } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import Modal from "@/components/ui/Modal";
import Tabs from "@/components/ui/Tabs";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import Pagination from "@/components/ui/Pagination";

const PAGE_SIZE = 20;

type StatusTab = MeetingStatus | "all";

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "declined", label: "Declined" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const STATUS_BADGE: Record<MeetingStatus, BadgeVariant> = {
  pending: "warning",
  confirmed: "info",
  completed: "success",
  declined: "danger",
  cancelled: "gray",
};

interface MeetingsResult {
  rows: MeetingRequest[];
  total: number | null;
}

function normalizeList(data: unknown): MeetingsResult {
  if (Array.isArray(data)) return { rows: data as MeetingRequest[], total: null };
  const obj = (data ?? {}) as Record<string, unknown>;
  const rows = (obj.items ?? obj.meetings ?? obj.data ?? obj.results ?? []) as MeetingRequest[];
  const total = typeof obj.total === "number" ? obj.total : null;
  return { rows: Array.isArray(rows) ? rows : [], total };
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function StatusChip({ status }: { status: MeetingStatus }) {
  return (
    <Badge variant={STATUS_BADGE[status] ?? "gray"} className="capitalize">
      {status}
    </Badge>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50 dark:border-gray-800">
      {[32, 32, 36, 44, 20, 36, 40].map((w, i) => (
        <td key={i} className="table-td">
          <div
            className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
            style={{ width: `${w * 4}px`, maxWidth: "100%" }}
          />
        </td>
      ))}
    </tr>
  );
}

interface ConfirmModalProps {
  meeting: MeetingRequest;
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: MeetingUpdate) => void;
}

function ConfirmModal({ meeting, pending, onClose, onSubmit }: ConfirmModalProps) {
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocal(meeting.scheduled_at ?? meeting.preferred_at));
  const [link, setLink] = useState(meeting.meeting_link ?? "");
  const [note, setNote] = useState(meeting.admin_note ?? "");
  const [errors, setErrors] = useState<{ scheduledAt?: string; link?: string }>({});

  const submit = () => {
    const nextErrors: typeof errors = {};
    const iso = fromDatetimeLocal(scheduledAt);
    if (!iso) nextErrors.scheduledAt = "Pick a valid date and time.";
    const trimmedLink = link.trim();
    if (trimmedLink && !isValidUrl(trimmedLink)) nextErrors.link = "Enter a valid http(s) URL.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !iso) return;
    const body: MeetingUpdate = { status: "confirmed", scheduled_at: iso };
    if (trimmedLink) body.meeting_link = trimmedLink;
    if (note.trim()) body.admin_note = note.trim();
    onSubmit(body);
  };

  return (
    <Modal
      title="Confirm meeting"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} isLoading={pending}>
            <Check className="w-4 h-4" />
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-0.5">
          <p>
            <span className="text-gray-500 dark:text-gray-400">Parent:</span>{" "}
            <span className="font-medium text-gray-900 dark:text-gray-100">{meeting.parent_name ?? "—"}</span>
          </p>
          <p>
            <span className="text-gray-500 dark:text-gray-400">Student:</span>{" "}
            <span className="font-medium text-gray-900 dark:text-gray-100">{meeting.student_name ?? "—"}</span>
          </p>
          <p>
            <span className="text-gray-500 dark:text-gray-400">Topic:</span>{" "}
            <span className="font-medium text-gray-900 dark:text-gray-100 break-words">{meeting.topic}</span>
          </p>
          <p>
            <span className="text-gray-500 dark:text-gray-400">Preferred:</span>{" "}
            {formatDateTime(meeting.preferred_at)}
          </p>
        </div>
        <Input
          label="Scheduled time"
          type="datetime-local"
          required
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          error={errors.scheduledAt}
          helperText="Defaults to the parent's preferred time."
        />
        <Input
          label="Meeting link"
          type="url"
          placeholder="https://meet.google.com/…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          error={errors.link}
        />
        <Textarea
          label="Note to parent"
          rows={3}
          placeholder="Optional"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}

interface DeclineModalProps {
  meeting: MeetingRequest;
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: MeetingUpdate) => void;
}

function DeclineModal({ meeting, pending, onClose, onSubmit }: DeclineModalProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();

  const submit = () => {
    const trimmed = note.trim();
    if (!trimmed) {
      setError("A note is required so the parent knows why.");
      return;
    }
    setError(undefined);
    onSubmit({ status: "declined", admin_note: trimmed });
  };

  return (
    <Modal
      title="Decline meeting request"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={submit} isLoading={pending}>
            <X className="w-4 h-4" />
            Decline
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Declining <span className="font-medium text-gray-900 dark:text-gray-100">{meeting.parent_name ?? "this parent"}</span>
          &rsquo;s request about{" "}
          <span className="font-medium text-gray-900 dark:text-gray-100 break-words">{meeting.topic}</span>.
        </p>
        <Textarea
          label="Reason"
          required
          rows={4}
          placeholder="Sent to the parent with the decline notification"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={error}
        />
      </div>
    </Modal>
  );
}

interface MeetingRowProps {
  meeting: MeetingRequest;
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
  onComplete: () => void;
}

function MeetingRow({ meeting, busy, onConfirm, onDecline, onComplete }: MeetingRowProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const hasNotes = !!meeting.notes?.trim();

  return (
    <tr className="table-row-hover align-top">
      <td className="table-td">
        <p className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[140px]">
          {meeting.parent_name ?? <span className="text-gray-400 italic">—</span>}
        </p>
      </td>
      <td className="table-td">
        <p className="text-gray-700 dark:text-gray-200 truncate max-w-[140px]">
          {meeting.student_name ?? <span className="text-gray-400 italic">—</span>}
        </p>
      </td>
      <td className="table-td text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
        {formatDateTime(meeting.preferred_at)}
      </td>
      <td className="table-td">
        <div className="min-w-[160px] max-w-[260px]">
          <p className="text-gray-900 dark:text-gray-100 break-words">{meeting.topic}</p>
          {hasNotes && (
            <button
              type="button"
              onClick={() => setNotesOpen((o) => !o)}
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
              aria-expanded={notesOpen}
            >
              {notesOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {notesOpen ? "Hide notes" : "Show notes"}
            </button>
          )}
          {hasNotes && notesOpen && (
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words">
              {meeting.notes}
            </p>
          )}
          {meeting.admin_note && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-words">
              <span className="font-medium">Admin note:</span> {meeting.admin_note}
            </p>
          )}
        </div>
      </td>
      <td className="table-td">
        <StatusChip status={meeting.status} />
      </td>
      <td className="table-td text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
        <div className="flex flex-col gap-1">
          <span>{formatDateTime(meeting.scheduled_at)}</span>
          {meeting.meeting_link && (
            <a
              href={meeting.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Link
            </a>
          )}
        </div>
      </td>
      <td className="table-td">
        <div className="flex flex-wrap items-center gap-1.5">
          {meeting.status === "pending" && (
            <>
              <Button size="sm" onClick={onConfirm} disabled={busy} className="whitespace-nowrap">
                <Check className="w-3.5 h-3.5" />
                Confirm
              </Button>
              <Button variant="danger" size="sm" onClick={onDecline} disabled={busy} className="whitespace-nowrap">
                <X className="w-3.5 h-3.5" />
                Decline
              </Button>
            </>
          )}
          {meeting.status === "confirmed" && (
            <Button variant="secondary" size="sm" onClick={onComplete} disabled={busy} className="whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Mark completed
            </Button>
          )}
          {meeting.status !== "pending" && meeting.status !== "confirmed" && (
            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function MeetingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<StatusTab>("pending");
  const [page, setPage] = useState(0);
  const [confirmTarget, setConfirmTarget] = useState<MeetingRequest | null>(null);
  const [declineTarget, setDeclineTarget] = useState<MeetingRequest | null>(null);

  const { data, isLoading, isError, isFetching, refetch } = useQuery<MeetingsResult>({
    queryKey: ["admin-meetings", tab, page],
    queryFn: () =>
      meetingsApi
        .list({
          status: tab === "all" ? undefined : tab,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        })
        .then((r) => normalizeList(r.data)),
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? null;
  const totalPages =
    total !== null
      ? Math.max(1, Math.ceil(total / PAGE_SIZE))
      : rows.length === PAGE_SIZE
        ? page + 2
        : page + 1;

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: MeetingUpdate }) => meetingsApi.update(id, body),
    onSuccess: (_res, { body }) => {
      const label =
        body.status === "confirmed"
          ? "Meeting confirmed"
          : body.status === "declined"
            ? "Meeting request declined"
            : body.status === "completed"
              ? "Meeting marked as completed"
              : "Meeting updated";
      toast.success(label);
      setConfirmTarget(null);
      setDeclineTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-meetings"] });
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const changeTab = (key: string) => {
    setTab(key as StatusTab);
    setPage(0);
  };

  const summary =
    total !== null
      ? `${total} request${total === 1 ? "" : "s"} · page ${page + 1} of ${totalPages}`
      : `Page ${page + 1}`;

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary-600 dark:text-primary-400 shrink-0" />
            Meetings
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Parent meeting requests — confirm, decline, or mark as completed
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn btn-sm btn-secondary self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <Tabs tabs={STATUS_TABS} active={tab} onChange={changeTab} className="px-2 min-w-max" />
        </div>

        {!isLoading && !isError && (
          <div className="px-5 py-2 border-b border-gray-50 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 text-xs text-gray-500 dark:text-gray-400">
            {summary}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="table-th">Parent</th>
                <th className="table-th">Student</th>
                <th className="table-th">Preferred time</th>
                <th className="table-th">Topic</th>
                <th className="table-th">Status</th>
                <th className="table-th">Scheduled time</th>
                <th className="table-th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-danger-600 dark:text-danger-400 text-sm">
                    Failed to load meeting requests.{" "}
                    <button onClick={() => refetch()} className="underline font-medium">
                      Retry
                    </button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <CalendarDays className="mx-auto w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">
                      {tab === "all" ? "No meeting requests yet" : `No ${tab} meeting requests`}
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((m) => (
                  <MeetingRow
                    key={m.id}
                    meeting={m}
                    busy={updateMutation.isPending}
                    onConfirm={() => setConfirmTarget(m)}
                    onDecline={() => setDeclineTarget(m)}
                    onComplete={() => updateMutation.mutate({ id: m.id, body: { status: "completed" } })}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && !isError && (
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} summary={summary} />
        )}
      </div>

      {confirmTarget && (
        <ConfirmModal
          meeting={confirmTarget}
          pending={updateMutation.isPending}
          onClose={() => setConfirmTarget(null)}
          onSubmit={(body) => updateMutation.mutate({ id: confirmTarget.id, body })}
        />
      )}

      {declineTarget && (
        <DeclineModal
          meeting={declineTarget}
          pending={updateMutation.isPending}
          onClose={() => setDeclineTarget(null)}
          onSubmit={(body) => updateMutation.mutate({ id: declineTarget.id, body })}
        />
      )}
    </div>
  );
}
