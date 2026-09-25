import { NavLink, Link, useLocation } from "react-router-dom";
import {
  BarChart3, Bell, BookOpen, Bookmark, Brain, ChevronLeft, Clock, GraduationCap,
  Home, Lightbulb, MessageSquare, Rocket, Shield,
  Star, Target, Trophy, Users, X, Zap, FileText, Gift, Swords, Settings, Flag,
} from "lucide-react";
import { clsx } from "clsx";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLinkBadges } from "@/hooks/useLinkBadges";
import type { TranslationKey } from "@/i18n/translations";

// Each nav item uses a translation key instead of a hardcoded string
// desktopOnly: true = hidden on mobile (already in bottom nav or FAB)
type NavItem = {
  to: string; icon: React.ElementType; labelKey: TranslationKey;
  badge?: string; desktopOnly?: boolean;
};

const STUDENT_NAV: NavItem[] = [
  { to: "/dashboard",     icon: Home,          labelKey: "dashboard"   },
  { to: "/learn",         icon: BookOpen,      labelKey: "learn"       },
  { to: "/knowledge-hub", icon: Lightbulb,     labelKey: "knowledgeHub"},
  { to: "/analytics",    icon: BarChart3,     labelKey: "analytics"   },
  { to: "/pyps",         icon: FileText,      labelKey: "pypPapers"   },
  { to: "/revision",     icon: Target,        labelKey: "revision",     badge: "🎯" },
  { to: "/saved",        icon: Bookmark,      labelKey: "saved",        desktopOnly: true },
  { to: "/battle",       icon: Swords,        labelKey: "battle",       badge: "⚔️" },
  { to: "/challenges",   icon: Flag,          labelKey: "challenges" },
  { to: "/careers",      icon: Rocket,        labelKey: "careers",      badge: "🚀" },
  { to: "/leaderboard",  icon: Trophy,        labelKey: "leaderboard",  desktopOnly: true },
  { to: "/referral",     icon: Gift,          labelKey: "referEarn",    badge: "🎁" },
  { to: "/messages",     icon: MessageSquare, labelKey: "messages",     desktopOnly: true },
  { to: "/roadmap",      icon: Rocket,        labelKey: "upcoming",     badge: "New" },
];

const PARENT_NAV: NavItem[] = [
  { to: "/parent/dashboard",             icon: Home,          labelKey: "dashboard"     },
  { to: "/parent/dashboard?tab=overview", icon: BarChart3,     labelKey: "analytics"    },
  { to: "/parent/ai-chat",               icon: Brain,         labelKey: "aiTutor",       badge: "AI" },
  { to: "/parent/messages",              icon: MessageSquare, labelKey: "messages"      },
  { to: "/parent/communication",         icon: Bell,          labelKey: "notifications" },
  { to: "/parent/study-limits",          icon: Clock,         labelKey: "studyLimits"   },
  { to: "/parent/notification-prefs",    icon: Bell,          labelKey: "notifPrefs"    },
];

// Teacher nav is intentionally minimal — the only teacher-facing page today
// is read-only cohort analytics; there's no roster, messaging or content
// authoring UI yet.
const TEACHER_NAV: NavItem[] = [
  { to: "/teacher/dashboard",            icon: Home,          labelKey: "dashboard"     },
];

interface Props {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export default function Sidebar({ open, onClose, collapsed, onToggleCollapsed }: Props) {
  const user      = useAppSelector(s => s.auth.user);
  const location  = useLocation();
  const { t }     = useLanguage();
  const role      = user?.role?.toLowerCase();
  const isParent  = role === "parent";
  const isTeacher = role === "teacher";

  const email       = user?.email ?? "";
  const emailPrefix = email.split("@")[0] ?? "";
  const displayName = user?.full_name?.trim() || (emailPrefix.length > 1 ? emailPrefix : email) || (isParent ? "Parent" : isTeacher ? "Teacher" : "Student");
  const avatarLetter = (user?.full_name?.trim()[0] ?? emailPrefix[0] ?? "U").toUpperCase();
  const roleLabel   = isParent ? t("profile") : isTeacher ? "Teacher" : "Student";

  const dashLink = isParent ? "/parent/dashboard" : isTeacher ? "/teacher/dashboard" : "/dashboard";
  const navItems: NavItem[] = isParent ? PARENT_NAV : isTeacher ? TEACHER_NAV : STUDENT_NAV;
  const badges = useLinkBadges();
  const countFor = (to: string) =>
    isParent && to === "/parent/dashboard" ? badges.pending_outgoing + badges.pending_approvals : 0;

