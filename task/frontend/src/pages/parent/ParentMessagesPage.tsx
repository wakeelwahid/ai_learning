import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import toast from "react-hot-toast";
import { messageApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { Avatar, Button } from "@/components/ui";
import { useSelectedChild } from "@/hooks/useSelectedChild";
import { ChildSelector, NoChildrenState, PendingChildState } from "@/components/parent/ChildSelector";

// ── Types ─────────────────────────────────────────────────────────────────────
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
    if (diff < 86400000) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ParentMessagesPage() {
  const {
    parentId,
    children,
    selectedChild,
    selectedChildId,
    setSelectedChildId,
    isLoading: childrenLoading,
  } = useSelectedChild();

  const canChat = selectedChild?.is_approved === true;
  const studentId   = canChat ? selectedChild!.student_user_id : "";
  const studentName = selectedChild?.student_name ?? "Student";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [lastFetchedAt, setLastFetchedAt] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!parentId || !studentId) return;
    setIsLoading(true);
    setMessages([]);
    setLastFetchedAt(undefined);

    const load = async () => {
      try {
        const res = await messageApi.getThread(studentId, parentId);
        const data: ChatMessage[] = res.data ?? [];
        setMessages(data);
        if (data.length > 0) {
          const latest = data[data.length - 1];
          setLastFetchedAt(latest.created_at);
        }
      } catch (err) {
        setMessages([]);
        toast.error(parseApiError(err));
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [parentId, studentId]);

  useEffect(() => {
    if (!parentId || !studentId) return;

    intervalRef.current = setInterval(async () => {
      try {
        const res = await messageApi.getThread(studentId, parentId, lastFetchedAt);
        const newMsgs: ChatMessage[] = res.data ?? [];
        if (newMsgs.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const unique = newMsgs.filter((m) => !existingIds.has(m.id));
            return unique.length > 0 ? [...prev, ...unique] : prev;
          });
          const latest = newMsgs[newMsgs.length - 1];
          setLastFetchedAt(latest.created_at);
        }
      } catch {
        // Silently ignore poll errors
      }
    }, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [parentId, studentId, lastFetchedAt]);

  const handleSend = async () => {
    const trimmed = newMessage.trim();
    if (!trimmed || !parentId || !studentId) return;

    // Optimistic update
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      sender_id: parentId,
      recipient_id: studentId,
      content: trimmed,
      is_read: false,
      created_at: new Date().toISOString(),
      isOptimistic: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    setNewMessage("");

    try {
      const res = await messageApi.send(studentId, parentId, trimmed);
      const saved: ChatMessage = res.data;
      // Replace optimistic message with real one
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...saved } : m))
      );
      setLastFetchedAt(saved.created_at);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      toast.error(parseApiError(err));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-1rem)] -m-4 md:-m-6 overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <Link
          to="/parent/dashboard"
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <Avatar name={studentName} size="md" className="flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Chat with {studentName}
            </p>
          </div>
        </div>
      </div>

      {children.length > 1 && (
        <div className="bg-white dark:bg-gray-900 flex-shrink-0">
          <ChildSelector children={children} selectedChildId={selectedChildId} onSelect={setSelectedChildId} showAdd={false} compact />
        </div>
      )}

      {!childrenLoading && children.length === 0 ? (
        <div className="flex-1 overflow-y-auto p-4"><NoChildrenState /></div>
      ) : selectedChild && !selectedChild.is_approved ? (
        <div className="flex-1 overflow-y-auto p-4"><PendingChildState child={selectedChild} /></div>
      ) : (
      <>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoading || childrenLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-14 h-14 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mb-3">
              <Send className="w-6 h-6 text-primary-400" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-400 mt-1">Send a message to start the conversation.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === parentId;
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                {!isMine && (
                  <Avatar name={studentName} size="sm" className="mr-2 mt-1 flex-shrink-0" />
                )}
                <div
                  className={`max-w-xs lg:max-w-md rounded-2xl px-3.5 py-2.5 ${
                    isMine
                      ? `bg-primary-600 text-white rounded-br-sm ${msg.isOptimistic ? "opacity-70" : ""}`
                      : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm border border-gray-100 dark:border-gray-700"
                  }`}
                >
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                  <p
                    className={`text-[10px] mt-1 ${
                      isMine ? "text-primary-200" : "text-gray-400"
                    }`}
                  >
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

      {/* Input area */}
      <div className="px-4 py-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${studentName}…`}
            className="flex-1 px-3.5 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          <Button
            onClick={handleSend}
            disabled={!newMessage.trim() || !canChat}
            className="w-10 h-10 !p-0 flex-shrink-0"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
