import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Users, Clock, Shield, UserX } from "lucide-react";
import { chatApi, parentApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { useAppSelector } from "@/store";
import { Card, Badge, Alert, EmptyState, Avatar, SkeletonList } from "@/components/ui";
import { useSelectedChild } from "@/hooks/useSelectedChild";
import { PendingChildState } from "@/components/parent/ChildSelector";

interface Room {
  room_id?: string;
  id?: string;
  type?: string;
  name?: string;
  member_count?: number;
  last_message?: { content?: string; created_at?: string } | string;
  last_activity?: string;
}

function timeAgo(ts?: string) {
  if (!ts) return "";
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return ""; }
}

export default function ParentMonitorPage() {
  const { child_id } = useParams<{ child_id: string }>();
  const parentId = useAppSelector(s => s.auth.user?.id ?? "");
  const { children, isLoading: childrenLoading, isError: childrenError, error: childrenErr } = useSelectedChild();

  const link = children.find(c => c.student_user_id === child_id) ?? null;
  const isApproved = link?.is_approved === true;

  const { data: monitorData, isLoading, isError, error } = useQuery({
    queryKey: ["parent-monitor", child_id, parentId],
    queryFn: () => chatApi.parentMonitor(child_id!, parentId).then(r => r.data),
    enabled: !!child_id && !!parentId && isApproved,
  });

  const { data: summary } = useQuery({
    queryKey: ["parent-student-summary", child_id],
    queryFn: () => parentApi.studentSummary(child_id!).then(r => r.data),
    enabled: !!child_id && isApproved,
  });

  const header = (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center">
        <Shield className="w-5 h-5 text-white" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Chat Monitor</h1>
        <p className="text-xs text-gray-400 mt-0.5">Overseeing your child's conversations</p>
      </div>
    </div>
  );

  if (childrenLoading || (isApproved && isLoading)) {
    return (
      <div className="w-full pt-6 px-4">
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (childrenError) {
    return (
      <div className="w-full pt-4 pb-8 px-4 animate-fade-in">
        {header}
        <Alert variant="danger">{parseApiError(childrenErr)}</Alert>
      </div>
    );
  }

  if (!link) {
    return (
      <div className="w-full pt-4 pb-8 px-4 animate-fade-in">
        {header}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
          <EmptyState
            icon={UserX}
            title="This student isn't linked to your account"
            description="You can only monitor students who have approved a link request from you."
          />
          <div className="flex justify-center pb-6 -mt-8">
            <Link to="/parent/link-student" className="btn-primary text-sm">Link a student</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isApproved) {
    return (
      <div className="w-full pt-4 pb-8 px-4 animate-fade-in">
        {header}
        <PendingChildState child={link} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full pt-4 pb-8 px-4 animate-fade-in">
        {header}
        <Alert variant="danger">{parseApiError(error)}</Alert>
      </div>
    );
  }

  const rooms: Room[] = monitorData?.rooms ?? monitorData ?? [];
  const totalMessages = monitorData?.total_messages ?? rooms.length;

  return (
    <div className="w-full pt-4 pb-8 px-4 animate-fade-in">
      {header}

      {/* Notice */}
      <Alert variant="warning" className="mb-5">
        This is a safety feature. Only room names and message counts are shown. Content is visible only when the child has enabled parental oversight.
      </Alert>

      {/* Stats row */}
      <div className="grid grid-cols-1 xs:grid-cols-3 gap-3 mb-5">
        {[
          { icon: MessageSquare, label: "Total Rooms",    value: rooms.length },
          { icon: Clock,         label: "Messages",       value: totalMessages },
          { icon: Users,         label: "Quiz Score Avg", value: summary?.avg_quiz_score != null ? `${Math.round(summary.avg_quiz_score)}%` : "—" },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="text-center">
            <Icon className="w-5 h-5 mx-auto mb-1 text-primary-500" />
            <p className="text-lg font-bold text-gray-900 dark:text-white truncate">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{label}</p>
          </Card>
        ))}
      </div>

      {/* Room list */}
      {rooms.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No chat rooms found" description="Your child hasn't joined any chats yet" />
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Chat Rooms</h2>
          {rooms.map(room => {
            const roomId = room.room_id ?? room.id ?? "";
            const lastMsg = typeof room.last_message === "string"
              ? room.last_message
              : room.last_message?.content ?? "";
            const lastAt = typeof room.last_message === "object"
              ? room.last_message?.created_at
              : room.last_activity;
            const roomLabel = room.name ?? (room.type === "group" ? "Group Chat" : "Direct Message");

            return (
              <Card key={roomId} className="flex items-center gap-3">
                <Avatar name={roomLabel} size="md" className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {roomLabel}
                    </p>
                    <Badge variant={room.type === "group" ? "primary" : "info"} className="shrink-0">
                      {room.type === "group" ? "Group" : "DM"}
                    </Badge>
                  </div>
                  {lastMsg && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{lastMsg}</p>
                  )}
                </div>
                {lastAt && (
                  <p className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(lastAt)}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
