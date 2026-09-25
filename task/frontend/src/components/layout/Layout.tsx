import { useState, useEffect } from "react";
import { Outlet, Link, NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "./Sidebar";
import Header from "./Header";
import SiteFooter from "./SiteFooter";
import MaintenancePage from "@/pages/MaintenancePage";
import { Brain, Home, BookOpen, Shield, Trophy, User, MessageSquare, GraduationCap } from "lucide-react";
import { useAppSelector } from "@/store";
import { messageApi, maintenanceApi } from "@/lib/api";
import { useLinkBadges } from "@/hooks/useLinkBadges";
import { useFCM } from "@/hooks/useFCM";
import { ShareModalProvider } from "@/components/ui/ShareAchievementModal";
import DailyRewardPopup from "@/components/dashboard/DailyRewardPopup";

const STUDENT_BOTTOM = [
  { to: "/dashboard",   icon: Home,         label: "Home"     },
  { to: "/learn",       icon: BookOpen,     label: "Learn"    },
  { to: "/messages",    icon: MessageSquare,label: "Messages" },
  { to: "/leaderboard", icon: Trophy,       label: "Ranks"    },
  { to: "/profile",     icon: User,         label: "Profile"  },
];

const PARENT_BOTTOM = [
  { to: "/parent/dashboard", icon: Home,   label: "Home"  },
  { to: "/parent/ai-chat",   icon: Brain,  label: "AI"    },
  { to: "/parent/dashboard", icon: Shield, label: "Watch" },
  { to: "/profile",          icon: User,   label: "Me"    },
];

// Teacher's only page today is the cohort dashboard — a minimal bottom nav.
const TEACHER_BOTTOM = [
  { to: "/teacher/dashboard", icon: GraduationCap, label: "Dashboard" },
  { to: "/profile",           icon: User,          label: "Me"        },
];

const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  const [unreadCount, setUnreadCount] = useState(0);
  const user = useAppSelector(s => s.auth.user);
  const isParent  = user?.role?.toLowerCase() === "parent";
  const isAdmin   = user?.role?.toLowerCase() === "admin";
  const isStudent = user?.role?.toLowerCase() === "student";
  const isTeacher = user?.role?.toLowerCase() === "teacher";
  const BOTTOM_NAV = isParent ? PARENT_BOTTOM : isTeacher ? TEACHER_BOTTOM : STUDENT_BOTTOM;
  const linkBadges = useLinkBadges();
  useFCM(user?.id ?? "");
  const profileBadge = isStudent ? linkBadges.pending_incoming : 0;
  const homeBadge = isParent ? linkBadges.pending_outgoing + linkBadges.pending_approvals : 0;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  // ── Unread count (hook must be before any conditional return) ────────────────
  useEffect(() => {
    if (!user?.id) return;
    const fetchUnread = () => {
      messageApi.unreadCount(user.id)
        .then(res => setUnreadCount(res.data?.count ?? 0))
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // ── Maintenance check (students + parents only, not admins) ─────────────────
  const { data: maintenanceData } = useQuery({
    queryKey: ["maintenance-status"],
    queryFn: () => maintenanceApi.get().then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
    enabled: !isAdmin,
  });
  const maintenance = maintenanceData?.data;
  if (!isAdmin && maintenance?.is_active) {
    return (
      <MaintenancePage
        title={maintenance.title}
        message={maintenance.message}
        endsAt={maintenance.ends_at ?? null}
      />
    );
  }

  return (
    <ShareModalProvider>
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} collapsed={collapsed} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 lg:pb-6">
          <Outlet />
          <SiteFooter />
        </main>
      </div>

      {/* Daily reward popup — appears right after login on ANY page when the
          backend says should_show_popup; students only, never parents */}
      {isStudent && <DailyRewardPopup userId={user?.id} />}

      {/* AI FAB — no teacher-facing AI feature exists yet, so it's hidden
          for that role rather than linking into a student/parent-only route */}
      {isTeacher ? null : (isParent ? (
        <Link
          to="/parent/ai-chat"
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-30 flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-3 rounded-2xl shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105 transition-all duration-200"
        >
          <Shield className="w-5 h-5" />
          <span className="text-sm font-semibold hidden sm:block">AI Insights</span>
        </Link>
      ) : (
        <Link
          to="/ai-assistant"
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-30 flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-3 rounded-2xl shadow-lg shadow-primary-500/30 hover:shadow-primary-500/50 hover:scale-105 transition-all duration-200"
        >
          <Brain className="w-5 h-5" />
          <span className="text-sm font-semibold hidden sm:block">Ask AI Tutor</span>
        </Link>
      ))}

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 lg:hidden safe-area-inset-bottom">
        <div className="flex items-center justify-around px-0.5 py-1.5">
          {BOTTOM_NAV.map(({ to, icon: Icon, label }) => {
            const navBadge = label === "Profile" ? profileBadge : label === "Home" ? homeBadge : 0;
            return (
            <NavLink
              key={`${to}-${label}`}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl transition-colors min-w-0 flex-1 ${
                  isActive
                    ? "text-primary-600 dark:text-primary-400"
                    : "text-gray-400 dark:text-gray-500"
                }`
              }
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {label === "Messages" && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
                {navBadge > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {navBadge > 9 ? "9+" : navBadge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium truncate max-w-full">{label}</span>
            </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
    </ShareModalProvider>
  );
}