  return (
    <aside
      className={clsx(
        "fixed lg:static inset-y-0 left-0 z-30 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col transition-[width,transform] duration-300",
        collapsed ? "lg:w-20" : "lg:w-64",
        "w-64", // mobile drawer always shows full width regardless of desktop collapse
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
    >
      {/* Logo */}
      <div className={clsx("flex items-center border-b border-gray-100 dark:border-gray-800 px-5 py-5", collapsed ? "lg:justify-center lg:px-0" : "justify-between")}>
        <Link to={dashLink} className="flex items-center gap-3 min-w-0" onClick={onClose}>
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
            {isParent ? <Shield className="w-4 h-4 text-white" /> : isTeacher ? <GraduationCap className="w-4 h-4 text-white" /> : <Star className="w-4 h-4 text-white" />}
          </div>
          <div className={clsx(collapsed && "lg:hidden", "min-w-0")}>
            <span className="text-base font-bold text-gray-900 dark:text-white">EduLearn</span>
            <span className="block text-[10px] text-gray-400 dark:text-gray-500 font-medium -mt-0.5 truncate">
              {isParent ? "Parent Portal" : isTeacher ? "Teacher Portal" : "AI Learning Platform"}
            </span>
          </div>
        </Link>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
        >
          <X className="w-4 h-4" />
        </button>
        {/* Desktop collapse toggle */}
        <button
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={clsx(
            "hidden lg:flex p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors flex-shrink-0",
            collapsed && "lg:hidden"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Re-expand handle when collapsed (centered chevron) */}
      {collapsed && (
        <button
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          className="hidden lg:flex items-center justify-center py-2 border-b border-gray-100 dark:border-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 rotate-180" />
        </button>
      )}

      {/* Parent: student selector shortcut */}
      {isParent && (
        <div className={clsx("mx-3 mt-3 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-100 dark:border-primary-800", collapsed && "lg:hidden")}>
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
            <span className="text-xs font-bold text-primary-700 dark:text-primary-300 uppercase tracking-wide">Monitoring</span>
          </div>
          <Link to="/parent/dashboard" onClick={onClose} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-white text-[10px] font-bold">R</div>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Rahul · Class 10 CBSE</span>
          </Link>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const { to, icon: Icon, labelKey, badge, desktopOnly } = item;
          const count = countFor(to);
          const [toPath, toQuery] = to.split("?");
          // NavLink's own isActive only compares pathname, so "Home" and
          // "Analytics" (both /parent/dashboard, differing only by ?tab=)
          // would otherwise highlight together — compare the query string
          // too so only the entry matching the current tab lights up.
          const isActiveOverride = toPath === location.pathname && (toQuery ?? "") === location.search.replace(/^\?/, "");
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              title={collapsed ? t(labelKey) : undefined}
              className={() =>
                clsx(
                  "items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative",
                  desktopOnly ? "hidden lg:flex" : "flex",
                  collapsed && "lg:justify-center",
                  isActiveOverride
                    ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                )
              }
            >
              <span className="relative flex-shrink-0">
                <Icon className="w-4 h-4" />
                {count > 0 && collapsed && (
                  <span className="hidden lg:flex absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full items-center justify-center leading-none">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </span>
              <span className={clsx("flex-1", collapsed && "lg:hidden")}>{t(labelKey)}</span>
              {count > 0 && (
                <span className={clsx("min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none", collapsed && "lg:hidden")}>
                  {count > 9 ? "9+" : count}
                </span>
              )}
              {badge && (
                <span className={clsx(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  collapsed && "lg:hidden",
                  badge === "AI"  ? "bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" :
                  badge === "New" ? "bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" :
                                    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                )}>
                  {badge}
                </span>
              )}
              {collapsed && (
                <span className="hidden lg:group-hover:block absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-gray-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-lg z-40">
                  {t(labelKey)}
                </span>
              )}
            </NavLink>
          );
        })}

        {/* Settings (hub: account, language, information pages) */}
        <NavLink
          to="/settings"
          onClick={onClose}
          title={collapsed ? "Settings" : undefined}
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative",
              collapsed && "lg:justify-center",
              isActive
                ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            )
          }
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          <span className={clsx("flex-1", collapsed && "lg:hidden")}>Settings</span>
          {collapsed && (
            <span className="hidden lg:group-hover:block absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-gray-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-lg z-40">
              Settings
            </span>
          )}
        </NavLink>

        {isParent && (
          <Link
            to="/parent/link-student"
            onClick={onClose}
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 transition-all border-2 border-dashed border-gray-200 dark:border-gray-700 mt-2",
              collapsed && "lg:hidden"
            )}
          >
            <Users className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Add Another Child</span>
          </Link>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-gray-100 dark:border-gray-800">
        <div className={clsx("flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800", collapsed && "lg:justify-center lg:px-0")}>
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {avatarLetter}
          </div>
          <div className={clsx("flex-1 min-w-0", collapsed && "lg:hidden")}>
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate capitalize">{displayName}</p>
            <div className="flex items-center gap-1 mt-0.5">
              {isParent ? <Shield className="w-3 h-3 text-primary-500 dark:text-primary-400" /> : isTeacher ? <GraduationCap className="w-3 h-3 text-primary-500 dark:text-primary-400" /> : <Zap className="w-3 h-3 text-yellow-500" />}
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{roleLabel}</span>
            </div>
          </div>
          <Zap className={clsx("w-4 h-4 text-gray-300 dark:text-gray-500 flex-shrink-0", collapsed && "lg:hidden")} />
        </div>
      </div>
    </aside>
  );
}
