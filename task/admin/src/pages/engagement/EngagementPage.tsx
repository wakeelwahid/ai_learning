import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { engagementApi } from "@/lib/api";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  Gauge,
  Gift,
  Pencil,
  Plus,
  Settings2,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type GoalSlot = "video" | "quiz" | "ai_doubt" | "streak";

interface GoalTemplate {
  id: string;
  slot: GoalSlot;
  goal_type: "quiz" | "video" | "questions" | "practice_minutes" | "ai_doubt" | "streak";
  title_template: string;
  target_count: number;
  xp_reward: number;
  ep_reward: number;
  difficulty: "easy" | "medium" | "hard";
  is_active: boolean;
}

interface RewardDay {
  day: number;
  xp: number;
  ep: number;
  label: string;
}

interface ActivityItem {
  id: string;
  user_id: string;
  activity_type: string;
  title: string;
  subject?: string | null;
  score_pct?: number | null;
  xp_earned?: number | null;
  created_at: string;
}

interface AnalyticsRow {
  goal_date: string;
  assigned: number;
  completed: number;
  completion_rate: number;
}

interface ConfigEntry {
  key: string;
  value: { value: unknown };
}

type Tab = "goals" | "rewards" | "activity" | "settings" | "limits";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "goals", label: "Goal Templates", icon: Target },
  { key: "rewards", label: "Reward Calendar", icon: Gift },
  { key: "activity", label: "Activity Log", icon: Activity },
  { key: "limits", label: "Feature Limits", icon: Gauge },
  { key: "settings", label: "Settings", icon: Settings2 },
];

const GOAL_TYPES = [
  { value: "quiz", label: "Quiz" },
  { value: "video", label: "Video" },
  { value: "questions", label: "Questions" },
  { value: "practice_minutes", label: "Practice Minutes" },
  { value: "ai_doubt", label: "Ask AI" },
  { value: "streak", label: "Streak (app open)" },
];

// v2: every student gets 4 fixed daily slots, one goal each — a template
// only competes against other templates in the SAME slot (see
// gamification_service's GoalService._pick_template). Each slot has one
// natural goal_type; picking a slot auto-fills a sensible default type.
// STREAK auto-completes the instant it's assigned (opening the app that
// day IS the goal) — see GoalService._create_slot_goal.
const GOAL_SLOTS: { value: GoalSlot; label: string; hint: string; defaultGoalType: string }[] = [
  { value: "video", label: "Video (mandatory)", hint: "Every student's \"watch videos\" goal — personalized picks when enabled below.", defaultGoalType: "video" },
  { value: "quiz", label: "Quiz", hint: "Every student's \"complete a quiz\" goal — personalized pick when enabled below.", defaultGoalType: "quiz" },
  { value: "ai_doubt", label: "Ask AI", hint: "Every student's \"ask the AI tutor a doubt\" goal.", defaultGoalType: "ai_doubt" },
  { value: "streak", label: "Streak", hint: "Auto-completes the moment the student opens the app that day — no action needed beyond that.", defaultGoalType: "streak" },
];

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

const ACTIVITY_BADGE: Record<string, string> = {
  quiz_completed: "badge-info",
  battle_won: "badge-primary",
  level_up: "badge-primary",
  badge_earned: "badge-warning",
  daily_goal_completed: "badge-success",
};

const CONFIG_LABELS: Record<string, { label: string; hint: string }> = {
  daily_goal_enabled: {
    label: "Daily Goal System",
    hint: "Master switch — when off, no daily goals are generated or shown.",
  },
  daily_goal_personalized: {
    label: "Personalized goal content",
    hint: "When on, the Video and Quiz slots pin SPECIFIC content per student (weak-topic + class/board) instead of \"any video/quiz counts\".",
  },
  battle_reminder_lead_minutes: {
    label: "Battle reminder lead time (minutes)",
    hint: "How many minutes before a scheduled battle the reminder is sent.",
  },
};

// ─── Goal template form ───────────────────────────────────────────────────────

interface TemplateForm {
  slot: GoalSlot;
  goal_type: string;
  title_template: string;
  target_count: number;
  xp_reward: number;
  ep_reward: number;
  difficulty: string;
  is_active: boolean;
}

