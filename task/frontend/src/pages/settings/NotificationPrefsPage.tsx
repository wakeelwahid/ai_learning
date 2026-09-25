import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import BackButton from "@/components/ui/BackButton";
import { Card, Alert } from "@/components/ui";
import { useAppSelector } from "@/store";
import { notificationApi } from "@/lib/api";
import {
  Bell, AlarmClock, Mail, MessageCircle, Monitor,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Channel = "in_app" | "email" | "whatsapp";

interface EventRow {
  key: string;
  label: string;
  description: string;
}

// Student event types (backend fields are `{channel}_{key}`)
const EVENT_ROWS: EventRow[] = [
  {
    key:         "new_video",
    label:       "New Video",
    description: "When a new lesson video is published for your class",
  },
  {
    key:         "quiz_result",
    label:       "Quiz Results",
    description: "Your score as soon as a quiz is graded",
  },
  {
    key:         "battle_invite",
    label:       "Battle Invites",
    description: "When a friend challenges you to a quiz battle",
  },
  {
    key:         "streak_reminder",
    label:       "Streak Reminders",
    description: "A nudge before your daily streak breaks",
  },
  {
    key:         "badge_unlocked",
    label:       "Badge Unlocked",
    description: "When you earn a new badge",
  },
  {
    key:         "promotional",
    label:       "Promotional",
    description: "Offers, new course announcements, and platform updates",
  },
];

// In-app-only daily reminder toggles (keys are the full backend field names)
const REMINDER_ROWS: EventRow[] = [
  {
    key:         "in_app_daily_goal_reminder",
    label:       "Morning Goal Reminder",
    description: "Your personalized daily goal at 8 AM",
  },
  {
    key:         "in_app_friend_activity",
    label:       "Friend Activity",
    description: "When friends hit milestones",
  },
  {
    key:         "in_app_revision_reminder",
    label:       "Night Revision Reminder",
    description: "Revise today's chapter at 9 PM",
  },
];

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
    prefs[`whatsapp_${ev.key}`]  = ev.key === "streak_reminder";
  }
  for (const rem of REMINDER_ROWS) prefs[rem.key] = true;
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
export default function NotificationPrefsPage() {
  const user   = useAppSelector(s => s.auth.user);
  const userId = user?.id ?? "";

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

  // Optimistic per-toggle save: PUT the single changed key, revert on failure
  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) =>
      notificationApi.updatePreferences(userId, { [key]: value }),
    onError: (_err, { key, value }) => {
      setPrefs(prev => ({ ...prev, [key]: !value }));
    },
  });

  function toggle(prefKey: string) {
    const value = !prefs[prefKey];
    setPrefs(prev => ({ ...prev, [prefKey]: value }));
    mutation.mutate({ key: prefKey, value });
  }

  return (
    <div className="w-full space-y-5 animate-fade-in">
      <BackButton label="Back" />
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Bell className="w-6 h-6 text-primary-600 dark:text-primary-400" /> Notification Preferences
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Choose how and when you want to be notified. Changes are saved automatically.
        </p>
      </div>

      {/* Error state */}
      {mutation.isError && (
        <Alert variant="danger">Failed to save preferences. Please try again.</Alert>
      )}

      {/* Section 1: Notifications — event × channel grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 px-1">Notifications</h2>
        <Card noPadding className="overflow-x-auto">
          {/* Column headers */}
          <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,40px)] sm:grid-cols-[minmax(0,1fr)_repeat(3,80px)] items-center gap-1 px-3 sm:px-5 py-3 bg-gray-50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-700 min-w-[230px]">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Event</span>
            {CHANNELS.map(ch => (
              <div key={ch.key} className="flex flex-col items-center gap-1">
                <ch.icon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <span className="text-[9px] sm:text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide text-center leading-tight">
                  {ch.label}
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          {EVENT_ROWS.map((ev, idx) => (
            <div
              key={ev.key}
              className={`grid grid-cols-[minmax(0,1fr)_repeat(3,40px)] sm:grid-cols-[minmax(0,1fr)_repeat(3,80px)] items-center gap-1 px-3 sm:px-5 py-4 min-w-[230px] ${
                idx < EVENT_ROWS.length - 1
                  ? "border-b border-gray-50 dark:border-gray-700/50"
                  : ""
              }`}
            >
              <div className="pr-1 sm:pr-3 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{ev.label}</p>
                <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">{ev.description}</p>
              </div>
              {CHANNELS.map(ch => (
                <div key={ch.key} className="flex justify-center">
                  <Toggle
                    on={!!prefs[`${ch.key}_${ev.key}`]}
                    onChange={() => toggle(`${ch.key}_${ev.key}`)}
                  />
                </div>
              ))}
            </div>
          ))}
        </Card>
      </div>

      {/* Section 2: Daily Reminders — single in-app toggles */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 px-1 flex items-center gap-1.5">
          <AlarmClock className="w-4 h-4 text-gray-400" /> Daily Reminders
        </h2>
        <Card noPadding className="overflow-hidden">
          {REMINDER_ROWS.map((rem, idx) => (
            <div
              key={rem.key}
              className={`flex items-center justify-between gap-4 px-5 py-4 ${
                idx < REMINDER_ROWS.length - 1
                  ? "border-b border-gray-50 dark:border-gray-700/50"
                  : ""
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{rem.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{rem.description}</p>
              </div>
              <Toggle on={!!prefs[rem.key]} onChange={() => toggle(rem.key)} />
            </div>
          ))}
        </Card>
      </div>

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
