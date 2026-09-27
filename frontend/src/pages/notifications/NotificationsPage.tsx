import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Check, CheckCheck, Info, AlertTriangle, Trophy, Zap } from "lucide-react";
import { notificationApi } from "@/lib/api";
import { useAppSelector } from "@/store";
import { Button, EmptyState, SkeletonList } from "@/components/ui";

interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string;
  body?: string;
  is_read: boolean;
  created_at: string;
}

const ICON_MAP: Record<string, { icon: React.ElementType; color: string }> = {
  achievement: { icon: Trophy,        color: "text-warning-500" },
  xp:          { icon: Zap,           color: "text-primary-500" },
  warning:     { icon: AlertTriangle, color: "text-warning-500"  },
  info:        { icon: Info,          color: "text-info-500"   },
  default:     { icon: Bell,          color: "text-primary-500" },
};

function NotifIcon({ type }: { type: string }) {
  const key = Object.keys(ICON_MAP).find(k => type?.toLowerCase().includes(k)) ?? "default";
  const { icon: Icon, color } = ICON_MAP[key];
  return (
    <div className={`w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 ${color}`}>
      <Icon className="w-4 h-4" />
    </div>
  );
}

function timeAgo(ts: string) {
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

export default function NotificationsPage() {
  const userId = useAppSelector(s => s.auth.user?.id ?? "");
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", userId],
    queryFn: () => notificationApi.getNotifications(userId, 50).then(r => r.data),
    enabled: !!userId,
  });

  const notifications: Notification[] = data?.notifications ?? data ?? [];
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAllMut = useMutation({
    mutationFn: () => notificationApi.markAllRead(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", userId] }),
  });

  const markBulkMut = useMutation({
    mutationFn: (ids: string[]) => notificationApi.markBulkRead(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", userId] });
      setSelected(new Set());
    },
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="w-full pt-6 px-4 sm:px-6 max-w-2xl mx-auto">
        <SkeletonList rows={5} />
      </div>
    );
  }

  return (
    <div className="w-full pt-4 pb-8 px-4 sm:px-6 max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.size > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => markBulkMut.mutate(Array.from(selected))}
              isLoading={markBulkMut.isPending}
            >
              <Check className="w-3.5 h-3.5" />
              Mark {selected.size} read
            </Button>
          )}
          {unreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => markAllMut.mutate()}
              isLoading={markAllMut.isPending}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {notifications.length === 0 && (
        <EmptyState
          icon={BellOff}
          title="No notifications yet"
          description="We'll let you know when something happens"
        />
      )}

      {/* List */}
      <div className="space-y-2">
        {notifications.map(notif => (
          <div
            key={notif.id}
            onClick={() => toggleSelect(notif.id)}
            className={`relative bg-white dark:bg-gray-800 rounded-2xl border p-4 flex items-start gap-3 cursor-pointer transition-all ${
              selected.has(notif.id)
                ? "border-primary-300 dark:border-primary-600 bg-primary-50/30 dark:bg-primary-900/10"
                : notif.is_read
                ? "border-gray-100 dark:border-gray-700 opacity-70"
                : "border-primary-100 dark:border-primary-800 shadow-sm"
            }`}
          >
            {/* Unread dot */}
            {!notif.is_read && (
              <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary-500" />
            )}

            <NotifIcon type={notif.type} />

            <div className="flex-1 min-w-0 pr-4">
              <p className={`text-sm font-semibold truncate ${notif.is_read ? "text-gray-600 dark:text-gray-400" : "text-gray-900 dark:text-white"}`}>
                {notif.title}
              </p>
              {(notif.message ?? notif.body) && (
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                  {notif.message ?? notif.body}
                </p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {timeAgo(notif.created_at)}
              </p>
            </div>

            {/* Checkbox indicator */}
            {selected.has(notif.id) && (
              <div className="absolute top-3 left-3 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
