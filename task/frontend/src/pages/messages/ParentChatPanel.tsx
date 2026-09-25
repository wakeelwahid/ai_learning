import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Send, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { messageApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { Avatar } from "@/components/ui";
import { useLinkedParents, type ParentLink } from "@/hooks/useLinkedParents";

// Inline "family" thread rendered inside MessagesPage's right panel, kept
// separate from the friend-chat rightPanel (WS-driven, chatApi rooms) since
// this polls the unrelated messages table via `/v1/users/messages/*`
// (see ParentMessagesPage.tsx for the parent-side mirror of this same API).

interface ChatMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  isOptimistic?: boolean;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function relationshipLabel(link: ParentLink | undefined | null): string {
  if (!link?.relationship) return "Parent";
  const r = link.relationship.trim();
  return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
}

export default function ParentChatPanel({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const { parents, approvedParents } = useLinkedParents();
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedParentId && approvedParents.length > 0) {
      setSelectedParentId(approvedParents[0].parent_user_id);
    }
  }, [approvedParents, selectedParentId]);

  const activeParentId = selectedParentId ?? approvedParents[0]?.parent_user_id ?? "";
  const activeLink = parents.find(p => p.parent_user_id === activeParentId);
  const activeParentName = activeLink?.parent_name ?? "Parent";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [lastFetchedAt, setLastFetchedAt] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const load = useCallback(async () => {
    if (!studentId || !activeParentId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await messageApi.getThread(activeParentId, studentId);
      const data: ChatMessage[] = res.data ?? [];
      setMessages(data);
      if (data.length > 0) setLastFetchedAt(data[data.length - 1].created_at);
    } catch (err) {
      setMessages([]);
      setLoadError(parseApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, [studentId, activeParentId]);

  useEffect(() => {
    if (!studentId || !activeParentId) return;
    setMessages([]);
    setLastFetchedAt(undefined);
    load();
  }, [studentId, activeParentId, load]);

  // Aligned with StudentMessagesScreen.tsx's POLL_INTERVAL_MS on mobile so
  // both platforms surface new parent messages at the same cadence.
  useEffect(() => {
    if (!studentId || !activeParentId) return;

    intervalRef.current = setInterval(async () => {
      try {
        const res = await messageApi.getThread(activeParentId, studentId, lastFetchedAt);
        const newMsgs: ChatMessage[] = res.data ?? [];
        if (newMsgs.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const unique = newMsgs.filter((m) => !existingIds.has(m.id));
            return unique.length > 0 ? [...prev, ...unique] : prev;
          });
          setLastFetchedAt(newMsgs[newMsgs.length - 1].created_at);
        }
      } catch {
        // Silently ignore poll errors
      }
    }, 12_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [studentId, activeParentId, lastFetchedAt]);

  const handleSend = async () => {
    const trimmed = newMessage.trim();
    if (!trimmed || !studentId || !activeParentId) return;

    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      sender_id: studentId,
      recipient_id: activeParentId,
      content: trimmed,
      is_read: false,
      created_at: new Date().toISOString(),
      isOptimistic: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    setNewMessage("");

    try {
      const res = await messageApi.send(activeParentId, studentId, trimmed);
      const saved: ChatMessage = res.data;
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? { ...saved } : m)));
      setLastFetchedAt(saved.created_at);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      toast.error(parseApiError(err));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-gray-50 dark:bg-gray-950 min-w-0">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <button
          onClick={onBack}
          className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Avatar name={activeParentName} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{activeParentName}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 capitalize">{relationshipLabel(activeLink)}</p>
        </div>
        {approvedParents.length > 1 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {approvedParents.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedParentId(p.parent_user_id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                  p.parent_user_id === activeParentId
                    ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                }`}
              >
                {p.parent_name ?? "Parent"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <AlertCircle className="w-10 h-10 text-danger-400 mb-2" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{loadError}</p>
            <button
              onClick={load}
              className="mt-3 px-4 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-14 h-14 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-3">
              <Send className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-400 mt-1">Send a message to start the conversation.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === studentId;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                {!isMine && <Avatar name={activeParentName} size="sm" className="mr-2 mt-1 flex-shrink-0" />}
                <div
                  className={`max-w-xs lg:max-w-md rounded-2xl px-3.5 py-2.5 ${
                    isMine
                      ? `bg-emerald-500 text-white rounded-br-sm ${msg.isOptimistic ? "opacity-70" : ""}`
                      : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm border border-gray-100 dark:border-gray-700"
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${isMine ? "text-emerald-100" : "text-gray-400"}`}>
                    {formatTime(msg.created_at)}
                    {msg.isOptimistic && " · Sending…"}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-end gap-2.5">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${activeParentName}…`}
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-2xl border-0 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 overflow-y-auto"
            style={{ minHeight: "42px", maxHeight: "96px" }}
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || !activeParentId}
            className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
