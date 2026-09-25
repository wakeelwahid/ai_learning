import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import BackButton from "@/components/ui/BackButton";
import { Button, Card, Alert } from "@/components/ui";
import { useAppSelector } from "@/store";
import { notificationApi } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/i18n/translations";
import {
  Bell, CheckCircle, Mail, MessageCircle, Monitor, Save,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Channel = "in_app" | "email" | "whatsapp";

interface EventRow {
  key: string;
  label: string;
  description: string;
  labelKey?: TranslationKey;
  descriptionKey?: TranslationKey;
}

// Event types (keys map to the backend notification preference fields `{channel}_{key}`)
const EVENT_ROWS: EventRow[] = [
  {
    key:         "new_video",
    label:       "New Videos Published",
    description: "When new lesson videos are published for your child's class",
  },
  {
    key:         "quiz_result",
    label:       "Quiz Results",
    description: "When your child completes a quiz",
  },
  {
    key:         "battle_invite",
    label:       "Battle Invites",
    description: "When your child receives a quiz battle challenge",
  },
  {
    key:         "streak_reminder",
    label:       "Streak Reminders",
    description: "When the daily streak is at risk",
  },
  {
    key:         "badge_unlocked",
    label:       "Badges Unlocked",
    description: "When your child earns a new badge",
  },
  {
    key:         "promotional",
    label:       "Promotional",
    description: "Offers, new course announcements, and platform updates",
  },
  {
    key:            "parent_link",
    label:          "Link requests & approvals",
    description:    "When a child approves, rejects or removes a link",
    labelKey:       "parentNotifLinkRequests",
    descriptionKey: "parentNotifLinkRequestsDesc",
  },
  {
    key:            "purchase_approval",
    label:          "Purchase approvals",
    description:    "When your child asks you to approve a plan purchase",
    labelKey:       "parentNotifPurchaseApprovals",
    descriptionKey: "parentNotifPurchaseApprovalsDesc",
  },
  {
    key:            "child_weekly_summary",
    label:          "Weekly child summary",
    description:    "A weekly digest of your child's activity",
    labelKey:       "parentNotifWeeklySummary",
    descriptionKey: "parentNotifWeeklySummaryDesc",
  },
  {
    key:            "meeting_update",
    label:          "Meeting updates",
    description:    "When a meeting request is confirmed or declined",
    labelKey:       "parentNotifMeetingUpdates",
    descriptionKey: "parentNotifMeetingUpdatesDesc",
  },
];

const PARENT_EVENT_KEYS = new Set(["parent_link", "purchase_approval", "child_weekly_summary", "meeting_update"]);

const CHANNELS: { key: Channel; label: string; icon: React.ElementType }[] = [
  { key: "in_app",    label: "In-App",   icon: Monitor        },
  { key: "email",     label: "Email",    icon: Mail           },
  { key: "whatsapp",  label: "WhatsApp", icon: MessageCircle  },
];

// Default prefs when API hasn't loaded yet
function buildDefaultPrefs(): Record<string, boolean> {
  const prefs: Record<string, boolean> = {};
  for (const ev of EVENT_ROWS) {
    prefs[`in_app_${ev.key}`]    = true;
    prefs[`email_${ev.key}`]     = ev.key !== "promotional";
    prefs[`whatsapp_${ev.key}`]  = ev.key === "streak_reminder" || PARENT_EVENT_KEYS.has(ev.key);
  }
  return prefs;
}

// ── Small toggle ──────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
        on ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-600"
      }`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ParentNotificationPrefsPage() {
  const { t } = useLanguage();
  const user   = useAppSelector(s => s.auth.user);
  const userId = user?.id ?? "";

  const [saved,  setSaved]  = useState(false);
  const [prefs,  setPrefs]  = useState<Record<string, boolean>>(buildDefaultPrefs);
  const [loaded, setLoaded] = useState(false);

  // Load from server
  const { data: serverPrefs } = useQuery<Record<string, boolean>>({
    queryKey: ["notification-prefs", userId],
    queryFn:  () => notificationApi.getPreferences(userId).then(r => r.data),
    enabled:  !!userId,
  });

  // Merge server data into local state once when it first arrives
  useEffect(() => {
    if (serverPrefs && !loaded) {
      setPrefs(prev => ({ ...prev, ...serverPrefs }));
      setLoaded(true);
    }
  }, [serverPrefs, loaded]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, boolean>) =>
      notificationApi.updatePreferences(userId, data),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  function toggle(channel: Channel, eventKey: string) {
    const prefKey = `${channel}_${eventKey}`;
    setPrefs(prev => ({ ...prev, [prefKey]: !prev[prefKey] }));
  }

  function handleSave() {
    mutation.mutate(prefs);
  }

  return (
    <div className="w-full space-y-5 animate-fade-in">
      <BackButton label="Back" />
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary-500" /> Notification Preferences
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Choose how and when you want to be notified about your children's activity.
          </p>
        </div>

        <Button type="button" onClick={handleSave} disabled={mutation.isPending}>
          {saved ? (
            <>
              <CheckCircle className="w-4 h-4" /> Saved
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {mutation.isPending ? "Saving…" : "Save Preferences"}
            </>
          )}
        </Button>
      </div>

      {/* Error state */}
      {mutation.isError && (
        <Alert variant="danger">Failed to save preferences. Please try again.</Alert>
      )}

      {/* Table */}
      <Card noPadding>
        {/* Column headers */}
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,_44px)] xs:grid-cols-[minmax(0,1fr)_repeat(3,_56px)] sm:grid-cols-[minmax(0,1fr)_repeat(3,_80px)] items-center px-3 xs:px-5 py-3 bg-gray-50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-700 gap-1">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">Event</span>
          {CHANNELS.map(ch => (
            <div key={ch.key} className="flex flex-col items-center gap-1 min-w-0">
              <ch.icon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <span className="text-[9px] xs:text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate max-w-full">
                {ch.label}
              </span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {EVENT_ROWS.map((ev, idx) => (
          <div
            key={ev.key}
            className={`grid grid-cols-[minmax(0,1fr)_repeat(3,_44px)] xs:grid-cols-[minmax(0,1fr)_repeat(3,_56px)] sm:grid-cols-[minmax(0,1fr)_repeat(3,_80px)] items-center px-3 xs:px-5 py-4 gap-1 ${
              idx < EVENT_ROWS.length - 1
                ? "border-b border-gray-50 dark:border-gray-700/50"
                : ""
            }`}
          >
            <div className="pr-2 xs:pr-3 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{ev.labelKey ? t(ev.labelKey) : ev.label}</p>
              <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">{ev.descriptionKey ? t(ev.descriptionKey) : ev.description}</p>
            </div>
            {CHANNELS.map(ch => (
              <div key={ch.key} className="flex justify-center">
                <Toggle
                  on={!!prefs[`${ch.key}_${ev.key}`]}
                  onChange={() => toggle(ch.key, ev.key)}
                />
              </div>
            ))}
          </div>
        ))}
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-400 px-1">
        {CHANNELS.map(ch => (
          <div key={ch.key} className="flex items-center gap-1.5">
            <ch.icon className="w-3.5 h-3.5" />
            <span className="font-medium">{ch.label}</span>
            {ch.key === "whatsapp" && (
              <span className="italic">(requires WhatsApp number on your account)</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
