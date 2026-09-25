import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Lang } from "@/i18n/translations";
import { useAppSelector } from "@/store";
import { useTheme } from "@/hooks/useTheme";
import {
  User, Globe, Info, ChevronRight, Check, MessageSquarePlus,
  HelpCircle, Mail, Shield, ScrollText, RefreshCcw, Bell, Moon, Sun,
} from "lucide-react";

const LANGUAGES: { code: Lang; nativeLabel: string }[] = [
  { code: "en", nativeLabel: "English" },
  { code: "hi", nativeLabel: "हिंदी" },
  { code: "pa", nativeLabel: "ਪੰਜਾਬੀ" },
  { code: "ur", nativeLabel: "اردو" },
];

const INFORMATION = [
  { slug: "about-us",       label: "About Us",          icon: Info },
  { slug: "contact-us",     label: "Contact Us",        icon: Mail },
  { slug: "faq",            label: "FAQ",               icon: HelpCircle },
  { slug: "privacy-policy", label: "Privacy Policy",    icon: Shield },
  { slug: "terms",          label: "Terms & Conditions",icon: ScrollText },
  { slug: "refund-policy",  label: "Refund Policy",     icon: RefreshCcw },
];

export default function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const { dark, toggle } = useTheme();
  const role = useAppSelector((s) => s.auth.user?.role?.toLowerCase());

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>

      <div className="xl:flex xl:gap-8 xl:items-start">
        {/* ── LEFT: Account + Language ── */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Account Settings */}
          <section className="space-y-2">
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1">Account</p>
            <Link
              to="/profile"
              className="card p-4 flex items-center gap-3 hover:border-primary-300 dark:hover:border-primary-600 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white">Account Settings</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Update your profile, password & account</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
            </Link>
            {role === "student" && (
              <Link
                to="/notification-prefs"
                className="card p-4 flex items-center gap-3 hover:border-primary-300 dark:hover:border-primary-600 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white">Notification Preferences</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Choose how and when you get notified</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
              </Link>
            )}
          </section>

          {/* Appearance — dark mode moved here from the header toggle so the
              header stays uncluttered on small screens */}
          <section className="space-y-2">
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1">Appearance</p>
            <button
              onClick={toggle}
              className="card p-4 flex items-center gap-3 w-full text-left hover:border-primary-300 dark:hover:border-primary-600 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                {dark ? <Sun className="w-5 h-5 text-primary-600 dark:text-primary-400" /> : <Moon className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white">Dark Mode</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{dark ? "Currently on" : "Currently off"}</p>
              </div>
              {/* Switch */}
              <span className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${dark ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-700"}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${dark ? "translate-x-4" : "translate-x-0"}`} />
              </span>
            </button>
          </section>

          {/* Language */}
          <section className="space-y-2">
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1">Language</p>
            <div className="card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">App Language</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Choose your preferred language</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLanguage(l.code)}
                    className={`flex items-center justify-between gap-1 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                      language === l.code
                        ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                        : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary-400"
                    }`}
                  >
                    <span className="truncate">{l.nativeLabel}</span>
                    {language === l.code && <Check className="w-4 h-4 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Information — mobile/tablet only */}
          <section className="space-y-2 xl:hidden">
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1">Information</p>
            <div className="card p-0 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
              {INFORMATION.map((item) => (
                <Link
                  key={item.slug}
                  to={`/info/${item.slug}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                </Link>
              ))}
              <Link
                to="/feedback"
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                  <MessageSquarePlus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">Send Feedback</span>
                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
              </Link>
            </div>
          </section>
        </div>

        {/* ── RIGHT: Information sidebar (xl+) ── */}
        <aside className="hidden xl:flex flex-col w-72 2xl:w-80 flex-shrink-0 sticky top-6 self-start">
          <section className="space-y-2">
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1">Information</p>
            <div className="card p-0 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
              {INFORMATION.map((item) => (
                <Link
                  key={item.slug}
                  to={`/info/${item.slug}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                </Link>
              ))}
              <Link
                to="/feedback"
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                  <MessageSquarePlus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">Send Feedback</span>
                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
