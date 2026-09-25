import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  MessageSquare,
  Send,
  ArrowLeft,
  Search,
  Settings,
  Edit3,
  Check,
  CheckCheck,
  Info,
  X,
  Plus,
  UserPlus,
  CornerUpLeft,
  ChevronRight,
  CheckCircle,
  Trophy,
  TrendingUp,
  Award,
  Flag,
  Zap,
} from "lucide-react";
import { chatApi, gamificationApi } from "@/lib/api";
import ChallengeFriendModal from "@/components/growth/ChallengeFriendModal";
import { avatarUrlFor } from "@/components/UserAvatar";
import { useAppSelector } from "@/store";
import { useWebSocket, WsMessage } from "@/hooks/useWebSocket";
import { useLinkedParents } from "@/hooks/useLinkedParents";
import ParentChatPanel, { relationshipLabel } from "./ParentChatPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageStatus = "sending" | "sent" | "delivered" | "read";

interface ReactionSummary {
  emoji: string;
  count: number;
  key: string;
  userReacted: boolean;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName?: string;
  content: string;
  createdAt: string; // ISO string
  status: MessageStatus;
  isOwn: boolean;
  replyToPreview?: { senderName: string; content: string };
  reactions?: ReactionSummary[];
}

interface ChatRoom {
  id: string;
  name: string;
  isGroup: boolean;
  members: { userId: string; name: string; avatarUrl?: string | null; isAdmin?: boolean }[];
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  otherUserId?: string; // for 1-1 rooms
  online?: boolean;
}

interface FriendRequest {
  id: string;
  fromUserId: string;
  // Display name of the other party (sender for incoming, recipient for outgoing)
  fromUserName: string;
  status: "pending" | "accepted" | "rejected";
  schoolName?: string | null;
  mutualFriendsCount?: number;
  createdAt?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REACTION_EMOJIS: { key: string; emoji: string }[] = [
  { key: "like",  emoji: "👍" },
  { key: "love",  emoji: "❤️" },
  { key: "haha",  emoji: "😂" },
  { key: "wow",   emoji: "😮" },
  { key: "sad",   emoji: "😢" },
  { key: "angry", emoji: "😠" },
];

const MESSAGES_LIMIT = 50;

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

function lsGetMessages(roomId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`chat_room_${roomId}`);
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

function lsSaveMessages(roomId: string, msgs: ChatMessage[]) {
  try {
    const toSave = msgs.slice(-MESSAGES_LIMIT);
    localStorage.setItem(`chat_room_${roomId}`, JSON.stringify(toSave));
  } catch {}
}

function lsGetRooms(userId: string): { rooms: ChatRoom[]; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(`chat_rooms_${userId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function lsSaveRooms(userId: string, rooms: ChatRoom[]) {
  try {
    localStorage.setItem(`chat_rooms_${userId}`, JSON.stringify({ rooms, savedAt: Date.now() }));
  } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashColor(name: string): string {
  // Solid per-identity avatar tints (no gradients, per design system) —
  // still hash-varied so different users are visually distinguishable.
  const colors = [
    "bg-rose-500",
    "bg-indigo-500",
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-cyan-600",
    "bg-pink-500",
    "bg-teal-600",
  ];
  // Direct rooms arrive with name=null from the backend (the display name
  // lives on other_user) — never let a null/missing name crash the render.
  const s = name || "?";
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) & 0xffffffff;
  }
  return colors[Math.abs(hash) % colors.length];
}

function nameInitial(name: string): string {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000)
      return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff < 172_800_000) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function formatMsgTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function dateSeparatorLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86_400_000);
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (msgDay.getTime() === today.getTime()) return "Today";
    if (msgDay.getTime() === yesterday.getTime()) return "Yesterday";
    return d.toLocaleDateString([], { month: "long", day: "numeric" });
  } catch {
    return "";
  }
}

function isSameDay(a: string, b: string): boolean {
  try {
    const da = new Date(a);
    const db = new Date(b);
    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
    );
  } catch {
    return false;
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

// Reactions arrive in two shapes: legacy array [{emoji, count, key, user_reacted}]
// and the wire-contract object map { "<key>": { count, reacted_by: [...] } }.
function normalizeReactions(raw: unknown, userId: string): ReactionSummary[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((r: any) => ({
      emoji: r.emoji,
      count: r.count ?? 0,
      key: r.key ?? r.emoji,
      userReacted: !!r.user_reacted,
    }));
  }
  const entries = Object.entries(raw as Record<string, { count?: number; reacted_by?: string[] }>);
  if (entries.length === 0) return undefined;
  return entries
    .map(([key, v]) => ({
      key,
      emoji: REACTION_EMOJIS.find((e) => e.key === key)?.emoji ?? key,
      count: v?.count ?? 0,
      userReacted: Array.isArray(v?.reacted_by) ? v.reacted_by.includes(userId) : false,
    }))
    .filter((r) => r.count > 0);
}

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const m of existing) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({
  name,
  size = "md",
  online,
  src,
  userId,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
  /** Uploaded profile photo URL — falls back to initials when absent/broken */
  src?: string | null;
  /** When set (and no src), the photo URL is derived from the user id */
  userId?: string | null;
}) {
  const [broken, setBroken] = useState(false);
  src = src ?? avatarUrlFor(userId);
  const sz =
    size === "sm"
      ? "w-8 h-8 text-sm"
      : size === "lg"
      ? "w-12 h-12 text-lg"
      : "w-10 h-10 text-base";
  return (
    <div className="relative flex-shrink-0">
      {src && !broken ? (
        <img
          src={src}
          alt={name}
          onError={() => setBroken(true)}
          className={`${sz} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`${sz} rounded-full ${hashColor(name)} flex items-center justify-center text-white font-semibold select-none`}
        >
          {nameInitial(name)}
        </div>
      )}
      {online && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-gray-900" />
      )}
    </div>
  );
}