const EMPTY_TEMPLATE: TemplateForm = {
  slot: "quiz",
  goal_type: "quiz",
  title_template: "Complete {count} Quiz",
  target_count: 1,
  xp_reward: 25,
  ep_reward: 5,
  difficulty: "medium",
  is_active: true,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EngagementPage() {
  const [tab, setTab] = useState<Tab>("goals");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          Student Engagement
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
          Daily goals, check-in rewards, friend activity moderation and dynamic settings — all
          changes apply instantly, no deployment needed.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "goals" && <GoalTemplatesTab />}
      {tab === "rewards" && <RewardCalendarTab />}
      {tab === "activity" && <ActivityLogTab />}
      {tab === "limits" && <FeatureLimitsTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

// ─── Tab 1: Goal Templates ────────────────────────────────────────────────────

function GoalTemplatesTab() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GoalTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_TEMPLATE);
  const [formError, setFormError] = useState("");

  const { data: templates = [], isLoading } = useQuery<GoalTemplate[]>({
    queryKey: ["goal-templates"],
    queryFn: () => engagementApi.listGoalTemplates().then((r) => r.data ?? []),
  });

  const { data: analytics = [] } = useQuery<AnalyticsRow[]>({
    queryKey: ["goal-analytics"],
    queryFn: () => engagementApi.goalAnalytics(14).then((r) => r.data ?? []),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? engagementApi.updateGoalTemplate(editing.id, form)
        : engagementApi.createGoalTemplate(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goal-templates"] });
      setModalOpen(false);
    },
    onError: (err: any) =>
      setFormError(err?.response?.data?.detail ?? "Failed to save goal template."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => engagementApi.deleteGoalTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goal-templates"] }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_TEMPLATE);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (t: GoalTemplate) => {
    setEditing(t);
    setForm({
      slot: t.slot,
      goal_type: t.goal_type,
      title_template: t.title_template,
      target_count: t.target_count,
      xp_reward: t.xp_reward,
      ep_reward: t.ep_reward,
      difficulty: t.difficulty,
      is_active: t.is_active,
    });
    setFormError("");
    setModalOpen(true);
  };

  const totalAssigned = analytics.reduce((a, r) => a + r.assigned, 0);
  const totalCompleted = analytics.reduce((a, r) => a + r.completed, 0);
  const avgRate = totalAssigned ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Analytics strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Goals assigned (14d)</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{totalAssigned}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Goals completed (14d)</p>
          <p className="text-2xl font-bold text-success-600 dark:text-success-400 mt-1">{totalCompleted}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Completion rate</p>
          <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-1">{avgRate}%</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Target className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Goal Templates</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
            Every student gets 4 goals/day — one randomly picked per slot (Video / Quiz / Ask AI / Streak)
          </span>
          <button className="btn btn-primary btn-sm ml-auto flex items-center gap-1" onClick={openCreate}>
            <Plus className="w-4 h-4" /> New Template
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="table-th">Title</th>
                <th className="table-th">Slot</th>
                <th className="table-th">Type</th>
                <th className="table-th">Target</th>
                <th className="table-th">XP</th>
                <th className="table-th">EP</th>
                <th className="table-th">Difficulty</th>
                <th className="table-th">Status</th>
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td className="table-td text-gray-400 dark:text-gray-500" colSpan={9}>Loading…</td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td className="table-td text-center text-gray-400 dark:text-gray-500 py-12" colSpan={9}>No templates yet.</td>
                </tr>
              ) : (
                templates.map((t) => (
                  <tr key={t.id} className="table-row-hover">
                    <td className="table-td font-medium text-gray-900 dark:text-gray-100">
                      {t.title_template.replace("{count}", String(t.target_count))}
                    </td>
                    <td className="table-td">
                      <span className="badge-primary">{GOAL_SLOTS.find((s) => s.value === t.slot)?.label.replace(" (mandatory)", "") ?? t.slot}</span>
                    </td>
                    <td className="table-td">
                      <span className="badge-info">{t.goal_type.replace("_", " ")}</span>
                    </td>
                    <td className="table-td">{t.target_count}</td>
                    <td className="table-td text-primary-700 dark:text-primary-400 font-semibold">+{t.xp_reward}</td>
                    <td className="table-td text-primary-700 dark:text-primary-400 font-semibold">+{t.ep_reward}</td>
                    <td className="table-td">
                      <span
                        className={
                          t.difficulty === "easy"
                            ? "badge-success"
                            : t.difficulty === "medium"
                            ? "badge-warning"
                            : "badge-danger"
                        }
                      >
                        {t.difficulty}
                      </span>
                    </td>
                    <td className="table-td">
                      <span className={t.is_active ? "badge-success" : "badge-gray"}>
                        {t.is_active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="table-td text-right">
                      <button
                        className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 p-1"
                        onClick={() => openEdit(t)}
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        className="text-gray-400 hover:text-danger-600 dark:hover:text-danger-400 p-1"
                        onClick={() => deleteMutation.mutate(t.id)}
                        title="Deactivate"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {editing ? "Edit Goal Template" : "New Goal Template"}
              </h3>
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {formError && (
                <div className="alert-danger">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div>
                <label className="label">Daily Goal Slot</label>
                <select
                  className="input"
                  value={form.slot}
                  onChange={(e) => {
                    const slot = e.target.value as GoalSlot;
                    const preset = GOAL_SLOTS.find((s) => s.value === slot);
                    setForm({ ...form, slot, goal_type: preset?.defaultGoalType ?? form.goal_type });
                  }}
                >
                  {GOAL_SLOTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <p className="helper-text">
                  {GOAL_SLOTS.find((s) => s.value === form.slot)?.hint} This template only competes
                  against other templates in the SAME slot for the daily random pick.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Goal Type</label>
                  <select
                    className="input"
                    value={form.goal_type}
                    onChange={(e) => setForm({ ...form, goal_type: e.target.value })}
                  >
                    {GOAL_TYPES.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Difficulty</label>
                  <select
                    className="input"
                    value={form.difficulty}
                    onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                  >
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Title Template</label>
                <input
                  className="input"
                  value={form.title_template}
                  onChange={(e) => setForm({ ...form, title_template: e.target.value })}
                  placeholder="Complete {count} Quiz"
                />
                <p className="helper-text">
                  Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{"{count}"}</code> where the target
                  number should appear.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Target Count</label>
                  <input
                    type="number" min={1} className="input"
                    value={form.target_count}
                    onChange={(e) => setForm({ ...form, target_count: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">XP Reward</label>
                  <input
                    type="number" min={0} className="input"
                    value={form.xp_reward}
                    onChange={(e) => setForm({ ...form, xp_reward: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">EP Reward</label>
                  <input
                    type="number" min={0} className="input"
                    value={form.ep_reward}
                    onChange={(e) => setForm({ ...form, ep_reward: Number(e.target.value) })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Active (eligible for assignment)
              </label>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={saveMutation.isPending || !form.title_template.trim()}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Reward Calendar ───────────────────────────────────────────────────

function RewardCalendarTab() {
  const qc = useQueryClient();
  const [editingDay, setEditingDay] = useState<RewardDay | null>(null);
  const [form, setForm] = useState({ xp: 0, ep: 0, label: "" });
  const [formError, setFormError] = useState("");

  const { data: calendar = [], isLoading } = useQuery<RewardDay[]>({
    queryKey: ["reward-calendar"],
    queryFn: () => engagementApi.listRewardCalendar().then((r) => r.data ?? []),
  });

  const saveMutation = useMutation({
    mutationFn: () => engagementApi.updateRewardDay(editingDay!.day, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reward-calendar"] });
      setEditingDay(null);
    },
    onError: (err: any) =>
      setFormError(err?.response?.data?.detail ?? "Failed to update reward day."),
  });

  const openEdit = (d: RewardDay) => {
    setEditingDay(d);
    setForm({ xp: d.xp, ep: d.ep, label: d.label });
    setFormError("");
  };

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <CalendarCheck className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Day 1–7 Check-in Rewards</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Students claim one reward per day; the cycle repeats after Day 7. Edits apply to the next
          claim instantly — no deployment required.
        </p>

        {isLoading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[...calendar]
              .sort((a, b) => a.day - b.day)
              .map((d) => (
                <button
                  key={d.day}
                  onClick={() => openEdit(d)}
                  className={`relative rounded-xl border p-4 text-center transition-all hover:shadow-md hover:-translate-y-0.5 ${
                    d.day === 7
                      ? "border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/20"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                  }`}
                >
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500">DAY {d.day}</p>
                  <Gift className="w-7 h-7 mx-auto my-2 text-primary-500 dark:text-primary-400" />
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{d.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {d.xp} XP{d.ep ? ` · ${d.ep} EP` : ""}
                  </p>
                  <Pencil className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 absolute top-2 right-2" />
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Edit Day {editingDay.day} Reward</h3>
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" onClick={() => setEditingDay(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {formError && (
                <div className="alert-danger">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}
              <div>
                <label className="label">Label (shown to students)</label>
                <input
                  className="input" maxLength={50}
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">XP</label>
                  <input
                    type="number" min={0} className="input"
                    value={form.xp}
                    onChange={(e) => setForm({ ...form, xp: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">EduPoints</label>
                  <input
                    type="number" min={0} className="input"
                    value={form.ep}
                    onChange={(e) => setForm({ ...form, ep: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
              <button className="btn btn-secondary" onClick={() => setEditingDay(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={saveMutation.isPending || !form.label.trim()}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Activity Log (moderation) ─────────────────────────────────────────

function ActivityLogTab() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("");

  const { data: items = [], isLoading } = useQuery<ActivityItem[]>({
    queryKey: ["activity-log", typeFilter],
    queryFn: () =>
      engagementApi
        .recentActivity({ limit: 100, activity_type: typeFilter || undefined })
        .then((r) => r.data ?? []),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => engagementApi.deleteActivity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activity-log"] }),
  });

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Friend Activity Feed</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">{items.length} recent events</span>
        </div>
        <select
          className="input sm:ml-auto sm:w-56"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All activity types</option>
          <option value="quiz_completed">Quiz Completed</option>
          <option value="battle_won">Battle Won</option>
          <option value="level_up">Level Up</option>
          <option value="badge_earned">Badge Earned</option>
          <option value="daily_goal_completed">Daily Goal Completed</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
            <tr>
              <th className="table-th">Event</th>
              <th className="table-th">Title</th>
              <th className="table-th">Subject</th>
              <th className="table-th">Score</th>
              <th className="table-th">XP</th>
              <th className="table-th">User</th>
              <th className="table-th">When</th>
              <th className="table-th text-right">Moderate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {isLoading ? (
              <tr><td className="table-td text-gray-400 dark:text-gray-500" colSpan={8}>Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="table-td text-center text-gray-400 dark:text-gray-500 py-12" colSpan={8}>
                  No activity events yet — they appear as students complete quizzes, win battles and
                  level up.
                </td>
              </tr>
            ) : (
              items.map((a) => (
                <tr key={a.id} className="table-row-hover">
                  <td className="table-td">
                    <span className={ACTIVITY_BADGE[a.activity_type] ?? "badge-gray"}>
                      {a.activity_type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="table-td font-medium text-gray-900 dark:text-gray-100">{a.title}</td>
                  <td className="table-td">{a.subject ?? "—"}</td>
                  <td className="table-td">{a.score_pct != null ? `${a.score_pct}%` : "—"}</td>
                  <td className="table-td">{a.xp_earned != null ? `+${a.xp_earned}` : "—"}</td>
                  <td className="table-td font-mono text-xs">
                    {a.user_id.slice(0, 8)}…
                  </td>
                  <td className="table-td text-xs">
                    {new Date(a.created_at).toLocaleString("en-IN", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="table-td text-right">
                    <button
                      className="text-gray-400 hover:text-danger-600 dark:hover:text-danger-400 p-1"
                      title="Remove from feeds"
                      onClick={() => deleteMutation.mutate(a.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Feature Limits (admin-configurable free/premium daily quotas) ──────
// Single governance surface for every gated feature across the whole
// platform — AI features, video watching, quiz attempts, battle play, chat.
// Changes here take effect immediately (no deploy) since every gated
// service reads this table live via gamification_service's internal
// usage/check-and-log endpoint.

interface FeatureLimitRow {
  feature_key: string;
  free_daily_limit: number | null;
  premium_daily_limit: number | null;
  is_active: boolean;
}

const FEATURE_GROUPS: { group: string; keys: string[] }[] = [
  { group: "AI Features", keys: ["ai_questions", "ai_quiz", "ai_paper", "ai_custom", "flashcards", "revision_plan", "ai_chat", "mistake_analysis"] },
  { group: "Learning", keys: ["video_watch", "quiz_attempt"] },
  { group: "Battle", keys: ["battle_play"] },
  { group: "Chat & Social", keys: ["chat_message", "chat_group_create", "friend_request"] },
];

const FEATURE_LABELS: Record<string, string> = {
  ai_questions: "AI Questions", ai_quiz: "AI Quiz", ai_paper: "AI Paper", ai_custom: "AI Custom",
  flashcards: "Flashcards", revision_plan: "Revision Plan", ai_chat: "AI Chat", mistake_analysis: "Mistake Analysis",
  video_watch: "Video Watching", quiz_attempt: "Quiz Attempts",
  battle_play: "Battle Create/Join",
  chat_message: "Messages Sent", chat_group_create: "Group Chat Creation", friend_request: "Friend Requests",
};

function LimitInput({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  return (
    <input
      type="number"
      min={0}
      placeholder="∞"
      className="input w-20 text-right"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        const next = trimmed === "" ? null : Number(trimmed);
        if (next !== value && !(next !== null && Number.isNaN(next))) onCommit(next);
      }}
    />
  );
}

function FeatureLimitsTab() {
  const qc = useQueryClient();

  const { data: limits = [], isLoading } = useQuery<FeatureLimitRow[]>({
    queryKey: ["feature-limits"],
    queryFn: () => engagementApi.listFeatureLimits().then((r) => r.data ?? []),
  });

  const setMutation = useMutation({
    mutationFn: (row: FeatureLimitRow) => engagementApi.setFeatureLimit(row.feature_key, {
      free_daily_limit: row.free_daily_limit,
      premium_daily_limit: row.premium_daily_limit,
      is_active: row.is_active,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feature-limits"] }),
  });

  const byKey = new Map(limits.map((r) => [r.feature_key, r]));

  return (
    <div className="card p-5 space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <Gauge className="w-4 h-4 text-primary-600 dark:text-primary-400" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Feature Limits</h3>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Daily quota per feature, separately for Free and Premium students. Leave a limit blank for unlimited.
        Turn a feature off to make it unlimited for everyone without losing its saved numbers.
        Changes take effect immediately — every gated service checks this table live.
      </p>

      {isLoading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          {FEATURE_GROUPS.map(({ group, keys }) => (
            <div key={group}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">{group}</p>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {keys.map((key) => {
                  const row = byKey.get(key);
                  if (!row) return null;
                  return (
                    <div key={key} className="flex items-center justify-between py-3.5 gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{FEATURE_LABELS[key] ?? key}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {row.is_active ? "Enforced" : "Unlimited (limit disabled)"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="flex flex-col items-center gap-1">
                          <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Free / day</label>
                          <LimitInput
                            value={row.free_daily_limit}
                            onCommit={(v) => setMutation.mutate({ ...row, free_daily_limit: v })}
                          />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Premium / day</label>
                          <LimitInput
                            value={row.premium_daily_limit}
                            onCommit={(v) => setMutation.mutate({ ...row, premium_daily_limit: v })}
                          />
                        </div>
                        <button
                          onClick={() => setMutation.mutate({ ...row, is_active: !row.is_active })}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                            row.is_active ? "bg-primary-600" : "bg-gray-200 dark:bg-gray-700"
                          }`}
                          title={row.is_active ? "Enforced — click to disable (unlimited)" : "Unlimited — click to enforce"}
                        >
                          <span
                            className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${
                              row.is_active ? "translate-x-5" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Settings (dynamic engagement config) ──────────────────────────────

function SettingsTab() {
  const qc = useQueryClient();

  const { data: config = [], isLoading } = useQuery<ConfigEntry[]>({
    queryKey: ["engagement-config"],
    // Backend returns a dict keyed by config name ({"daily_goal_enabled":
    // {"value": true}, ...}), not an array — reshape it here so the render
    // below can stay a simple config.map(...).
    queryFn: () =>
      engagementApi.listConfig().then((r) =>
        Object.entries(r.data ?? {}).map(([key, value]) => ({ key, value })) as ConfigEntry[]
      ),
  });

  const setMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      engagementApi.setConfig(key, { value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engagement-config"] }),
  });

  return (
    <div className="card p-5 space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <Settings2 className="w-4 h-4 text-primary-600 dark:text-primary-400" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Dynamic Settings</h3>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Stored in the database and read live by the engagement services — changes take effect on the
        next scheduler tick / API call.
      </p>

      {isLoading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {config.map((c) => {
            const meta = CONFIG_LABELS[c.key] ?? { label: c.key, hint: "" };
            const val = c.value?.value;
            return (
              <div key={c.key} className="flex items-center justify-between py-3.5 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{meta.label}</p>
                  {meta.hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{meta.hint}</p>}
                </div>
                {typeof val === "boolean" ? (
                  <button
                    onClick={() => setMutation.mutate({ key: c.key, value: !val })}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                      val ? "bg-primary-600" : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${
                        val ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                ) : (
                  <input
                    type="number"
                    className="input w-24 text-right"
                    defaultValue={Number(val ?? 0)}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isNaN(n) && n !== val) setMutation.mutate({ key: c.key, value: n });
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
