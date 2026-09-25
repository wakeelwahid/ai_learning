import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { contactApi } from "@/lib/api";
import DataTable from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { Mail, MailOpen, RefreshCw } from "lucide-react";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function ContactMessagesPage() {
  const qc = useQueryClient();
  const [readFilter, setReadFilter] = useState<"unread" | "read" | "">("unread");
  const [viewTarget, setViewTarget] = useState<ContactMessage | null>(null);

  const { data: messages = [], isLoading, isError, refetch } = useQuery<ContactMessage[]>({
    queryKey: ["contact-messages", readFilter],
    queryFn: () =>
      contactApi
        .list(readFilter ? { is_read: readFilter === "read" } : {})
        .then((r) => r.data),
  });

  const markReadMutation = useMutation({
    mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) => contactApi.markRead(id, isRead),
    onSuccess: (_res, { isRead }) => {
      toast.success(isRead ? "Marked as read." : "Marked as unread.");
      qc.invalidateQueries({ queryKey: ["contact-messages"] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.detail ?? "Could not update this message.");
    },
  });

  const openMessage = (m: ContactMessage) => {
    setViewTarget(m);
    if (!m.is_read) markReadMutation.mutate({ id: m.id, isRead: true });
  };

  const cols = [
    {
      header: "Received",
      accessor: (m: ContactMessage) => (
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {new Date(m.created_at).toLocaleString("en-IN")}
        </span>
      ),
    },
    {
      header: "From",
      accessor: (m: ContactMessage) => (
        <div className="min-w-0">
          <p className="text-sm text-gray-900 dark:text-white truncate">{m.name}</p>
          <p className="text-xs text-gray-400 truncate">{m.email}</p>
        </div>
      ),
    },
    {
      header: "Subject",
      accessor: (m: ContactMessage) => <span className="text-sm">{m.subject}</span>,
    },
    {
      header: "Status",
      accessor: (m: ContactMessage) => (
        <span className={`badge ${m.is_read ? "badge-gray" : "badge-warning"}`}>
          {m.is_read ? "Read" : "Unread"}
        </span>
      ),
    },
    {
      header: "Actions",
      accessor: (m: ContactMessage) => (
        <button className="btn btn-sm btn-secondary" onClick={() => openMessage(m)}>
          {m.is_read ? "View" : "Read"}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Contact Messages</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Submissions from the public Contact Us page
          </p>
        </div>
        <button onClick={() => refetch()} className="btn btn-sm btn-secondary">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
          <select
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value as typeof readFilter)}
            className="input w-40 text-sm"
          >
            <option value="unread">Unread</option>
            <option value="read">Read</option>
            <option value="">All</option>
          </select>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading messages…</div>
        ) : isError ? (
          <div className="p-8 text-center text-danger-600 dark:text-danger-400">
            Failed to load.{" "}
            <button onClick={() => refetch()} className="underline">Retry</button>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState icon={Mail} title="No messages" description="Contact form submissions will appear here." />
        ) : (
          <DataTable columns={cols} data={messages} pageSize={20} />
        )}
      </div>

      {viewTarget && (
        <Modal
          title={viewTarget.subject}
          onClose={() => setViewTarget(null)}
          size="lg"
          footer={
            <button
              className="btn btn-sm btn-secondary"
              disabled={markReadMutation.isPending}
              onClick={() => {
                markReadMutation.mutate({ id: viewTarget.id, isRead: !viewTarget.is_read });
                setViewTarget(null);
              }}
            >
              <MailOpen className="w-3.5 h-3.5" />
              Mark as {viewTarget.is_read ? "unread" : "read"}
            </button>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-gray-400 dark:text-gray-500 text-xs">From</div>
                <div>{viewTarget.name}</div>
              </div>
              <div>
                <div className="text-gray-400 dark:text-gray-500 text-xs">Email</div>
                <div>
                  <a href={`mailto:${viewTarget.email}`} className="text-primary-600 hover:underline">
                    {viewTarget.email}
                  </a>
                </div>
              </div>
              <div>
                <div className="text-gray-400 dark:text-gray-500 text-xs">Received</div>
                <div>{new Date(viewTarget.created_at).toLocaleString("en-IN")}</div>
              </div>
            </div>
            <div>
              <div className="text-gray-400 dark:text-gray-500 text-xs mb-1">Message</div>
              <p className="text-sm bg-gray-50 dark:bg-gray-900/40 rounded-lg p-3 whitespace-pre-wrap">
                {viewTarget.message}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