// WhatsApp-style ticks: single ✓ sent, double ✓✓ delivered, GREEN ✓✓ seen
function StatusIcon({ status }: { status: MessageStatus }) {
  if (status === "sending")
    return <Check className="w-3 h-3 text-white/50" />;
  if (status === "sent")
    return <Check className="w-3 h-3 text-white/80" />;
  if (status === "delivered")
    return <CheckCheck className="w-3 h-3 text-white/80" />;
  if (status === "read")
    return <CheckCheck className="w-3 h-3 text-success-500" />;
  return null;
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-3 px-2">
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 rounded-full">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

function TypingIndicator({ name }: { name: string }) {
  return (
    <div className="flex items-end gap-2 mb-1">
      <Avatar name={name} size="sm" />
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-bl-none px-4 py-2.5 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
        <span className="ml-1.5 text-[10px] text-gray-400">{name} is typing…</span>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-xl shadow-lg flex items-center gap-2.5">
      <span>{message}</span>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── ReactionBar ──────────────────────────────────────────────────────────────

function ReactionBar({
  onSelect,
  onClose,
}: {
  onSelect: (key: string, emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute z-30 bottom-full mb-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-md px-2 py-1.5 flex items-center gap-1"
      onMouseLeave={onClose}
    >
      {REACTION_EMOJIS.map(({ key, emoji }) => (
        <button
          key={key}
          onClick={() => { onSelect(key, emoji); onClose(); }}
          className="text-xl hover:scale-125 transition-transform duration-100 p-0.5"
          title={key}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// ─── NewGroupModal ────────────────────────────────────────────────────────────

interface Friend {
  user_id: string;
  full_name: string;
  school_name?: string | null;
  class_number?: number | null;
  avatar_url?: string | null;
}

function NewGroupModal({
  userId,
  onClose,
  onCreated,
}: {
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [groupName, setGroupName] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Groups are friends-only: the accepted-friends list is the only member pool
  useEffect(() => {
    let cancelled = false;
    chatApi
      .getFriends()
      .then((res) => {
        if (!cancelled) setFriends(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setFriends([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingFriends(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Local filter within the loaded friends (name/school substring)
  const q = searchQ.trim().toLowerCase();
  const filteredFriends = q
    ? friends.filter(
        (f) =>
          f.full_name?.toLowerCase().includes(q) ||
          f.school_name?.toLowerCase().includes(q)
      )
    : friends;

  const toggleSelect = (u: Friend) => {
    setSelected((prev) => {
      if (prev.find((x) => x.user_id === u.user_id)) return prev.filter((x) => x.user_id !== u.user_id);
      if (prev.length >= 10) return prev;
      return [...prev, u];
    });
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selected.length < 1) {
      setError("Enter a group name and add at least 1 friend.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await chatApi.createGroup({
        name: groupName.trim(),
        created_by: userId,
        member_ids: selected.map((u) => u.user_id),
      });
      onCreated();
      onClose();
    } catch (err: any) {
      // Surface the server's detail verbatim (strangers / 10-friend cap / 3-group limit)
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to create group. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">New Group Chat</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Group name */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Physics Study Group"
              maxLength={60}
              className="w-full px-3.5 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
          </div>

          {/* Selected chips */}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <span
                  key={u.user_id}
                  className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs px-2.5 py-1 rounded-full"
                >
                  {u.full_name}
                  <button onClick={() => toggleSelect(u)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Friend picker */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Add Friends ({selected.length}/10, min 1)
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Filter friends by name or school..."
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
            </div>
            {loadingFriends ? (
              <p className="text-xs text-gray-400 mt-1.5 ml-1">Loading friends…</p>
            ) : friends.length === 0 ? (
              <p className="text-xs text-gray-400 mt-2 text-center py-3">
                No friends yet — groups are friends-only. Send some friend requests first!
              </p>
            ) : filteredFriends.length === 0 ? (
              <p className="text-xs text-gray-400 mt-2 text-center py-3">No friends match</p>
            ) : (
              <div className="mt-1.5 max-h-48 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-800">
                {filteredFriends.map((u) => {
                  const isSelected = !!selected.find((x) => x.user_id === u.user_id);
                  return (
                    <button
                      key={u.user_id}
                      onClick={() => toggleSelect(u)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                        isSelected ? "bg-emerald-50 dark:bg-emerald-900/20" : ""
                      }`}
                    >
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt={u.full_name}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <Avatar name={u.full_name} size="sm" userId={u.user_id} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {u.full_name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{u.school_name || "Student"}</p>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <button
            onClick={handleCreate}
            disabled={creating || !groupName.trim() || selected.length < 1}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {creating ? "Creating…" : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FriendActivityModal ──────────────────────────────────────────────────────

interface FriendTimelineItem {
  id: string;
  user_id: string;
  activity_type: "quiz_completed" | "battle_won" | "level_up" | "badge_earned" | "daily_goal_completed";
  title: string | null;
  subject: string | null;
  score_pct: number | null;
  xp_earned: number | null;
  created_at: string;
  user_name: string;
  user_avatar?: string | null;
}

const TIMELINE_CFG: Record<FriendTimelineItem["activity_type"], { icon: React.ElementType; color: string }> = {
  quiz_completed:       { icon: CheckCircle, color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" },
  battle_won:           { icon: Trophy,      color: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" },
  level_up:             { icon: TrendingUp,  color: "bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400" },
  badge_earned:         { icon: Award,       color: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" },
  daily_goal_completed: { icon: Flag,        color: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" },
};

function timelineText(a: FriendTimelineItem): string {
  switch (a.activity_type) {
    case "quiz_completed":
      return a.score_pct != null
        ? `Scored ${a.score_pct}% in ${a.title ?? "a quiz"}`
        : `Completed ${a.title ?? "a quiz"}`;
    case "battle_won":           return "Won a Battle";
    case "level_up":             return `Reached ${a.title ?? "a new level"}`;
    case "badge_earned":         return `Earned the ${a.title ?? "new"} badge`;
    case "daily_goal_completed": return "Completed today's goal";
    default:                     return "Was active";
  }
}

function timelineTimeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
    if (h < 48) return "Yesterday";
    return `${Math.floor(h / 24)} days ago`;
  } catch {
    return "";
  }
}

function FriendActivityModal({
  friendId,
  friendName,
  onClose,
}: {
  friendId: string;
  friendName: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<FriendTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    gamificationApi
      .friendTimeline(friendId, 30)
      .then((res) => {
        if (!cancelled) setItems(res.data ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        const detail = err?.response?.data?.detail;
        if (err?.response?.status === 403) {
          setError(typeof detail === "string" ? detail : "You can only view the activity of your friends.");
        } else {
          setError("Could not load activity. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [friendId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <Avatar name={friendName} size="sm" userId={friendId} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white truncate">{friendName}</h2>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">Recent activity</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          ) : error ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-10 px-4">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">No recent activity</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const cfg = TIMELINE_CFG[item.activity_type] ?? TIMELINE_CFG.quiz_completed;
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                      <cfg.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-100">{timelineText(item)}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {timelineTimeAgo(item.created_at)}
                      </p>
                    </div>
                    {item.xp_earned != null && item.xp_earned > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 flex-shrink-0">
                        <Zap className="w-2.5 h-2.5" /> +{item.xp_earned} XP
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MembersModal ─────────────────────────────────────────────────────────────

function MembersModal({
  room,
  currentUserId,
  onRenamed,
  onMemberRemoved,
  onMemberRestored,
  onLeft,
  onDeleted,
  onClose,
}: {
  room: ChatRoom;
  currentUserId: string;
  onRenamed: (roomId: string, name: string) => void;
  onMemberRemoved: (roomId: string, memberId: string) => void;
  onMemberRestored: (roomId: string, member: ChatRoom["members"][number]) => void;
  onLeft: (roomId: string) => void;
  onDeleted: (roomId: string) => void;
  onClose: () => void;
}) {
  const members = room.members;
  const isAdmin = members.find((m) => m.userId === currentUserId)?.isAdmin === true;

  const [nameInput, setNameInput] = useState(room.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const trimmedName = nameInput.trim();
  const nameChanged = trimmedName.length > 0 && trimmedName.length <= 100 && trimmedName !== room.name;

  const handleRename = async () => {
    if (!nameChanged || saving) return;
    setSaving(true);
    setError("");
    try {
      await chatApi.renameGroup(room.id, trimmedName);
      onRenamed(room.id, trimmedName);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to rename group.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    const removed = members.find((m) => m.userId === memberId);
    setConfirmRemoveId(null);
    setError("");
    onMemberRemoved(room.id, memberId); // optimistic
    try {
      await chatApi.removeGroupMember(room.id, memberId);
    } catch (err: any) {
      if (removed) onMemberRestored(room.id, removed);
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to remove member.");
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    setError("");
    try {
      await chatApi.removeGroupMember(room.id, currentUserId);
      onLeft(room.id);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to leave group.");
      setLeaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await chatApi.deleteGroup(room.id);
      onDeleted(room.id);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to delete group.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Members ({members.length})
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Admin: rename group */}
        {isAdmin && (
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={100}
              placeholder="Group name"
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            <button
              onClick={handleRename}
              disabled={!nameChanged || saving}
              className="px-3 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-shrink-0"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}

        {/* Error area */}
        {error && (
          <p className="px-5 py-2 text-xs text-red-500 border-b border-gray-100 dark:border-gray-800">{error}</p>
        )}

        {/* Member rows */}
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
          {members.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No members</p>
          ) : (
            members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 px-5 py-3">
                {m.avatarUrl ? (
                  <img
                    src={m.avatarUrl}
                    alt={m.name}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <Avatar name={m.name} size="sm" src={m.avatarUrl} />
                )}
                <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {m.name}
                  {m.userId === currentUserId && (
                    <span className="text-gray-400 font-normal"> (You)</span>
                  )}
                </p>
                {m.isAdmin && (
                  <span className="text-[9px] font-semibold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 rounded-full flex-shrink-0">
                    Admin
                  </span>
                )}
                {isAdmin && !m.isAdmin && m.userId !== currentUserId && (
                  confirmRemoveId === m.userId ? (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleRemove(m.userId)}
                        className="text-[10px] font-semibold px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmRemoveId(null)}
                        className="text-[10px] font-semibold px-2.5 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemoveId(m.userId)}
                      className="text-[10px] font-semibold px-2.5 py-1 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg transition-colors flex-shrink-0"
                    >
                      Remove
                    </button>
                  )
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer: delete group (admin) / leave group (non-admin) */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800">
          {isAdmin ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                You're the admin — admins can't leave their own group.
              </p>
              {confirmDelete ? (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    Delete this group for all {members.length} members? This can't be undone.
                  </span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-xs font-semibold px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs font-semibold px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-2 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl transition-colors"
                >
                  Delete Group
                </button>
              )}
            </div>
          ) : confirmLeave ? (
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 dark:text-gray-400">Leave this group?</span>
              <button
                onClick={handleLeave}
                disabled={leaving}
                className="text-xs font-semibold px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {leaving ? "Leaving…" : "Yes, leave"}
              </button>
              <button
                onClick={() => setConfirmLeave(false)}
                className="text-xs font-semibold px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmLeave(true)}
              className="w-full py-2 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl transition-colors"
            >
              Leave group
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FriendRequestsPanel ──────────────────────────────────────────────────────

// Backend row → FriendRequest. `other_profile` is the sender for incoming rows
// and the recipient for outgoing rows (same object as `from_profile` on incoming).
function mapFriendRequestRow(r: any): FriendRequest {
  const profile = r.other_profile ?? r.from_profile;
  return {
    id: r.id,
    fromUserId: r.from_user_id,
    fromUserName: profile?.full_name ?? r.from_user_name ?? "User",
    status: r.status as "pending" | "accepted" | "rejected",
    schoolName: profile?.school_name ?? null,
    mutualFriendsCount: r.mutual_friends_count ?? 0,
    createdAt: r.created_at,
  };
}

function requestSubtitle(req: FriendRequest): string {
  return [
    req.mutualFriendsCount
      ? `${req.mutualFriendsCount} mutual friend${req.mutualFriendsCount > 1 ? "s" : ""}`
      : null,
    req.schoolName,
  ]
    .filter(Boolean)
    .join(" · ");
}

function FriendRequestsPanel({
  requests,
  sentRequests,
  onRespond,
  onCancel,
  onClose,
}: {
  requests: FriendRequest[];
  sentRequests: FriendRequest[];
  userId?: string;
  onRespond: (id: string, status: "accepted" | "rejected") => void;
  onCancel: (id: string) => void;
  onClose: () => void;
}) {
  const pending = requests.filter((r) => r.status === "pending");
  return (
    <div className="absolute top-14 left-4 right-4 z-40 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-md overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          Friend Requests ({pending.length})
        </span>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {pending.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No pending requests</p>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {pending.map((req) => {
              const subtitle = requestSubtitle(req);
              return (
                <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={req.fromUserName} size="sm" userId={req.fromUserId} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {req.fromUserName}
                      </p>
                      {req.createdAt && (
                        <span className="text-[9px] text-gray-400 flex-shrink-0">{formatTime(req.createdAt)}</span>
                      )}
                    </div>
                    {subtitle && (
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{subtitle}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onRespond(req.id, "accepted")}
                    className="text-[10px] font-semibold px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => onRespond(req.id, "rejected")}
                    className="text-[10px] font-semibold px-2.5 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Sent (outgoing) requests */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Sent Requests ({sentRequests.length})
          </span>
        </div>
        {sentRequests.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No sent requests</p>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {sentRequests.map((req) => {
              const subtitle = requestSubtitle(req);
              return (
                <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={req.fromUserName} size="sm" userId={req.fromUserId} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {req.fromUserName}
                      </p>
                      {req.createdAt && (
                        <span className="text-[9px] text-gray-400 flex-shrink-0">{formatTime(req.createdAt)}</span>
                      )}
                    </div>
                    {subtitle && (
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{subtitle}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onCancel(req.id)}
                    className="text-[10px] font-semibold px-2.5 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAppSelector((s) => s.auth.user);
  const token = useAppSelector((s) => s.auth.token);
  const userId = user?.id ?? "";
  const { approvedParents, parentThread } = useLinkedParents();
  const hasParent = approvedParents.length > 0;
  const [showParentChat, setShowParentChat] = useState(
    () => (location.state as { openParentChat?: boolean } | null)?.openParentChat === true
  );

  // Landed here via a "Message" button elsewhere (e.g. Profile's Linked
  // Parents section) — open the panel once, then clear the nav state so a
  // back/forward navigation doesn't re-trigger it.
  useEffect(() => {
    if ((location.state as { openParentChat?: boolean } | null)?.openParentChat) {
      setShowParentChat(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── State ──
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [roomFilter, setRoomFilter] = useState("");
  const [showRequests, setShowRequests] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  // Friend-vs-friend battle challenge (⚡ button on a direct-chat row)
  const [challengeTarget, setChallengeTarget] = useState<{ id: string; name: string; avatarUrl?: string | null } | null>(null);
  const [showFriendActivity, setShowFriendActivity] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({}); // roomId -> typing user_id
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // ── Reply-to state ──
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

  // ── Reaction state: which message has the reaction bar open ──
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

  // ── Infinite scroll state ──
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);

  // ── Toast ──
  const [toast, setToast] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRoomRef = useRef<ChatRoom | null>(null);
  activeRoomRef.current = activeRoom;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Safety auto-clear timers for typing indicators (per room), in case the
  // server's is_typing:false frame is lost
  const typingClearTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Rooms this client deleted itself — used to skip the redundant room_deleted toast
  const selfDeletedRoomsRef = useRef<Set<string>>(new Set());

  // Stable refs for scroll handler
  const hasOlderRef = useRef(hasOlderMessages);
  hasOlderRef.current = hasOlderMessages;
  const loadingOlderRef = useRef(loadingOlder);
  loadingOlderRef.current = loadingOlder;

  // ── Pending incoming friend-request count (Redis-cached server-side) ──
  const refreshRequestCount = useCallback(() => {
    if (!userId) return;
    chatApi
      .getFriendRequestCount(userId)
      .then((res) => setRequestCount(res.data?.count ?? 0))
      .catch(() => {});
  }, [userId]);

  // ── WebSocket ──
  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      const room = activeRoomRef.current;

      if (msg.type === "new_message") {
        // Wire contract: {type, room_id, message: {...}} — flat frame, no {type,payload} envelope
        const payload = msg as { type: string; room_id: string; message?: any; [k: string]: any };
        const m = payload.message ?? payload;
        const msgId      = m.id      ?? payload.message_id;
        const senderId   = m.sender_id   ?? payload.sender_id;
        const senderName = m.sender_name ?? payload.sender_name ?? "";
        const content    = m.content     ?? payload.content ?? "";
        const createdAt  = m.created_at  ?? payload.created_at ?? new Date().toISOString();
        const roomId     = payload.room_id ?? m.room_id;
        const isOwn      = senderId === userId;
        setRooms((prev) =>
          prev.map((r) =>
            r.id === roomId
              ? {
                  ...r,
                  lastMessage: content,
                  lastMessageAt: createdAt,
                  unreadCount: room?.id === roomId || isOwn ? r.unreadCount : r.unreadCount + 1,
                }
              : r
          )
        );
        if (room?.id === roomId) {
          const chatMsg: ChatMessage = {
            id: msgId,
            senderId,
            senderName,
            content,
            createdAt,
            status: (m.status as MessageStatus) ?? (isOwn ? "sent" : "delivered"),
            isOwn,
            replyToPreview: m.reply_to_preview
              ? { senderName: m.reply_to_preview.sender_name, content: m.reply_to_preview.content }
              : undefined,
            reactions: normalizeReactions(m.reactions, userId),
          };
          setMessages((prev) => {
            if (prev.find((x) => x.id === msgId)) return prev;
            // The sender receives their own echo — replace the pending
            // optimistic bubble instead of duplicating it
            if (isOwn) {
              const optIdx = prev.findIndex((x) => x.id.startsWith("opt-") && x.content === content);
              if (optIdx !== -1) {
                const next = [...prev];
                next[optIdx] = { ...next[optIdx], ...chatMsg };
                return next;
              }
            }
            return [...prev, chatMsg];
          });
          // Viewer has the room open → mark read immediately so the
          // sender's ticks turn green in real time
          if (!isOwn) {
            chatApi.markRead(roomId, userId).catch(() => {});
          }
        }
      }

      // Single typing type; is_typing:false means stopped (server sends no typing_stop frame)
      if (msg.type === "typing") {
        const payload = msg as { type: string; room_id: string; user_id: string; is_typing?: boolean };
        if (payload.user_id !== userId) {
          const existingTimer = typingClearTimersRef.current[payload.room_id];
          if (existingTimer) {
            clearTimeout(existingTimer);
            delete typingClearTimersRef.current[payload.room_id];
          }
          if (payload.is_typing === false) {
            setTypingUsers((prev) => {
              const next = { ...prev };
              delete next[payload.room_id];
              return next;
            });
          } else {
            setTypingUsers((prev) => ({ ...prev, [payload.room_id]: payload.user_id }));
            typingClearTimersRef.current[payload.room_id] = setTimeout(() => {
              delete typingClearTimersRef.current[payload.room_id];
              setTypingUsers((prev) => {
                const next = { ...prev };
                delete next[payload.room_id];
                return next;
              });
            }, 4000);
          }
        }
      }

      if (msg.type === "delivery_receipt") {
        const payload = msg as { type: string; message_id: string };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.message_id && m.status === "sent"
              ? { ...m, status: "delivered" }
              : m
          )
        );
      }

      // The "seen" signal: someone marked the room read → ALL of my messages
      // there are now read (WhatsApp semantics — no single-id matching)
      if (msg.type === "messages_read") {
        const payload = msg as { type: string; room_id: string; read_by: string; up_to_message_id?: string };
        if (payload.read_by !== userId && room?.id === payload.room_id) {
          setMessages((prev) =>
            prev.map((m) =>
              m.isOwn && m.status !== "read" && m.status !== "sending"
                ? { ...m, status: "read" }
                : m
            )
          );
        }
      }

      // Group renamed (by the admin) — update the room list + active header live
      if (msg.type === "room_updated") {
        const payload = msg as { type: string; room_id: string; name?: string };
        if (payload.name) {
          setRooms((prev) =>
            prev.map((r) => (r.id === payload.room_id ? { ...r, name: payload.name! } : r))
          );
          setActiveRoom((prev) =>
            prev && prev.id === payload.room_id ? { ...prev, name: payload.name! } : prev
          );
        }
      }

      // Someone was removed from / left a group I'm in
      if (msg.type === "member_removed") {
        const payload = msg as { type: string; room_id: string; user_id: string };
        if (payload.user_id === userId) {
          // That's me — drop the room and close it if open (covers being kicked)
          setRooms((prev) => prev.filter((r) => r.id !== payload.room_id));
          if (room?.id === payload.room_id) {
            setActiveRoom(null);
            setShowMembers(false);
          }
        } else {
          setRooms((prev) =>
            prev.map((r) =>
              r.id === payload.room_id
                ? { ...r, members: r.members.filter((mm) => mm.userId !== payload.user_id) }
                : r
            )
          );
          setActiveRoom((prev) =>
            prev && prev.id === payload.room_id
              ? { ...prev, members: prev.members.filter((mm) => mm.userId !== payload.user_id) }
              : prev
          );
        }
      }

      // I was removed from a group (or my own leave confirmed)
      if (msg.type === "removed_from_group") {
        const payload = msg as { type: string; room_id: string; room_name?: string; left?: boolean };
        setRooms((prev) => prev.filter((r) => r.id !== payload.room_id));
        if (room?.id === payload.room_id) {
          setActiveRoom(null);
          setShowMembers(false);
        }
        if (!payload.left) {
          setToast(`You were removed from ${payload.room_name ?? "a group"}`);
        }
      }

      // A group was deleted by its admin — messages/memberships are gone server-side
      if (msg.type === "room_deleted") {
        const payload = msg as { type: string; room_id: string; room_name?: string };
        setRooms((prev) => prev.filter((r) => r.id !== payload.room_id));
        if (room?.id === payload.room_id) {
          setActiveRoom(null);
          setShowMembers(false);
        }
        if (selfDeletedRoomsRef.current.has(payload.room_id)) {
          // This client deleted it — it already toasted "Group deleted"
          selfDeletedRoomsRef.current.delete(payload.room_id);
        } else {
          setToast(`"${payload.room_name ?? "Group"}" was deleted`);
        }
      }

      if (msg.type === "friend_request") {
        const payload = msg as {
          type: string;
          request_id: string;
          from_user_id: string;
          from_user_name: string;
        };
        setPendingRequests((prev) => [
          ...prev,
          {
            id: payload.request_id,
            fromUserId: payload.from_user_id,
            fromUserName: payload.from_user_name,
            status: "pending",
          },
        ]);
        refreshRequestCount();
      }

      // Reaction update via WebSocket — matched by message_id only (frame has no room_id);
      // reactions come as the {"<key>": {count, reacted_by}} object map
      if (msg.type === "reaction_update") {
        const payload = msg as { type: string; message_id: string; reactions: unknown };
        const mapped = normalizeReactions(payload.reactions, userId) ?? [];
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.message_id ? { ...m, reactions: mapped } : m
          )
        );
      }

      // Sync complete toast
      if (msg.type === "sync_complete") {
        const payload = msg as { type: string; pending_count: number };
        if (payload.pending_count > 0) {
          setToast(
            `Delivered ${payload.pending_count} pending message${payload.pending_count !== 1 ? "s" : ""}`
          );
        }
      }

      // Presence list — backend sends {type, users: {uid: 'online'|timestamp}}
      if (msg.type === "presence_list") {
        // Normalise: accept both array form and object form
        let onlineSet: Set<string>;
        if (Array.isArray(msg.online_user_ids)) {
          onlineSet = new Set(msg.online_user_ids as string[]);
        } else if (msg.users && typeof msg.users === "object") {
          onlineSet = new Set(
            Object.entries(msg.users as Record<string, string>)
              .filter(([, v]) => v === "online")
              .map(([uid]) => uid)
          );
        } else {
          onlineSet = new Set();
        }
        setRooms((prev) =>
          prev.map((r) =>
            !r.isGroup && r.otherUserId
              ? { ...r, online: onlineSet.has(r.otherUserId) }
              : r
          )
        );
      }
    },
    [userId, refreshRequestCount]
  );

  const { send: wsSend, connected: wsConnected } = useWebSocket(token, handleWsMessage);

  // ── Load rooms + friend requests on mount ──
  const loadRooms = useCallback(async () => {
    if (!userId) return;

    // Show cached rooms immediately if fresh (< 60s)
    const cached = lsGetRooms(userId);
    if (cached && Date.now() - cached.savedAt < 60_000) {
      setRooms(cached.rooms);
    }

    try {
      const res = await chatApi.getRooms(userId);
      const data: any[] = res.data ?? [];
      const mapped: ChatRoom[] = data.map((r: any) => ({
        id: r.id,
        // DIRECT rooms have name=null server-side — display the friend's name
        name: r.name ?? r.other_user?.full_name ?? "Student",
        // Backend sends type: "direct"|"group"; frontend used is_group bool
        isGroup: r.type === "group" || r.is_group === true,
        // Backend now sends the full members array on every room:
        // [{user_id, full_name, avatar_url, is_admin}] — incl. the creator; DMs list both participants
        members: r.members?.map((m: any) => ({
          userId: m.user_id,
          name: m.full_name ?? m.name ?? "",
          avatarUrl: m.avatar_url ?? null,
          isAdmin: m.is_admin === true,
        })) ??
          (r.other_user ? [{ userId: r.other_user.user_id, name: r.other_user.full_name ?? "" }] : []),
        // last_message is an object from backend; extract string content
        lastMessage: typeof r.last_message === "string" ? r.last_message
          : r.last_message?.content ?? r.last_message_text ?? undefined,
        lastMessageAt: r.last_message?.created_at ?? r.last_message_at ?? r.created_at,
        unreadCount: r.unread_count ?? 0,
        // other_user is an object; extract user_id
        otherUserId: r.other_user?.user_id ?? r.other_user_id,
        online: r.is_other_online ?? r.is_online ?? false,
      }));
      setRooms(mapped);
      lsSaveRooms(userId, mapped);
    } catch {
      // No rooms yet
    }
  }, [userId]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const loadFriendRequests = useCallback(() => {
    if (!userId) return;
    chatApi
      .getFriendRequests(userId, "incoming")
      .then((res) => {
        const data: any[] = res.data ?? [];
        setPendingRequests(data.map(mapFriendRequestRow));
      })
      .catch(() => {});
    chatApi
      .getFriendRequests(userId, "outgoing")
      .then((res) => {
        const data: any[] = res.data ?? [];
        setSentRequests(data.map(mapFriendRequestRow).filter((r) => r.status === "pending"));
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    loadFriendRequests();
  }, [loadFriendRequests]);

  // Poll the pending-count badge every 30s
  useEffect(() => {
    if (!userId) return;
    refreshRequestCount();
    const id = setInterval(refreshRequestCount, 30_000);
    return () => clearInterval(id);
  }, [userId, refreshRequestCount]);

  // ── Auto-scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Auto-resize textarea ──
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
  }, [newMessage]);

  // ── Infinite scroll: attach scroll listener ──
  const loadOlderMessages = useCallback(async () => {
    if (!activeRoom || !oldestCursor || loadingOlderRef.current) return;
    setLoadingOlder(true);
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;

    try {
      const res = await chatApi.getMessages(activeRoom.id, userId, oldestCursor);
      // Support both plain array and { messages, has_more } response shapes
      const rawData: {
        id: string;
        sender_id: string;
        sender_name?: string;
        content: string;
        created_at: string;
        status?: string;
        reply_to_preview?: { sender_name: string; content: string };
        reactions?: unknown;
      }[] = Array.isArray(res.data) ? res.data : (res.data?.messages ?? []);

      const hasMore: boolean = Array.isArray(res.data)
        ? rawData.length >= MESSAGES_LIMIT
        : (res.data?.has_more ?? false);

      if (rawData.length === 0) {
        setHasOlderMessages(false);
        return;
      }

      const older: ChatMessage[] = rawData.map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        senderName: m.sender_name,
        content: m.content,
        createdAt: m.created_at,
        status: (m.status as MessageStatus) ?? (m.sender_id === userId ? "read" : "delivered"),
        isOwn: m.sender_id === userId,
        replyToPreview: m.reply_to_preview
          ? { senderName: m.reply_to_preview.sender_name, content: m.reply_to_preview.content }
          : undefined,
        reactions: normalizeReactions(m.reactions, userId),
      }));

      setMessages((prev) => mergeMessages(older, prev));

      // Update cursor to oldest in this batch
      const sortedOlder = [...older].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      if (sortedOlder.length > 0) {
        setOldestCursor(sortedOlder[0].createdAt);
      }
      setHasOlderMessages(hasMore);

      // Restore scroll position to where user was
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      });
    } catch {
      // Silently ignore
    } finally {
      setLoadingOlder(false);
    }
  }, [activeRoom, oldestCursor, userId]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (container.scrollTop < 100 && hasOlderRef.current && !loadingOlderRef.current) {
        loadOlderMessages();
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [loadOlderMessages]);

  // ── Open a room ──
  const openRoom = useCallback(
    async (room: ChatRoom) => {
      setActiveRoom(room);
      setMessages([]);
      setReplyingTo(null);
      setShowFriendActivity(false);
      setShowMembers(false);
      setHasOlderMessages(false);
      setOldestCursor(null);
      setLoadingMessages(true);
      setRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, unreadCount: 0 } : r))
      );

      // Serve cached messages immediately
      const cached = lsGetMessages(room.id);
      if (cached.length > 0) {
        setMessages(cached);
        setLoadingMessages(false);
      }

      // Mark the room read via REST on open (contract: body {user_id} only) —
      // this is what triggers the sender's messages_read "seen" frame
      chatApi.markRead(room.id, userId).catch(() => {});

      try {
        const res = await chatApi.getMessages(room.id, userId);
        const rawData: {
          id: string;
          sender_id: string;
          sender_name?: string;
          content: string;
          created_at: string;
          status?: string;
          reply_to_preview?: { sender_name: string; content: string };
          reactions?: unknown;
        }[] = Array.isArray(res.data) ? res.data : (res.data?.messages ?? res.data ?? []);

        const hasMore: boolean = Array.isArray(res.data)
          ? rawData.length >= MESSAGES_LIMIT
          : (res.data?.has_more ?? false);

        const mapped: ChatMessage[] = rawData.map((m) => ({
          id: m.id,
          senderId: m.sender_id,
          senderName: m.sender_name,
          content: m.content,
          createdAt: m.created_at,
          status: (m.status as MessageStatus) ?? (m.sender_id === userId ? "read" : "delivered"),
          isOwn: m.sender_id === userId,
          replyToPreview: m.reply_to_preview
            ? { senderName: m.reply_to_preview.sender_name, content: m.reply_to_preview.content }
            : undefined,
          reactions: normalizeReactions(m.reactions, userId),
        }));

        setMessages((prev) => {
          // Keep any unsaved optimistic messages, merge with fresh data
          const optimistic = prev.filter((m) => m.id.startsWith("opt-"));
          const merged = mergeMessages(mapped, optimistic);
          lsSaveMessages(room.id, merged.filter((m) => !m.id.startsWith("opt-")));
          return merged;
        });

        if (mapped.length > 0) {
          const sorted = [...mapped].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          setOldestCursor(sorted[0].createdAt);
        }
        setHasOlderMessages(hasMore);
      } catch {
        if (cached.length === 0) setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [userId]
  );

  // ── Persist messages to localStorage when they change ──
  useEffect(() => {
    if (!activeRoom || messages.length === 0) return;
    const real = messages.filter((m) => !m.id.startsWith("opt-"));
    if (real.length > 0) lsSaveMessages(activeRoom.id, real);
  }, [messages, activeRoom]);

  // ── Clear typing auto-clear timers on unmount ──
  useEffect(() => {
    const timers = typingClearTimersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  // ── Handle reaction toggle ──
  const handleReaction = useCallback(
    async (msg: ChatMessage, key: string, emoji: string) => {
      const existingOwnReaction = msg.reactions?.find((r) => r.key === key && r.userReacted);

      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msg.id) return m;
          const current = m.reactions ?? [];
          if (existingOwnReaction) {
            return {
              ...m,
              reactions: current
                .map((r) =>
                  r.key === key ? { ...r, count: Math.max(0, r.count - 1), userReacted: false } : r
                )
                .filter((r) => r.count > 0),
            };
          }
          const existing = current.find((r) => r.key === key);
          if (existing) {
            return {
              ...m,
              reactions: current.map((r) =>
                r.key === key ? { ...r, count: r.count + 1, userReacted: true } : r
              ),
            };
          }
          return { ...m, reactions: [...current, { key, emoji, count: 1, userReacted: true }] };
        })
      );

      try {
        await chatApi.addReaction(msg.id, userId, key);
      } catch {
        // Revert: re-fetch reactions from server
        try {
          const res = await chatApi.getReactions(msg.id, userId);
          const reverted = normalizeReactions(res.data, userId) ?? [];
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id ? { ...m, reactions: reverted } : m
            )
          );
        } catch {
          // Silently ignore
        }
      }
    },
    [userId]
  );

  // ── Send message ──
  const sendMessage = useCallback(async () => {
    const content = newMessage.trim();
    if (!content || !activeRoom || sending) return;

    const optId = `opt-${Date.now()}`;
    const replyPreview = replyingTo
      ? { senderName: replyingTo.senderName ?? replyingTo.senderId, content: replyingTo.content }
      : undefined;

    const optimistic: ChatMessage = {
      id: optId,
      senderId: userId,
      content,
      createdAt: new Date().toISOString(),
      status: "sending",
      isOwn: true,
      replyToPreview: replyPreview,
    };
    setMessages((prev) => [...prev, optimistic]);
    setNewMessage("");
    setReplyingTo(null);
    setSending(true);

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    wsSend({ type: "typing_stop", room_id: activeRoom.id });

    try {
      const res = await chatApi.sendMessage(
        activeRoom.id,
        userId,
        content
      );
      const saved = res.data as {
        id: string;
        sender_id: string;
        sender_name?: string;
        content: string;
        created_at: string;
        status?: string;
        reply_to_preview?: { sender_name: string; content: string };
      };
      setMessages((prev) => {
        // The WS echo may have landed first with the saved id — drop the
        // optimistic bubble instead of creating a duplicate
        if (prev.some((m) => m.id === saved.id)) {
          return prev.filter((m) => m.id !== optId);
        }
        return prev.map((m) =>
          m.id === optId
            ? {
                id: saved.id,
                senderId: saved.sender_id,
                senderName: saved.sender_name,
                content: saved.content,
                createdAt: saved.created_at,
                status: (saved.status as MessageStatus) ?? ("sent" as MessageStatus),
                isOwn: true,
                replyToPreview: saved.reply_to_preview
                  ? { senderName: saved.reply_to_preview.sender_name, content: saved.reply_to_preview.content }
                  : replyPreview,
              }
            : m
        );
      });
      setRooms((prev) =>
        prev.map((r) =>
          r.id === activeRoom.id
            ? { ...r, lastMessage: content, lastMessageAt: saved.created_at }
            : r
        )
      );
    } catch (err: any) {
      const detail: string | undefined = err?.response?.data?.detail;
      setToast(detail ?? "Message failed to send. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== optId));
    } finally {
      setSending(false);
    }
  }, [newMessage, activeRoom, sending, userId, wsSend, replyingTo]);

  // ── Typing indicator ──
  const handleTyping = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setNewMessage(e.target.value);
      if (!activeRoom) return;
      wsSend({ type: "typing", room_id: activeRoom.id });
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        wsSend({ type: "typing_stop", room_id: activeRoom.id });
      }, 1500);
    },
    [activeRoom, userId, wsSend]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Respond to friend request ──
  const respondToRequest = useCallback(
    async (id: string, status: "accepted" | "rejected") => {
      try {
        await chatApi.respondToRequest(id, status, userId);
        setPendingRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status } : r))
        );
        if (status === "accepted") loadRooms();
      } catch {
        // Silently ignore
      }
      refreshRequestCount();
    },
    [userId, loadRooms, refreshRequestCount]
  );

  // ── Cancel a pending request I sent (optimistic removal) ──
  const cancelSentRequest = useCallback(
    async (id: string) => {
      setSentRequests((prev) => prev.filter((r) => r.id !== id));
      try {
        await chatApi.cancelFriendRequest(id);
      } catch {
        loadFriendRequests(); // restore on failure
      }
      refreshRequestCount();
    },
    [loadFriendRequests, refreshRequestCount]
  );

  // ── Group admin actions (MembersModal callbacks) ──
  const handleGroupRenamed = useCallback((roomId: string, name: string) => {
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, name } : r)));
    setActiveRoom((prev) => (prev && prev.id === roomId ? { ...prev, name } : prev));
  }, []);

  const handleGroupMemberRemoved = useCallback((roomId: string, memberId: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === roomId ? { ...r, members: r.members.filter((m) => m.userId !== memberId) } : r
      )
    );
    setActiveRoom((prev) =>
      prev && prev.id === roomId
        ? { ...prev, members: prev.members.filter((m) => m.userId !== memberId) }
        : prev
    );
  }, []);

  const handleGroupMemberRestored = useCallback(
    (roomId: string, member: ChatRoom["members"][number]) => {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId && !r.members.some((m) => m.userId === member.userId)
            ? { ...r, members: [...r.members, member] }
            : r
        )
      );
      setActiveRoom((prev) =>
        prev && prev.id === roomId && !prev.members.some((m) => m.userId === member.userId)
          ? { ...prev, members: [...prev.members, member] }
          : prev
      );
    },
    []
  );

  const handleLeftGroup = useCallback((roomId: string) => {
    setShowMembers(false);
    setActiveRoom((prev) => (prev && prev.id === roomId ? null : prev));
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    setToast("You left the group");
  }, []);

  const handleGroupDeleted = useCallback((roomId: string) => {
    selfDeletedRoomsRef.current.add(roomId);
    setShowMembers(false);
    setActiveRoom((prev) => (prev && prev.id === roomId ? null : prev));
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    setToast("Group deleted");
  }, []);

  // ── Long press (mobile) for reaction bar ──
  const handleLongPressStart = useCallback((msgId: string) => {
    longPressTimerRef.current = setTimeout(() => {
      setActiveReactionMsgId(msgId);
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // ── Derived values ──
  const pendingCount = useMemo(
    () => pendingRequests.filter((r) => r.status === "pending").length,
    [pendingRequests]
  );

  const filteredRooms = useMemo(() => {
    const q = roomFilter.toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.lastMessage?.toLowerCase().includes(q)
    );
  }, [rooms, roomFilter]);

  const totalUnread = useMemo(
    () => rooms.reduce((acc, r) => acc + r.unreadCount, 0),
    [rooms]
  );

  // Group messages by day for separators
  const messagesWithSeparators = useMemo(() => {
    const result: Array<{ type: "separator"; label: string } | { type: "message"; msg: ChatMessage }> = [];
    let lastDay = "";
    for (const msg of messages) {
      if (!lastDay || !isSameDay(lastDay, msg.createdAt)) {
        result.push({ type: "separator", label: dateSeparatorLabel(msg.createdAt) });
        lastDay = msg.createdAt;
      }
      result.push({ type: "message", msg });
    }
    return result;
  }, [messages]);

  // ── Left panel ──
  const leftPanel = (
    <div
      className={`flex flex-col h-full border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 ${
        activeRoom || showParentChat ? "hidden lg:flex" : "flex"
      } w-full lg:w-80 xl:w-96 flex-shrink-0 relative`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
        <h1 className="flex-1 text-base font-bold text-gray-900 dark:text-white">
          Chats
        </h1>
        {totalUnread > 0 && (
          <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
        <div className="relative">
          <button
            onClick={() => navigate("/messages/search")}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            title="Find students"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          {pendingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-amber-500 rounded-full border-2 border-white dark:border-gray-900" />
          )}
        </div>
        <button
          onClick={() => setShowRequests((v) => !v)}
          className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          title="Friend requests"
        >
          <UserPlus className="w-4 h-4" />
          {requestCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {requestCount > 99 ? "99+" : requestCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setShowSettings(v => !v)}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Friend requests dropdown */}
      {showRequests && (
        <FriendRequestsPanel
          requests={pendingRequests}
          sentRequests={sentRequests}
          userId={userId}
          onRespond={respondToRequest}
          onCancel={cancelSentRequest}
          onClose={() => setShowRequests(false)}
        />
      )}

      {/* Settings dropdown */}
      {showSettings && (
        <div className="absolute top-14 right-3 z-50 w-52 bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Chat Settings</span>
            <button onClick={() => setShowSettings(false)} className="p-0.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-3.5 h-3.5 text-gray-400" /></button>
          </div>
          <button
            onClick={() => { navigate("/messages/search"); setShowSettings(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <Search className="w-4 h-4 text-gray-400" />
            Find Students
          </button>
          <button
            onClick={() => {
              const keys = Object.keys(localStorage).filter(k => k.startsWith("chat_"));
              keys.forEach(k => localStorage.removeItem(k));
              setShowSettings(false);
              window.location.reload();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
            Clear Chat Cache
          </button>
          <button
            onClick={() => { navigate("/profile"); setShowSettings(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-t border-gray-100 dark:border-gray-700"
          >
            <Settings className="w-4 h-4 text-gray-400" />
            Notification Prefs
          </button>
        </div>
      )}

      {/* Search/filter */}
      <div className="px-3 py-2.5 border-b border-gray-50 dark:border-gray-800/60">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            placeholder="Search chats…"
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
        </div>
      </div>

      {/* WS connection indicator */}
      <div className={`px-4 py-1 flex items-center gap-1.5 transition-all ${wsConnected ? "opacity-0 h-0 overflow-hidden" : "opacity-100"}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        <span className="text-[10px] text-amber-500">Connecting…</span>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto">
        {/* Pinned parent/family thread — always first, mirrors a WhatsApp
            pinned chat. Separate data source (messageApi) from the
            chatApi-driven rooms below, so it's rendered outside filteredRooms
            rather than merged into that array/type. */}
        {hasParent && (!roomFilter || approvedParents.some(p => (p.parent_name ?? "").toLowerCase().includes(roomFilter.toLowerCase()))) && (
          <button
            onClick={() => { setShowParentChat(true); setActiveRoom(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/70 ${
              showParentChat
                ? "bg-emerald-50 dark:bg-emerald-900/20 border-l-2 border-emerald-500"
                : (parentThread?.unread_count ?? 0) > 0
                ? "bg-primary-50/40 dark:bg-primary-900/10"
                : ""
            }`}
          >
            <Avatar name={approvedParents[0]?.parent_name ?? "Parent"} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`text-sm truncate ${
                      (parentThread?.unread_count ?? 0) > 0
                        ? "font-semibold text-gray-900 dark:text-white"
                        : "font-medium text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {approvedParents.length > 1 ? "Family" : approvedParents[0]?.parent_name ?? "Parent"}
                  </span>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-full flex-shrink-0">
                    {relationshipLabel(approvedParents[0])}
                  </span>
                </div>
                {parentThread?.last_message_time && (
                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                    {formatTime(parentThread.last_message_time)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1">
                <p
                  className={`text-xs truncate ${
                    (parentThread?.unread_count ?? 0) > 0
                      ? "text-gray-700 dark:text-gray-300 font-medium"
                      : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {parentThread?.last_message ?? "No messages yet"}
                </p>
                {(parentThread?.unread_count ?? 0) > 0 && (
                  <span className="w-5 h-5 bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                    {parentThread!.unread_count > 99 ? "99" : parentThread!.unread_count}
                  </span>
                )}
              </div>
            </div>
          </button>
        )}

        {filteredRooms.length === 0 && !hasParent ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-6">
            <MessageSquare className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {roomFilter ? "No results" : "No chats yet"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {roomFilter
                ? "Try a different search."
                : "Find students to chat with!"}
            </p>
            {!roomFilter && (
              <button
                onClick={() => navigate("/messages/search")}
                className="mt-3 text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
              >
                Find Students
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {filteredRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => { setShowParentChat(false); openRoom(room); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/70 ${
                  !showParentChat && activeRoom?.id === room.id
                    ? "bg-emerald-50 dark:bg-emerald-900/20 border-l-2 border-emerald-500"
                    : room.unreadCount > 0
                    ? "bg-primary-50/40 dark:bg-primary-900/10"
                    : ""
                }`}
              >
                <Avatar
                  name={room.name}
                  size="md"
                  online={!room.isGroup && room.online}
                  src={room.isGroup ? null : room.members.find((m) => m.userId === room.otherUserId)?.avatarUrl}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-sm truncate ${
                          room.unreadCount > 0
                            ? "font-semibold text-gray-900 dark:text-white"
                            : "font-medium text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {room.name}
                      </span>
                      {room.isGroup && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full flex-shrink-0">
                          GROUP
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {formatTime(room.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <p
                      className={`text-xs truncate ${
                        room.unreadCount > 0
                          ? "text-gray-700 dark:text-gray-300 font-medium"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
                    >
                      {room.lastMessage ?? "No messages yet"}
                    </p>
                    {room.unreadCount > 0 && (
                      <span className="w-5 h-5 bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                        {room.unreadCount > 99 ? "99" : room.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
                {/* Per-friend battle challenge — span (not button) because the row is a button */}
                {!room.isGroup && room.otherUserId && (
                  <span
                    role="button"
                    title={`Challenge ${room.name} to a battle`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setChallengeTarget({
                        id: room.otherUserId!,
                        name: room.name,
                        avatarUrl: room.members.find((m) => m.userId === room.otherUserId)?.avatarUrl,
                      });
                    }}
                    className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 hover:bg-primary-100 dark:hover:bg-primary-900/50 flex items-center justify-center transition-colors"
                  >
                    <Zap className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New Group button */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={() => setShowGroupModal(true)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Group
        </button>
      </div>
    </div>
  );

  // ── Right panel ──
  const rightPanel = showParentChat ? (
    <ParentChatPanel studentId={userId} onBack={() => setShowParentChat(false)} />
  ) : activeRoom ? (
    <div className="flex flex-col flex-1 h-full bg-gray-50 dark:bg-gray-950 min-w-0">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <button
          onClick={() => setActiveRoom(null)}
          className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {!activeRoom.isGroup && activeRoom.otherUserId ? (
          <button
            onClick={() => setShowFriendActivity(true)}
            title="View activity"
            className="flex-shrink-0 cursor-pointer"
          >
            <Avatar
              name={activeRoom.name}
              size="sm"
              online={!activeRoom.isGroup && activeRoom.online}
              src={activeRoom.members.find((m) => m.userId === activeRoom.otherUserId)?.avatarUrl}
            />
          </button>
        ) : (
          <Avatar
            name={activeRoom.name}
            size="sm"
            online={!activeRoom.isGroup && activeRoom.online}
            src={activeRoom.isGroup ? null : activeRoom.members.find((m) => m.userId === activeRoom.otherUserId)?.avatarUrl}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {!activeRoom.isGroup && activeRoom.otherUserId ? (
              <button
                onClick={() => setShowFriendActivity(true)}
                title="View activity"
                className="group/name flex items-center gap-0.5 min-w-0 cursor-pointer"
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover/name:underline">
                  {activeRoom.name}
                </p>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover/name:text-emerald-500 flex-shrink-0" />
              </button>
            ) : activeRoom.isGroup ? (
              <button
                onClick={() => setShowMembers(true)}
                title="View members"
                className="group/name flex items-center gap-0.5 min-w-0 cursor-pointer"
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover/name:underline">
                  {activeRoom.name}
                </p>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover/name:text-emerald-500 flex-shrink-0" />
              </button>
            ) : (
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {activeRoom.name}
              </p>
            )}
            {activeRoom.isGroup && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                GROUP
              </span>
            )}
          </div>
          {activeRoom.isGroup ? (
            <button
              onClick={() => setShowMembers(true)}
              title="View members"
              className="text-[10px] text-gray-400 dark:text-gray-500 hover:underline cursor-pointer"
            >
              {activeRoom.members.length} members
            </button>
          ) : (
            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              {activeRoom.online ? "Online" : "Offline"}
            </p>
          )}
        </div>
        <button className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
          <Info className="w-4 h-4" />
        </button>
      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
        onClick={() => setActiveReactionMsgId(null)}
      >
        {/* Loading older spinner */}
        {loadingOlder && (
          <div className="flex items-center justify-center py-3">
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              Loading older messages…
            </div>
          </div>
        )}

        {loadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Send the first message!</p>
          </div>
        ) : (
          <>
            {messagesWithSeparators.map((item, idx) => {
              if (item.type === "separator") {
                return <DateSeparator key={`sep-${idx}`} label={item.label} />;
              }
              const { msg } = item;
              const showReactionBar = activeReactionMsgId === msg.id;
              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.isOwn ? "justify-end" : "justify-start"} mb-1`}
                >
                  {!msg.isOwn && (
                    <div className="mr-1.5 mt-auto mb-0.5 flex-shrink-0">
                      <Avatar name={msg.senderName ?? msg.senderId} size="sm" userId={msg.senderId} />
                    </div>
                  )}
                  <div className={`max-w-[70%] lg:max-w-[55%] flex flex-col ${msg.isOwn ? "items-end" : "items-start"}`}>
                    {/* Sender name in group for others */}
                    {activeRoom.isGroup && !msg.isOwn && msg.senderName && (
                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 mb-0.5 ml-1">
                        {msg.senderName}
                      </span>
                    )}

                    {/* Bubble wrapper with hover/long-press controls */}
                    <div
                      className="relative group"
                      onMouseEnter={() => setActiveReactionMsgId(msg.id)}
                      onMouseLeave={() => setActiveReactionMsgId(null)}
                      onTouchStart={() => handleLongPressStart(msg.id)}
                      onTouchEnd={handleLongPressEnd}
                      onTouchMove={handleLongPressEnd}
                    >
                      {/* Reaction bar overlay */}
                      {showReactionBar && (
                        <ReactionBar
                          onSelect={(key, emoji) => handleReaction(msg, key, emoji)}
                          onClose={() => setActiveReactionMsgId(null)}
                        />
                      )}

                      {/* Reply icon (shown on hover) */}
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 ${
                          msg.isOwn
                            ? "left-0 -translate-x-full pr-1.5"
                            : "right-0 translate-x-full pl-1.5"
                        } opacity-0 group-hover:opacity-100 transition-opacity`}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); setReplyingTo(msg); }}
                          className="p-1 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
                          title="Reply"
                        >
                          <CornerUpLeft className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Message bubble */}
                      <div
                        className={`relative px-3.5 py-2.5 ${
                          msg.isOwn
                            ? "bg-emerald-500 text-white rounded-2xl rounded-br-none"
                            : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-bl-none"
                        }`}
                      >
                        {/* Reply-to quoted block inside bubble */}
                        {msg.replyToPreview && (
                          <div
                            className={`mb-2 pl-2 border-l-2 ${
                              msg.isOwn ? "border-emerald-300" : "border-emerald-500"
                            } rounded`}
                          >
                            <p
                              className={`text-[11px] font-semibold ${
                                msg.isOwn
                                  ? "text-emerald-100"
                                  : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {msg.replyToPreview.senderName}
                            </p>
                            <p
                              className={`text-[11px] ${
                                msg.isOwn
                                  ? "text-emerald-100/80"
                                  : "text-gray-500 dark:text-gray-400"
                              } bg-black/5 dark:bg-white/5 rounded px-1 py-0.5`}
                            >
                              {truncate(msg.replyToPreview.content, 60)}
                            </p>
                          </div>
                        )}

                        <p className="text-sm leading-relaxed break-words">{msg.content}</p>
                        <div className={`flex items-center gap-1 mt-1 ${msg.isOwn ? "justify-end" : "justify-end"}`}>
                          <span
                            className={`text-[10px] ${
                              msg.isOwn ? "text-emerald-100" : "text-gray-400 dark:text-gray-500"
                            }`}
                          >
                            {formatMsgTime(msg.createdAt)}
                          </span>
                          {msg.isOwn && <StatusIcon status={msg.status} />}
                        </div>
                      </div>
                    </div>

                    {/* Reaction chips below bubble */}
                    {msg.reactions && msg.reactions.filter((r) => r.count > 0).length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 ${msg.isOwn ? "justify-end" : "justify-start"}`}>
                        {msg.reactions
                          .filter((r) => r.count > 0)
                          .map((r) => (
                            <button
                              key={r.key}
                              onClick={() => handleReaction(msg, r.key, r.emoji)}
                              className={`flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                                r.userReacted
                                  ? "ring-1 ring-emerald-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-900"
                                  : ""
                              }`}
                              title={r.userReacted ? `Remove ${r.key}` : `React with ${r.key}`}
                            >
                              <span>{r.emoji}</span>
                              <span className="text-gray-600 dark:text-gray-300 font-medium">{r.count}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Typing indicator — map stores the typing user_id; resolve a display name */}
            {activeRoom && typingUsers[activeRoom.id] && (
              <TypingIndicator
                name={
                  activeRoom.isGroup
                    ? activeRoom.members.find((mm) => mm.userId === typingUsers[activeRoom.id])?.name ?? "Someone"
                    : activeRoom.name
                }
              />
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
        {/* Reply preview bar */}
        {replyingTo && (
          <div className="flex items-start gap-2 mb-2 pl-3 pr-2 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border-l-2 border-emerald-500">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                {replyingTo.isOwn ? "You" : (replyingTo.senderName ?? replyingTo.senderId)}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {truncate(replyingTo.content, 60)}
              </p>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2.5">
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-2xl border-0 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 overflow-y-auto"
            style={{ minHeight: "42px", maxHeight: "96px" }}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1.5 ml-1">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  ) : (
    /* Empty state (desktop) */
    <div className="hidden lg:flex flex-1 flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 text-center px-8">
      <div className="w-20 h-20 rounded-3xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mb-5">
        <MessageSquare className="w-9 h-9 text-emerald-500" />
      </div>
      <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
        Select a conversation
      </h2>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs mb-6">
        Choose a chat on the left, or find students to start a new conversation.
      </p>
      <button
        onClick={() => navigate("/messages/search")}
        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
      >
        Find Students
      </button>
    </div>
  );

  return (
    <>
      <div className="flex h-[calc(100vh-4rem-3.5rem)] -m-4 md:-m-6 overflow-hidden">
        {leftPanel}
        {rightPanel}
      </div>

      {/* Modals */}
      {challengeTarget && (
        <ChallengeFriendModal
          friend={challengeTarget}
          onClose={() => setChallengeTarget(null)}
        />
      )}

      {showGroupModal && (
        <NewGroupModal
          userId={userId}
          onClose={() => setShowGroupModal(false)}
          onCreated={loadRooms}
        />
      )}

      {showFriendActivity && activeRoom && !activeRoom.isGroup && activeRoom.otherUserId && (
        <FriendActivityModal
          friendId={activeRoom.otherUserId}
          friendName={activeRoom.name}
          onClose={() => setShowFriendActivity(false)}
        />
      )}

      {showMembers && activeRoom && activeRoom.isGroup && (
        <MembersModal
          room={activeRoom}
          currentUserId={userId}
          onRenamed={handleGroupRenamed}
          onMemberRemoved={handleGroupMemberRemoved}
          onMemberRestored={handleGroupMemberRestored}
          onLeft={handleLeftGroup}
          onDeleted={handleGroupDeleted}
          onClose={() => setShowMembers(false)}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      )}
    </>
  );
}
