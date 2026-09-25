import { useState } from "react";
import {
  Bell, BookOpen, Calendar, ChevronRight,
  MessageSquare, Megaphone, Trophy, ShieldCheck, ChevronLeft,
} from "lucide-react";
import BackButton from "@/components/ui/BackButton";
import { Avatar, Badge, SkeletonList } from "@/components/ui";
import { useLanguage } from "@/contexts/LanguageContext";
import { announcementApi, chatApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useSelectedChild } from "@/hooks/useSelectedChild";
import { ChildSelector, NoChildrenState, PendingChildState } from "@/components/parent/ChildSelector";

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: string;
  created_at: string;
  is_pinned: boolean;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hr = diff / 3600000;
  if (hr < 1) return "Just now";
  if (hr < 24) return `${Math.floor(hr)} hour${Math.floor(hr) === 1 ? "" : "s"} ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const typeIcon = (type: string) => {
  if (type === "exam")   return <Calendar className="w-4 h-4 text-danger-500" />;
  if (type === "course") return <BookOpen className="w-4 h-4 text-info-500" />;
  if (type === "result") return <Trophy className="w-4 h-4 text-warning-500" />;
  return <Megaphone className="w-4 h-4 text-primary-500" />;
};

const typeBg = (type: string) => {
  if (type === "exam")   return "bg-danger-50 dark:bg-danger-900/20";
  if (type === "course") return "bg-info-50 dark:bg-info-900/20";
  if (type === "result") return "bg-warning-50 dark:bg-warning-900/20";
  return "bg-primary-50 dark:bg-primary-900/20";
};

interface ChatRoom {
  room_id: string;
  name?: string;
  last_message?: { content: string; created_at: string };
  members?: { user_id: string; full_name: string }[];
}

interface ChatMessage {
  message_id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  created_at: string;
}

export default function ParentCommunicationPage() {
  const { t } = useLanguage();
  const {
    parentId: parentUserId,
    children,
    selectedChild,
    selectedChildId,
    setSelectedChildId,
    isLoading: childrenLoading,
  } = useSelectedChild();
  const canMonitor = selectedChild?.is_approved === true;
  const childUserId = canMonitor ? selectedChild!.student_user_id : "";
  const [tab, setTab]         = useState<"announcements" | "monitor">("announcements");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: announcements = [], isLoading: announcementsLoading } = useQuery({
    queryKey: ["parent-announcements"],
    queryFn: () => announcementApi.list(true).then(r => (r.data?.data ?? []) as Announcement[]),
  });

  // No per-parent "read" tracking exists server-side for announcements —
  // this is a real, honest read/unread state (not fabricated content),
  // just scoped to this browser rather than synced across devices.
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("parent_read_announcements");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  const markRead = (id: string) => {
    setReadIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      try { localStorage.setItem("parent_read_announcements", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const unread = announcements.filter(a => !readIds.has(a.id)).length;

  // Monitor Chat state
  const [monitorRooms, setMonitorRooms]         = useState<ChatRoom[]>([]);
  const [monitorLoading, setMonitorLoading]     = useState(false);
  const [selectedRoom, setSelectedRoom]         = useState<ChatRoom | null>(null);
  const [roomMessages, setRoomMessages]         = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading]   = useState(false);

  const loadMonitor = (childId = childUserId) => {
    if (!parentUserId || !childId) return;
    setSelectedRoom(null);
    setRoomMessages([]);
    setMonitorLoading(true);
    chatApi.parentMonitor(childId, parentUserId)
      .then(res => setMonitorRooms(res.data?.rooms ?? res.data ?? []))
      .catch(err => { setMonitorRooms([]); toast.error(parseApiError(err)); })
      .finally(() => setMonitorLoading(false));
  };

  const loadRoomMessages = (room: ChatRoom) => {
    if (!childUserId) return;
    setSelectedRoom(room);
    setMessagesLoading(true);
    chatApi.parentRoomMessages(childUserId, room.room_id, parentUserId)
      .then(res => setRoomMessages(res.data?.messages ?? res.data ?? []))
      .catch(err => { setRoomMessages([]); toast.error(parseApiError(err)); })
      .finally(() => setMessagesLoading(false));
  };

  const selectChild = (id: string) => {
    setSelectedChildId(id);
    setMonitorRooms([]);
    setSelectedRoom(null);
    setRoomMessages([]);
    const next = children.find(c => c.student_user_id === id);
    if (tab === "monitor" && next?.is_approved) loadMonitor(id);
  };

  return (
    <div className="w-full space-y-5 animate-fade-in">
      <BackButton label="Back" />
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-primary-500" />
          {t("communicationCenter")}
        </h1>
        <p className="text-sm font-normal text-gray-500 dark:text-gray-400 mt-1">School announcements, teacher messages & exam updates</p>
      </div>

      {/* Tab */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "announcements", label: t("announcements"), icon: Bell },
          { key: "monitor",       label: "Monitor Chat",    icon: ShieldCheck },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              setTab(key);
              if (key === "monitor") loadMonitor();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === key
                ? "bg-primary-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {key === "announcements" && unread > 0 && (
              <Badge variant="danger" className="!px-1.5 !py-0 min-w-[1.25rem] h-5 justify-center">
                {unread}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Announcements */}
      {tab === "announcements" && (
        <div className="space-y-3">
          {announcementsLoading ? (
            <SkeletonList rows={4} />
          ) : announcements.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <Bell className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No announcements yet</p>
            </div>
          ) : (
            announcements.map(item => {
              const isRead = readIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border ${isRead ? "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800" : "border-primary-200 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/10"} overflow-hidden transition-all`}
                >
                  <button
                    onClick={() => { setExpanded(expanded === item.id ? null : item.id); markRead(item.id); }}
                    className="w-full flex items-start gap-3 p-4 text-left"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${typeBg(item.type)}`}>
                      {typeIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-semibold text-sm ${isRead ? "text-gray-800 dark:text-gray-200" : "text-gray-900 dark:text-white"}`}>
                          {item.title}
                        </p>
                        {!isRead && (
                          <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs font-medium text-gray-400 mt-0.5">{formatRelativeTime(item.created_at)}</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded === item.id ? "rotate-90" : ""}`} />
                  </button>
                  {expanded === item.id && (
                    <div className="px-4 pb-4 pt-0">
                      <div className="pl-12">
                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{item.body}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Monitor Chat */}
      {tab === "monitor" && (
        <div className="space-y-3">
          {children.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
              <ChildSelector children={children} selectedChildId={selectedChildId} onSelect={selectChild} showAdd={false} compact className="!border-b-0" />
            </div>
          )}

          {!childrenLoading && children.length === 0 ? (
            <NoChildrenState />
          ) : selectedChild && !selectedChild.is_approved ? (
            <PendingChildState child={selectedChild} />
          ) : (
          <>
          {/* Disclaimer */}
          <div className="bg-warning-50 dark:bg-warning-900/20 rounded-xl p-3.5 flex items-start gap-3 border border-warning-200 dark:border-warning-700">
            <ShieldCheck className="w-4 h-4 text-warning-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-normal text-warning-700 dark:text-warning-300">
              You are viewing your child's conversations in read-only mode.
            </p>
          </div>

          {/* Back to rooms */}
          {selectedRoom && (
            <button
              onClick={() => { setSelectedRoom(null); setRoomMessages([]); }}
              className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 font-medium hover:underline"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to conversations
            </button>
          )}

          {/* Room list */}
          {!selectedRoom && (
            <>
              {monitorLoading ? (
                <SkeletonList rows={3} />
              ) : monitorRooms.length === 0 ? (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No conversations found</p>
                </div>
              ) : (
                monitorRooms.map(room => (
                  <button
                    key={room.room_id}
                    onClick={() => loadRoomMessages(room)}
                    className="w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3 text-left hover:border-primary-200 dark:hover:border-primary-700 transition-colors"
                  >
                    <Avatar name={room.name ?? "?"} size="lg" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                        {room.name ?? "Unknown"}
                      </p>
                      {room.last_message && (
                        <p className="text-xs font-medium text-gray-400 dark:text-gray-500 truncate mt-0.5">
                          {room.last_message.content}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                ))
              )}
            </>
          )}

          {/* Messages view (read-only) */}
          {selectedRoom && (
            <div className="space-y-3">
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                {/* Room header */}
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
                  <Avatar name={selectedRoom.name ?? "?"} size="sm" />
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">
                    {selectedRoom.name ?? "Conversation"}
                  </p>
                </div>

                {/* Messages */}
                <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                  {messagesLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
                        </div>
                      ))}
                    </div>
                  ) : roomMessages.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-6">No messages</p>
                  ) : (
                    roomMessages.map(msg => {
                      const isChild = msg.sender_id === childUserId;
                      return (
                        <div key={msg.message_id} className={`flex ${isChild ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-xs px-3.5 py-2 rounded-2xl text-sm ${
                            isChild
                              ? "bg-primary-500 text-white rounded-br-sm"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-sm"
                          }`}>
                            {!isChild && msg.sender_name && (
                              <p className="text-xs font-semibold mb-0.5 opacity-70">{msg.sender_name}</p>
                            )}
                            <p className="leading-relaxed">{msg.content}</p>
                            <p className={`text-xs mt-1 opacity-60 ${isChild ? "text-right" : "text-left"}`}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}
