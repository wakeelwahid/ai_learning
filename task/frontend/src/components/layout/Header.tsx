import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAppSelector, useAppDispatch } from "@/store";
import { logout } from "@/store/auth";
import {
  LogOut, Bell, Search, Menu, X, Zap, Coins,
  User, BookOpen, Trophy,
  CheckCircle, Info, MessageSquare,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { gamificationApi, notificationApi, chatApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useLinkBadges } from "@/hooks/useLinkBadges";

function NotifIcon({ type }: { type: string }) {
  if (type === "video")   return <BookOpen className="w-4 h-4 text-blue-500" />;
  if (type === "quiz")    return <CheckCircle className="w-4 h-4 text-green-500" />;
  if (type === "badge")   return <Trophy className="w-4 h-4 text-yellow-500" />;
  if (type === "message") return <MessageSquare className="w-4 h-4 text-emerald-500" />;
  return <Info className="w-4 h-4 text-purple-500" />;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, cb]);
}

interface Props { onMenuClick: () => void; collapsed?: boolean }

export default function Header({ onMenuClick, collapsed = false }: Props) {
  const user        = useAppSelector((s) => s.auth.user);
  const dispatch    = useAppDispatch();
  const navigate    = useNavigate();
  const { t }       = useLanguage();

  const [searchOpen,  setSearchOpen]  = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef   = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useClickOutside(notifRef,   () => setNotifOpen(false));
  useClickOutside(profileRef, () => setProfileOpen(false));

  const { data: notifData } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => notificationApi.getNotifications(user!.id).then((r) => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.notifications ?? []);
    }),
    enabled: !!user?.id,
    refetchInterval: 60_000,
  });
  const notifs: any[] = notifData ?? [];

  const { data: messageThreads } = useQuery({
    queryKey: ["msg-threads", user?.id],
    queryFn: () => chatApi.getRooms(user!.id).then((r) =>
      (r.data ?? []).filter((room: any) => room.unread_count > 0).slice(0, 3)
    ),
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });
  const unreadMsgs = messageThreads ?? [];

  const unreadCount = notifs.filter((n: any) => !n.is_read).length + unreadMsgs.length;
  const markAllRead = () => {
    if (user?.id) {
      notificationApi.markAllRead(user.id).then(() =>
        queryClient.invalidateQueries({ queryKey: ["notifications", user.id] })
      );
    }
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery("");
    }
  };

  const { data: epData } = useQuery({
    queryKey: ["ep-balance", user?.id],
    queryFn: () => gamificationApi.eduPointsBalance(user!.id).then((r) => r.data),
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const { data: levelData } = useQuery({
    queryKey: ["level-info", user?.id],
    queryFn: () => gamificationApi.levelInfo(user!.id).then((r) => r.data),
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const displayName = user?.full_name?.trim() || user?.email?.split("@")[0] || user?.phone || "Student";
  const linkBadges  = useLinkBadges();
  const profileBadge = user?.role?.toLowerCase() === "student" ? linkBadges.pending_incoming : 0;
  const avatarKey   = user?.id ? `avatar_${user.id}` : null;
  const [avatarSrc, setAvatarSrc] = useState<string | null>(
    // Server-side photo (works on any device) with the local cache as fallback
    (avatarKey ? localStorage.getItem(avatarKey) : null) ?? user?.avatar_url ?? null
  );

  useEffect(() => {
    const handler = () => {
      if (avatarKey) setAvatarSrc(localStorage.getItem(avatarKey) ?? user?.avatar_url ?? null);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [avatarKey, user?.avatar_url]);

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 gap-3 flex-shrink-0 relative z-20">

      {/* Hamburger */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Search bar — grows when the sidebar collapses to icons (more room freed
          up), shrinks back to its compact width once the sidebar re-expands. */}
      <form
        onSubmit={handleSearch}
        className={`flex-1 transition-[max-width] duration-300 ${collapsed ? "max-w-xl" : "max-w-md"} ${searchOpen ? "flex" : "hidden md:flex"}`}
      >
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onBlur={() => !searchQuery && setSearchOpen(false)}
            placeholder={t("search") + "…"}
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </form>

      {!searchOpen && (
        <button onClick={() => setSearchOpen(true)} className="md:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
          <Search className="w-5 h-5" />
        </button>
      )}
      {!searchOpen && <div className="flex-1 md:hidden" />}

      {/* Right cluster */}
      <div className="flex items-center gap-1 ml-auto">

        {/* EduPoints chip — visible at every width now (previously hidden on
            mobile, forcing DashboardPage.tsx to duplicate it in its own
            chip row) */}
        <Link
          to="/edupoints"
          className="flex items-center gap-1 sm:gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <Coins className="w-3.5 h-3.5" />
          {epData?.balance ?? 0}
        </Link>

        {/* XP chip */}
        <Link
          to="/level"
          className="hidden sm:flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
        >
          <Zap className="w-3.5 h-3.5" />
          {levelData?.total_xp ?? 0} XP
        </Link>

        {/* Notification bell */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => { setNotifOpen((v) => !v); setProfileOpen(false); }}
            className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            aria-label={t("notifications")}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="fixed sm:absolute top-14 sm:top-full right-2 left-2 sm:left-auto sm:right-0 sm:mt-2 sm:w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <span className="font-semibold text-gray-900 dark:text-white text-sm">{t("notifications")}</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                    {t("markAllRead")}
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                {/* Unread messages from parents/teachers */}
                {unreadMsgs.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> Messages
                      </span>
                      <Link
                        to="/messages"
                        onClick={() => setNotifOpen(false)}
                        className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        View all
                      </Link>
                    </div>
                    {unreadMsgs.map((room: any) => (
                      <Link
                        key={room.room_id}
                        to="/messages"
                        onClick={() => setNotifOpen(false)}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors bg-emerald-50/40 dark:bg-emerald-900/10"
                      >
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <MessageSquare className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white">
                            {room.room_name || room.members?.filter((m: any) => m.user_id !== user?.id).map((m: any) => m.full_name).join(", ") || "Chat"}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{room.last_message?.content ?? "New message"}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{room.updated_at ? new Date(room.updated_at).toLocaleDateString() : ""}</p>
                        </div>
                        <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0 mt-1.5" />
                      </Link>
                    ))}
                    <div className="px-4 py-1.5 bg-gray-50 dark:bg-gray-800/50">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Notifications</span>
                    </div>
                  </>
                )}
                {notifs.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-gray-400">No notifications yet</div>
                )}
                {notifs.map((n: any) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${!n.is_read ? "bg-primary-50/50 dark:bg-primary-900/10" : ""}`}
                    onClick={() => {
                      if (!n.is_read && user?.id) {
                        notificationApi.markBulkRead([n.id]).then(() =>
                          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] })
                        );
                      }
                    }}
                  >
                    <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <NotifIcon type={n.template ?? n.type ?? "info"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${!n.is_read ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400"}`}>{n.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{n.body}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{n.created_at ? new Date(n.created_at).toLocaleDateString() : ""}</p>
                    </div>
                    {!n.is_read && <div className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-1.5" />}
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800">
                <Link
                  to="/notifications"
                  onClick={() => setNotifOpen(false)}
                  className="block text-xs text-primary-600 dark:text-primary-400 hover:underline w-full text-center"
                >
                  {t("viewAll")}
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Profile avatar + dropdown */}
        <div ref={profileRef} className="relative ml-1">
          <button
            type="button"
            onClick={() => { setProfileOpen((v) => !v); setNotifOpen(false); }}
            className="relative flex items-center gap-2 pl-1 focus:outline-none"
            aria-label={t("profile")}
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt="avatar" className="w-8 h-8 rounded-full object-cover ring-2 ring-primary-300 dark:ring-primary-600" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold">
                {displayName[0]?.toUpperCase()}
              </div>
            )}
            {profileBadge > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                {profileBadge > 9 ? "9+" : profileBadge}
              </span>
            )}
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden animate-scale-in">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize truncate">{displayName}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email ?? user?.phone}</p>
              </div>

              <div className="py-1">
                <Link
                  to="/profile"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <User className="w-4 h-4 text-gray-400" /> <span className="flex-1">{t("profile")}</span>
                  {profileBadge > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                      {profileBadge > 9 ? "9+" : profileBadge}
                    </span>
                  )}
                </Link>
                <Link
                  to="/subscription"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Zap className="w-4 h-4 text-yellow-400" /> {t("subscription")}
                </Link>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800 py-1">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> {t("logout")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
