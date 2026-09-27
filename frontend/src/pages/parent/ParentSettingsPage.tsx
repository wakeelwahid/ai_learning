import { useState } from "react";
import {
  Bell, Shield, Moon, Sun, Globe, LogOut, ChevronRight,
  User, Lock, Smartphone, Check,
} from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/store";
import { logout } from "@/store/auth";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES, type Lang } from "@/i18n/translations";
import { Card } from "@/components/ui";
import { useSelectedChild } from "@/hooks/useSelectedChild";
import ApprovalModeToggle from "@/components/parent/ApprovalModeToggle";

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-600"}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card noPadding className="overflow-hidden">
      <p className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
        {title}
      </p>
      {children}
    </Card>
  );
}

function Row({ icon: Icon, label, sublabel, right, onClick, danger }: {
  icon: React.ElementType; label: string; sublabel?: string;
  right?: React.ReactNode; onClick?: () => void; danger?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${onClick ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors" : ""} ${danger ? "text-danger-600" : ""}`}
      onClick={onClick}
    >
      <Icon className={`w-5 h-5 shrink-0 ${danger ? "text-danger-600" : "text-gray-400 dark:text-gray-500"}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${danger ? "text-danger-600" : "text-gray-900 dark:text-white"}`}>{label}</p>
        {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
      </div>
      {right ?? (onClick && <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />)}
    </div>
  );
}

export default function ParentSettingsPage() {
  const user     = useAppSelector(s => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();
  const { t, language, setLanguage } = useLanguage();

  const [langOpen,  setLangOpen]  = useState(false);
  const { approvedChildren } = useSelectedChild();

  const displayName = user?.full_name?.trim() || user?.email?.split("@")[0] || user?.phone || "Parent";
  const currentLang = LANGUAGES.find(l => l.code === language);

  function handleLogout() {
    dispatch(logout());
    navigate("/login");
  }

  return (
    <div className="w-full px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("settings")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("parentSettingsSubtitle")}</p>
      </div>

      {/* Profile card */}
      <div className="bg-primary-600 rounded-xl p-5 text-white flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold flex-shrink-0">
          {displayName[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-lg capitalize truncate">{displayName}</p>
          <p className="text-sm text-white/70 truncate">{user?.email ?? user?.phone}</p>
          <span className="inline-block mt-1 text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">Parent Account</span>
        </div>
      </div>

      {/* Account */}
      <Section title="Account">
        <Row icon={User}       label="Edit Profile"    sublabel="Name, phone, profile photo" onClick={() => navigate("/profile")} />
        <Row icon={Lock}       label="Change Password" sublabel="Update your login credentials" onClick={() => navigate("/profile")} />
        <Row icon={Smartphone} label="Linked Phone"    sublabel={user?.phone ?? "Not set"} />
      </Section>

      {/* Notifications — real preferences (per-event, per-channel) live on their
          own dedicated page; this row is a shortcut there rather than a second,
          separate set of toggles that would silently fail to persist. */}
      <Section title={t("notifications")}>
        <Row icon={Bell} label="Notification Preferences" sublabel="Choose what you're notified about and how"
          onClick={() => navigate("/parent/notification-prefs")} />
      </Section>

      {/* Controls */}
      <Section title={t("parentControlsSection")}>
        {approvedChildren.length === 0 ? (
          <p className="px-4 py-3.5 text-xs text-gray-400">{t("parentNoApprovedChildren")}</p>
        ) : (
          approvedChildren.map(child => (
            <div key={child.id} className="flex items-start gap-3 px-4 py-3.5 border-b last:border-b-0 border-gray-50 dark:border-gray-700/50">
              <Shield className="w-5 h-5 shrink-0 text-gray-400 dark:text-gray-500 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{child.student_name?.trim() || t("parentStudentFallback")}</p>
                <ApprovalModeToggle link={child} className="mt-1" />
              </div>
            </div>
          ))
        )}
      </Section>

      {/* Appearance & Language */}
      <Section title="Appearance & Language">
        <Row
          icon={dark ? Moon : Sun}
          label={t("darkMode") || "Dark Mode"}
          sublabel={dark ? "Currently dark" : "Currently light"}
          right={<Toggle on={dark} onChange={toggle} />}
        />

        {/* Language selector */}
        <div>
          <div
            className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            onClick={() => setLangOpen(v => !v)}
          >
            <Globe className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t("changeLanguage")}</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{currentLang?.nativeLabel} ({currentLang?.label})</p>
            </div>
            <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform flex-shrink-0 ${langOpen ? "rotate-90" : ""}`} />
          </div>

          {langOpen && (
            <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/50">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => { setLanguage(lang.code as Lang); setLangOpen(false); }}
                  className="w-full flex items-center gap-3 px-6 py-3 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{lang.script.slice(0, 1)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold text-gray-900 dark:text-white truncate"
                      dir={lang.dir}
                    >
                      {lang.nativeLabel}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{lang.label}</p>
                  </div>
                  {language === lang.code && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Actions */}
      <Section title="Account Actions">
        <Row icon={LogOut} label={t("logout")} danger onClick={handleLogout} />
      </Section>

      <p className="text-center text-xs text-gray-400 pb-4">EduApp v2.0 · Parent Portal</p>
    </div>
  );
}
