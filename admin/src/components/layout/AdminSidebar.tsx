import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, BookOpen, FileQuestion,
  BarChart2, CreditCard, Bell, Trophy, Share2,
  ShieldCheck, FolderUp, Wand2, ScrollText, Tag,
  X, Swords, Briefcase, FileText, Rss, LibraryBig, Layers,
  TrendingUp, ClipboardList, CalendarDays, Flag, History, Mail,
  Activity, Image,
} from "lucide-react";
import { clsx } from "clsx";
import { useAppSelector } from "@/store";

const sections = [
  {
    title: "Overview",
    items: [
      { to: "/dashboard",  icon: LayoutDashboard, label: "Dashboard" },
      { to: "/analytics",  icon: BarChart2,        label: "Analytics" },
    ],
  },
  {
    title: "Management",
    items: [
      { to: "/users",    icon: Users,        label: "Users"    },
      { to: "/meetings", icon: CalendarDays, label: "Meetings" },
      { to: "/content",          icon: BookOpen,   label: "Content"         },
      { to: "/content-manager", icon: LibraryBig, label: "Content Manager"  },
      { to: "/assignments",     icon: ClipboardList, label: "Assignments"   },
      { to: "/quizzes",    icon: FileQuestion, label: "Quizzes"    },
      { to: "/battles",    icon: Swords,       label: "Battles"    },
      { to: "/careers",     icon: Briefcase,    label: "Careers"    },
      { to: "/info-pages",  icon: FileText,     label: "CMS Pages"  },
      { to: "/blog-posts",  icon: Rss,          label: "Blog Posts" },
    ],
  },
  {
    title: "Growth",
    items: [
      { to: "/payments",      icon: CreditCard, label: "Payments"      },
      { to: "/plans",         icon: Layers,     label: "Plans"         },
      { to: "/coupons",       icon: Tag,        label: "Coupons"       },
      { to: "/referrals",     icon: Share2,     label: "Referrals"     },
      { to: "/notifications", icon: Bell,       label: "Notifications" },
    ],
  },
  {
    title: "AI & Engage",
    items: [
      { to: "/gamification",     icon: Trophy,     label: "Gamification"       },
      { to: "/challenges",       icon: Flag,       label: "Challenges"         },
      { to: "/engagement",       icon: TrendingUp, label: "Engagement"         },
      { to: "/rag-upload",       icon: FolderUp,   label: "RAG Upload"         },
      { to: "/ai-content",       icon: FileText,   label: "AI Content"         },
      { to: "/ai-generate",      icon: Wand2,      label: "AI Generator"       },
      { to: "/generated-papers", icon: ScrollText, label: "Generated Papers"   },
    ],
  },
  {
    title: "Security",
    items: [
      { to: "/moderation",       icon: ShieldCheck, label: "Moderation"       },
      { to: "/contact-messages", icon: Mail,        label: "Contact Messages" },
      { to: "/audit-log",        icon: History,     label: "Audit Log"        },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/platform-health",     icon: Activity, label: "Platform Health" },
      { to: "/login-backgrounds",   icon: Image,     label: "Login Screen"    },
    ],
  },
];

interface AdminSidebarProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export default function AdminSidebar({ open, setOpen }: AdminSidebarProps) {
  const user = useAppSelector((s) => s.auth.user);

  return (
    <>
      {/* Desktop: always-visible fixed sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 shrink-0 h-screen overflow-y-auto">
        <SidebarContent user={user} onClose={() => setOpen(false)} showClose={false} />
      </aside>

      {/* Mobile: off-canvas drawer */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-30 flex flex-col w-64 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 overflow-y-auto transition-transform duration-300 ease-in-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-modal="true"
        role="dialog"
        aria-label="Sidebar navigation"
      >
        <SidebarContent user={user} onClose={() => setOpen(false)} showClose />
      </aside>
    </>
  );
}

interface SidebarContentProps {
  user: { email?: string; role?: string } | null | undefined;
  onClose: () => void;
  showClose: boolean;
}

function SidebarContent({ user, onClose, showClose }: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Logo / brand */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-gray-900 dark:text-white font-bold text-sm leading-none truncate">EduAdmin</p>
            <p className="text-gray-400 dark:text-white/40 text-xs mt-0.5">Admin Panel</p>
          </div>
        </div>
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-white/50 dark:hover:text-white dark:hover:bg-white/10 transition-colors shrink-0 ml-2"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="text-gray-400 dark:text-white/30 text-[10px] font-semibold uppercase tracking-widest px-3 mb-1.5">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary-50 text-primary-700 dark:bg-white/10 dark:text-white"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white/80"
                    )
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: logged-in user info */}
      <div className="shrink-0 px-4 py-3 border-t border-gray-100 dark:border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0">
            <span className="text-xs text-gray-600 dark:text-white/70 font-semibold uppercase">
              {user?.email?.[0] ?? "?"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-gray-600 dark:text-white/70 text-xs truncate">{user?.email}</p>
            {user?.role && (
              <span className="inline-flex mt-0.5 px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide bg-primary-50 text-primary-700 dark:bg-primary-600/30 dark:text-primary-300">
                {user.role}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
