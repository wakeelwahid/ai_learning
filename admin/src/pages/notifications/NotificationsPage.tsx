import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationApi, announcementApi, maintenanceApi } from "@/lib/api";
import { useForm } from "react-hook-form";
import {
  Bell, Mail, MessageSquare, Smartphone, Send, Flame, BarChart2,
  Users, Loader, Megaphone, Plus, Trash2, Pencil, Pin, X, Check,
  Sparkles, RefreshCw, Wrench, BookOpen, ExternalLink, ShieldAlert, Clock,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BroadcastForm {
  title: string;
  message: string;
  channels: string[];
  target: string;
}

type AnnouncementType = "feature" | "update" | "maintenance" | "exam" | "general";

interface AnnouncementForm {
  title: string;
  body: string;
  type: AnnouncementType;
  link_url: string;
  release_date: string;
  expires_at: string;
  is_pinned: boolean;
  is_active: boolean;
}

interface Announcement {
  id: string; title: string; body: string; type: AnnouncementType;
  link_url: string | null; image_url: string | null;
  release_date: string; expires_at: string | null;
  is_active: boolean; is_pinned: boolean;
  created_by: string | null; created_at: string; updated_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CHANNELS = [
  { key: "email", label: "Email", icon: Mail },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { key: "push", label: "Push Notification", icon: Smartphone },
];

interface SentBroadcast {
  id: string;
  title: string;
  channels: string[];
  target: string;
  sent_at: string;
}

const TYPE_OPTIONS: { value: AnnouncementType; label: string; icon: React.ElementType; color: string }[] = [
  { value: "feature",     label: "New Feature",    icon: Sparkles,  color: "text-primary-500 dark:text-primary-400" },
  { value: "update",      label: "Platform Update", icon: RefreshCw, color: "text-info-500 dark:text-info-400" },
  { value: "maintenance", label: "Maintenance",     icon: Wrench,    color: "text-warning-500 dark:text-warning-400" },
  { value: "exam",        label: "Exam Info",       icon: BookOpen,  color: "text-success-500 dark:text-success-400" },
  { value: "general",     label: "General",         icon: Megaphone, color: "text-gray-500 dark:text-gray-400" },
];

const TYPE_BADGE: Record<AnnouncementType, string> = {
  feature:     "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300",
  update:      "bg-info-100 text-info-700 dark:bg-info-900/40 dark:text-info-300",
  maintenance: "bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-300",
  exam:        "bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-300",
  general:     "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

const typeIcon: Record<string, typeof Mail> = { email: Mail, whatsapp: MessageSquare, push: Smartphone };
const typeColor: Record<string, string> = { email: "badge-info", whatsapp: "badge-success", push: "badge-primary" };

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Broadcast Tab ────────────────────────────────────────────────────────────
function BroadcastTab() {
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["push"]);
  const [loadingJobs, setLoadingJobs] = useState<Record<string, boolean>>({});
  // Real sends from THIS admin session — not a fabricated server history.
  // No aggregate "recent broadcasts" endpoint exists server-side (each
  // Notification row is per-recipient, not per-broadcast), so rather than
  // faking one, this tracks what was actually just sent.
  const [sentLog, setSentLog] = useState<SentBroadcast[]>([]);
  const { register, handleSubmit, reset } = useForm<BroadcastForm>();

  const broadcastMutation = useMutation({
    mutationFn: (data: BroadcastForm) =>
      notificationApi.broadcast({ ...data, channels: selectedChannels }),
    onSuccess: (_res, variables) => {
      toast.success("Notification sent!");
      setSentLog(prev => [
        { id: crypto.randomUUID(), title: variables.title, channels: selectedChannels, target: variables.target, sent_at: new Date().toISOString() },
        ...prev,
      ].slice(0, 20));
      reset();
    },
    onError: () => toast.error("Failed to send notification"),
  });

  const toggleChannel = (key: string) =>
    setSelectedChannels(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);

  const triggerJob = async (key: string, apiFn: () => Promise<unknown>, successMsg: string) => {
    setLoadingJobs(prev => ({ ...prev, [key]: true }));
    try { await apiFn(); toast.success(successMsg); }
    catch { toast.error(`Failed to trigger ${key}`); }
    finally { setLoadingJobs(prev => ({ ...prev, [key]: false })); }
  };

  const SCHEDULED_JOBS = [
    { key: "streak", label: "Trigger Streak Reminders", description: "Send streak reminder notifications to at-risk users", icon: Flame, handler: () => triggerJob("streak", () => notificationApi.triggerStreakReminder(), "Streak reminders triggered!") },
    { key: "weekly", label: "Trigger Weekly Report", description: "Generate and send weekly performance reports to students", icon: BarChart2, handler: () => triggerJob("weekly", () => notificationApi.triggerWeeklyReport(), "Weekly reports triggered!") },
    { key: "parent", label: "Trigger Parent Summary", description: "Send weekly activity summaries to parents", icon: Users, handler: () => triggerJob("parent", () => notificationApi.triggerParentSummary(), "Parent summaries triggered!") },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="space-y-5">
        <div className="card">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Compose Broadcast</h3>
          <form onSubmit={handleSubmit((d) => broadcastMutation.mutate(d))} className="space-y-4">
            <div>
              <label className="label">Title</label>
              <input className="input" {...register("title", { required: true })} placeholder="e.g. New Mock Test Available" />
            </div>
            <div>
              <label className="label">Message</label>
              <textarea className="input" rows={3} {...register("message", { required: true })} placeholder="Write your notification message..." />
            </div>
            <div>
              <label className="label">Target Audience</label>
              <select className="input" {...register("target")}>
                <option value="all">All Users</option>
                <option value="students">Students Only</option>
                <option value="parents">Parents Only</option>
                <option value="teachers">Teachers Only</option>
                <option value="premium">Premium Subscribers</option>
                <option value="class_10">Class 10 Students</option>
              </select>
            </div>
            <div>
              <label className="label mb-2">Channels</label>
              <div className="flex gap-3 flex-wrap">
                {CHANNELS.map(({ key, label, icon: Icon }) => (
                  <button key={key} type="button" onClick={() => toggleChannel(key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${selectedChannels.includes(key) ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"}`}>
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            </div>
            {selectedChannels.length === 0 && <p className="text-xs text-danger-500 dark:text-danger-400">Select at least one channel</p>}
            <button type="submit" className="btn btn-primary w-full justify-center" disabled={broadcastMutation.isPending || selectedChannels.length === 0}>
              <Send className="w-4 h-4" />
              {broadcastMutation.isPending ? "Sending..." : "Send Notification"}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Scheduled Jobs</h3>
          <div className="space-y-3">
            {SCHEDULED_JOBS.map(({ key, label, description, icon: Icon, handler }) => {
              const isLoading = loadingJobs[key] === true;
              return (
                <div key={key} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700">
                  <button type="button" onClick={handler} disabled={isLoading}
                    className="btn btn-secondary w-full justify-start gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                    {isLoading ? <Loader className="w-4 h-4 animate-spin flex-shrink-0" /> : <Icon className="w-4 h-4 flex-shrink-0" />}
                    <span>{isLoading ? "Running..." : label}</span>
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 px-1">{description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Sent This Session</h3>
        {sentLog.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
            Nothing sent yet — broadcasts you send will appear here.
          </p>
        ) : (
          <div className="space-y-3">
            {sentLog.map((n) => (
              <div key={n.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40">
                <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center flex-shrink-0">
                  <Bell className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{n.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.target} · {new Date(n.sent_at).toLocaleString("en-IN")}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {n.channels.map(c => (
                    <span key={c} className={`badge ${typeColor[c] ?? "badge-gray"}`}>{c}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Announcements Tab ────────────────────────────────────────────────────────
function AnnouncementsTab() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } = useForm<AnnouncementForm>({
    defaultValues: { type: "general", is_active: true, is_pinned: false },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: () => announcementApi.list(false).then((r) => r.data),
  });
  const items: Announcement[] = data?.data ?? [];

  // datetime-local inputs produce naive local timestamps; the API stores UTC.
  // Convert on the way out (local → ISO/UTC) and on the way in (UTC → local),
  // otherwise every announcement shifts by the admin's UTC offset.
  const toIso = (local?: string) => (local ? new Date(local).toISOString() : undefined);
  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const createMutation = useMutation({
    mutationFn: (d: AnnouncementForm) => announcementApi.create({
      ...d,
      link_url: d.link_url || undefined,
      release_date: toIso(d.release_date),
      expires_at: toIso(d.expires_at),
    }),
    onSuccess: () => {
      toast.success("Announcement created!"); qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      reset(); setShowForm(false);
    },
    onError: () => toast.error("Failed to create announcement"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AnnouncementForm> }) =>
      announcementApi.update(id, {
        ...data,
        link_url: data.link_url || undefined,
        release_date: toIso(data.release_date),
        expires_at: toIso(data.expires_at),
      }),
    onSuccess: () => {
      toast.success("Updated!"); qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      setEditingId(null); reset();
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => announcementApi.delete(id),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-announcements"] }); },
    onError: () => toast.error("Failed to delete"),
  });

  const toggleActive = (item: Announcement) =>
    updateMutation.mutate({ id: item.id, data: { is_active: !item.is_active } });

  const startEdit = (item: Announcement) => {
    setEditingId(item.id);
    setShowForm(true);
    setValue("title", item.title);
    setValue("body", item.body);
    setValue("type", item.type);
    setValue("link_url", item.link_url ?? "");
    setValue("release_date", item.release_date ? toLocalInput(item.release_date) : "");
    setValue("expires_at", item.expires_at ? toLocalInput(item.expires_at) : "");
    setValue("is_pinned", item.is_pinned);
    setValue("is_active", item.is_active);
  };

  const cancelForm = () => { setShowForm(false); setEditingId(null); reset(); };

  const onSubmit = (d: AnnouncementForm) => {
    if (editingId) updateMutation.mutate({ id: editingId, data: d });
    else createMutation.mutate(d);
  };

  return (
    <div className="space-y-5">
      {/* Form panel */}
      {showForm ? (
        <div className="card border-2 border-primary-200 dark:border-primary-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{editingId ? "Edit Announcement" : "Create Announcement"}</h3>
            <button onClick={cancelForm} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-4 h-4" /></button>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Title *</label>
                <input className="input" {...register("title", { required: true })} placeholder="e.g. New AI Doubt Solver feature launched!" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Body *</label>
                <textarea className="input" rows={3} {...register("body", { required: true })}
                  placeholder="Describe the announcement in detail. Students will see this on their dashboard." />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" {...register("type")}>
                  {TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Link URL (optional)</label>
                <input className="input" {...register("link_url")} placeholder="https://..." />
              </div>
              <div>
                <label className="label flex items-center justify-between">
                  Publish At (optional)
                  <button type="button" onClick={() => setValue("release_date", "")}
                    className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 hover:underline normal-case">
                    Reset to now
                  </button>
                </label>
                <input className="input" type="datetime-local" {...register("release_date")} />
                {(() => {
                  const raw = watch("release_date");
                  const when = raw ? new Date(raw) : null;
                  const isFuture = when && when.getTime() > Date.now();
                  return (
                    <p className={`text-[11px] mt-1 font-semibold ${isFuture ? "text-warning-600 dark:text-warning-400" : "text-success-600 dark:text-success-400"}`}>
                      {isFuture
                        ? `⏳ Scheduled — won't appear on student dashboards until ${when!.toLocaleString()}.`
                        : "✓ Publishes immediately on save."}
                    </p>
                  );
                })()}
              </div>
              <div>
                <label className="label">Expires At (optional)</label>
                <input className="input" type="datetime-local" {...register("expires_at")} />
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                  After this time the announcement disappears from student apps.
                </p>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="checkbox" {...register("is_pinned")} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                    <Pin className="w-3.5 h-3.5" /> Pin to top
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="checkbox" {...register("is_active")} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn btn-primary gap-2" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editingId ? "Save Changes" : "Publish Announcement"}
              </button>
              <button type="button" onClick={cancelForm} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="btn btn-primary gap-2">
          <Plus className="w-4 h-4" /> New Announcement
        </button>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <Megaphone className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No announcements yet</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Click "New Announcement" to create one</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const typeOpt = TYPE_OPTIONS.find(o => o.value === item.type);
            const TypeIcon = typeOpt?.icon ?? Megaphone;
            const isScheduled = new Date(item.release_date).getTime() > Date.now();
            const isExpired = !!item.expires_at && new Date(item.expires_at).getTime() < Date.now();
            return (
              <div key={item.id} className={`card flex items-start gap-4 transition-opacity ${!item.is_active ? "opacity-50" : ""}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-700`}>
                  <TypeIcon className={`w-4 h-4 ${typeOpt?.color ?? "text-gray-500 dark:text-gray-400"}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${TYPE_BADGE[item.type] ?? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}>
                      {typeOpt?.label ?? item.type}
                    </span>
                    {item.is_pinned && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-warning-600 dark:text-warning-400 bg-warning-50 dark:bg-warning-900/20 px-2 py-0.5 rounded-full">
                        <Pin className="w-3 h-3" /> Pinned
                      </span>
                    )}
                    {!item.is_active && (
                      <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">Draft</span>
                    )}
                    {item.is_active && isScheduled && (
                      <span className="text-[11px] font-semibold text-info-600 dark:text-info-400 bg-info-50 dark:bg-info-900/20 px-2 py-0.5 rounded-full">
                        Scheduled — not visible to students yet
                      </span>
                    )}
                    {item.is_active && isExpired && (
                      <span className="text-[11px] font-semibold text-danger-500 dark:text-danger-400 bg-danger-50 dark:bg-danger-900/20 px-2 py-0.5 rounded-full">Expired</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{item.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{item.body}</p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">{isScheduled ? "Publishes" : "Released"}: {fmtDate(item.release_date)}</span>
                    {item.expires_at && <span className="text-[11px] text-gray-400 dark:text-gray-500">Expires: {fmtDate(item.expires_at)}</span>}
                    {item.link_url && (
                      <a href={item.link_url} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5">
                        <ExternalLink className="w-3 h-3" /> Link
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => toggleActive(item)} title={item.is_active ? "Deactivate" : "Activate"}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${item.is_active ? "bg-success-50 dark:bg-success-900/30 text-success-600 dark:text-success-400 hover:bg-success-100 dark:hover:bg-success-900/50" : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"}`}>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => startEdit(item)} title="Edit"
                    className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/50 flex items-center justify-center transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteMutation.mutate(item.id)} title="Delete"
                    className="w-8 h-8 rounded-lg bg-danger-50 dark:bg-danger-900/30 text-danger-500 dark:text-danger-400 hover:bg-danger-100 dark:hover:bg-danger-900/50 flex items-center justify-center transition-colors"
                    disabled={deleteMutation.isPending}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Maintenance Tab ──────────────────────────────────────────────────────────
interface MaintenanceForm {
  is_active: boolean;
  title: string;
  message: string;
  ends_at: string;
}

function MaintenanceTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-maintenance"],
    queryFn: () => maintenanceApi.get().then(r => r.data?.data),
  });

  const { register, handleSubmit, watch, setValue } = useForm<MaintenanceForm>({
    values: {
      is_active: data?.is_active ?? false,
      title: data?.title ?? "Platform Under Maintenance",
      message: data?.message ?? "We are performing scheduled maintenance to improve your experience. We'll be back soon.",
      ends_at: data?.ends_at ? data.ends_at.slice(0, 16) : "",
    },
  });

  const isActive = watch("is_active");

  const saveMutation = useMutation({
    mutationFn: (form: MaintenanceForm) =>
      maintenanceApi.set({
        is_active: form.is_active,
        title: form.title,
        message: form.message,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        updated_by: "admin",
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-maintenance"] });
      toast.success(vars.is_active ? "Maintenance mode ENABLED — users will see the maintenance screen" : "Maintenance mode disabled — platform is live");
    },
    onError: () => toast.error("Failed to update maintenance mode"),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" /></div>;

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Status banner */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border-2 ${isActive ? "bg-danger-50 dark:bg-danger-900/20 border-danger-200 dark:border-danger-900/40" : "bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-900/40"}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? "bg-danger-100 dark:bg-danger-900/40" : "bg-success-100 dark:bg-success-900/40"}`}>
          <ShieldAlert className={`w-5 h-5 ${isActive ? "text-danger-600 dark:text-danger-400" : "text-success-600 dark:text-success-400"}`} />
        </div>
        <div className="flex-1">
          <p className={`font-bold text-sm ${isActive ? "text-danger-700 dark:text-danger-300" : "text-success-700 dark:text-success-300"}`}>
            Platform is currently {isActive ? "UNDER MAINTENANCE" : "LIVE"}
          </p>
          <p className={`text-xs mt-0.5 ${isActive ? "text-danger-500 dark:text-danger-400" : "text-success-500 dark:text-success-400"}`}>
            {isActive
              ? "Students and parents are seeing the maintenance screen. Admins can still access the platform."
              : "All users have full access to the platform."}
          </p>
        </div>
        {/* Quick toggle */}
        <button
          type="button"
          onClick={() => setValue("is_active", !isActive)}
          className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${isActive ? "bg-danger-500" : "bg-gray-300 dark:bg-gray-600"}`}
        >
          <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200 ${isActive ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="card space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-warning-500" /> Maintenance Settings
        </h3>

        <div>
          <label className="label">Banner Title</label>
          <input
            {...register("title")}
            className="input w-full"
            placeholder="Platform Under Maintenance"
          />
        </div>

        <div>
          <label className="label">Message shown to users</label>
          <textarea
            {...register("message")}
            rows={3}
            className="input w-full resize-none"
            placeholder="We are performing scheduled maintenance..."
          />
        </div>

        <div>
          <label className="label flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Expected end time <span className="text-gray-400 dark:text-gray-500 font-normal">(optional — powers the countdown)</span>
          </label>
          <input
            {...register("ends_at")}
            type="datetime-local"
            className="input w-full"
          />
          <p className="helper-text">Leave empty to show "We'll be back soon" without a countdown.</p>
        </div>

        {/* Enable / disable toggle row */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <input type="checkbox" {...register("is_active")} id="is_active" className="checkbox" />
            <label htmlFor="is_active" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Enable maintenance mode
            </label>
          </div>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className={`btn ${isActive ? "btn-danger" : "btn-success"}`}
          >
            {saveMutation.isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isActive ? "Enable Maintenance" : "Save & Keep Live"}
          </button>
        </div>
      </form>

      {/* Preview card */}
      <div className="card border-dashed">
        <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">User Preview</p>
        <div className="rounded-xl bg-gray-900 dark:bg-gray-950 p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto">
            <Wrench className="w-6 h-6 text-primary-300" />
          </div>
          <p className="text-white font-extrabold text-base">{watch("title") || "Platform Under Maintenance"}</p>
          <p className="text-white/60 text-xs leading-relaxed">{watch("message") || "We are performing scheduled maintenance..."}</p>
          {watch("ends_at") && (
            <div className="flex items-center justify-center gap-1.5 text-white/40 text-xs">
              <Clock className="w-3 h-3" /> Countdown to {new Date(watch("ends_at")).toLocaleString()}
            </div>
          )}
          <p className="text-white/30 text-[10px]">↑ This is what students and parents will see</p>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type Tab = "broadcast" | "announcements" | "maintenance";

export default function NotificationsPage() {
  const [tab, setTab] = useState<Tab>("broadcast");

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "broadcast",     label: "Broadcast",     icon: Bell },
    { id: "announcements", label: "Announcements", icon: Megaphone },
    { id: "maintenance",   label: "Maintenance",   icon: ShieldAlert },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications & Announcements</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Broadcast messages and manage platform announcements shown on the student dashboard</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${tab === id ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "broadcast"     && <BroadcastTab />}
      {tab === "announcements" && <AnnouncementsTab />}
      {tab === "maintenance"   && <MaintenanceTab />}
    </div>
  );
}
