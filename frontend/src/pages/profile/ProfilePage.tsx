import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { interpolate } from "@/lib/interpolate";
import { formatDayMonYear } from "@/lib/dates";
import { api } from "@/lib/api";
import { useAppSelector, useAppDispatch } from "@/store";
import { logout as logoutAction, setUser } from "@/store/auth";
import {
  Copy, CheckCheck, Camera, Pencil, Save, X,
  Trophy, Flame, Zap, GraduationCap, Phone, Mail,
  School,
  Lock, Bell, CheckCircle, LinkIcon, Unlink, Trash2,
  Smartphone, Monitor, Tablet, LogOut, ShieldAlert,
  MessageSquare,
} from "lucide-react";
import { authApi, contentApi, parentApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import toast from "react-hot-toast";
import { Button, Card, Input, Modal } from "@/components/ui";

interface ProfileForm {
  full_name: string;
  phone: string;
  school_name: string;
  board: string;
  class_number: string;
}

interface ParentLink {
  id: string;
  parent_user_id: string;
  relationship: string;
  parent_name: string | null;
  is_approved: boolean;
  approved_at?: string | null;
  created_at: string;
}

function PasswordChangeForm(_props: { userId: string }) {
  const [form, setForm] = useState({ current: "", newPwd: "", confirm: "" });
  const [show, setShow] = useState(false);

  const strengthChecks = [
    { label: "8+ characters", ok: form.newPwd.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(form.newPwd) },
    { label: "Number", ok: /[0-9]/.test(form.newPwd) },
  ];

  const changeMutation = useMutation({
    mutationFn: () => authApi.changePassword(form.current, form.newPwd),
    onSuccess: () => { toast.success("Password changed!"); setForm({ current: "", newPwd: "", confirm: "" }); setShow(false); },
    onError: () => toast.error("Incorrect current password"),
  });

  const handleSubmit = () => {
    if (form.newPwd !== form.confirm) { toast.error("Passwords don't match"); return; }
    if (!strengthChecks.every(c => c.ok)) { toast.error("Password doesn't meet requirements"); return; }
    changeMutation.mutate();
  };

  if (!show) return (
    <Button variant="secondary" size="sm" fullWidth onClick={() => setShow(true)}>Change Password</Button>
  );

  return (
    <div className="space-y-2">
      <Input type="password" placeholder="Current password" value={form.current} onChange={e => setForm({...form, current: e.target.value})} />
      <Input type="password" placeholder="New password" value={form.newPwd} onChange={e => setForm({...form, newPwd: e.target.value})} />
      <div className="flex gap-3 flex-wrap">
        {strengthChecks.map(c => (
          <span key={c.label} className={`text-xs flex items-center gap-1 ${c.ok ? "text-success-600 dark:text-success-400" : "text-gray-400 dark:text-gray-500"}`}>
            {c.ok ? <CheckCircle className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600" />}
            {c.label}
          </span>
        ))}
      </div>
      <Input type="password" placeholder="Confirm new password" value={form.confirm} onChange={e => setForm({...form, confirm: e.target.value})} />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => setShow(false)}>Cancel</Button>
        <Button variant="primary" size="sm" className="flex-1" isLoading={changeMutation.isPending} onClick={handleSubmit}>
          {changeMutation.isPending ? "Saving…" : "Update Password"}
        </Button>
      </div>
    </div>
  );
}

// Derive NOTIF_TYPES and CHANNELS dynamically from the preference keys returned by
// GET /v1/notifications/preferences/{userId}. The service owns the event-type and
// channel list; the frontend just reflects whatever key pairs the response contains.
function parseNotifMeta(prefs: Record<string, unknown>) {
  const CHANNEL_LABELS: Record<string, string> = {
    in_app: "In-App",
    email: "Email",
    whatsapp: "WhatsApp",
  };
  const TYPE_LABELS: Record<string, string> = {
    new_video: "New Videos",
    quiz_result: "Quiz Results",
    battle_invite: "Battle Invites",
    streak_reminder: "Streak Reminders",
    badge_unlocked: "Badge Unlocked",
    promotional: "Promotional",
  };

  const channelSet = new Set<string>();
  const typeSet = new Set<string>();

  for (const key of Object.keys(prefs)) {
    // Keys have the form: {channel}_{type_which_may_have_underscores}
    // Known channels: in_app, email, whatsapp
    const knownChannels = ["in_app", "email", "whatsapp"];
    for (const ch of knownChannels) {
      if (key.startsWith(ch + "_")) {
        const typeKey = key.slice(ch.length + 1);
        channelSet.add(ch);
        typeSet.add(typeKey);
        break;
      }
    }
  }

  const channels = [...channelSet].map(k => ({ key: k, label: CHANNEL_LABELS[k] ?? k }));
  const types = [...typeSet].map(k => ({ key: k, label: TYPE_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));
  return { channels, types };
}

function NotificationPreferences({ userId }: { userId: string }) {
  const { data: prefs, refetch } = useQuery({
    queryKey: ["notif-prefs", userId],
    queryFn: () => api.get(`/v1/notifications/preferences/${userId}`).then(r => r.data),
    retry: 0,
  });

  const updatePref = async (channel: string, type: string, value: boolean) => {
    await api.put(`/v1/notifications/preferences/${userId}`, { [`${channel}_${type}`]: value });
    refetch();
  };

  if (!prefs) return <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />;

  const { channels, types } = parseNotifMeta(prefs as Record<string, unknown>);

  if (channels.length === 0 || types.length === 0) {
    return <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-3">No notification preferences available.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left text-xs text-gray-500 font-medium pb-2">Event</th>
            {channels.map(c => <th key={c.key} className="text-center text-xs text-gray-500 font-medium pb-2 px-2">{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {types.map(type => (
            <tr key={type.key}>
              <td className="py-2 text-xs text-gray-700 dark:text-gray-300">{type.label}</td>
              {channels.map(ch => (
                <td key={ch.key} className="py-2 text-center px-2">
                  <button
                    onClick={() => updatePref(ch.key, type.key, !prefs[`${ch.key}_${type.key}`])}
                    className={`w-9 h-4.5 rounded-full transition-colors relative ${prefs[`${ch.key}_${type.key}`] ? "bg-primary-500" : "bg-gray-200 dark:bg-gray-600"}`}
                  >
                    <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${prefs[`${ch.key}_${type.key}`] ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Google "G" SVG icon using brand colour #4285F4
function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M47.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.2z"/>
      <path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-7.9-6c-2.2 1.5-5 2.3-8.1 2.3-6.2 0-11.5-4.2-13.4-9.9H2.5v6.2C6.5 42.5 14.7 48 24 48z"/>
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6v-6.2H2.5C.9 16.4 0 20.1 0 24s.9 7.6 2.5 10.8l8.1-6.2z"/>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.9 2.4 30.5 0 24 0 14.7 0 6.5 5.5 2.5 13.2l8.1 6.2C12.5 13.7 17.8 9.5 24 9.5z"/>
    </svg>
  );
}

function LinkedAccountsSection({
  googleId,
  hasPassword,
  onDisconnected,
}: {
  googleId: string | null | undefined;
  hasPassword: boolean;
  onDisconnected: () => void;
}) {
  const disconnectMutation = useMutation({
    mutationFn: () => authApi.disconnectGoogle(),
    onSuccess: () => {
      toast.success("Google account disconnected.");
      onDisconnected();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? "Failed to disconnect Google account.";
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "#EAF1FB" }}
          >
            <GoogleIcon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">Google</p>
            {googleId ? (
              <p className="text-xs text-success-600 dark:text-success-400">Connected</p>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">Not connected</p>
            )}
          </div>
        </div>
        {googleId && (
          <button
            onClick={() => {
              if (!hasPassword) {
                toast.error("Set a password before disconnecting Google.");
                return;
              }
              disconnectMutation.mutate();
            }}
            disabled={disconnectMutation.isPending}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-danger-200 text-danger-600 hover:bg-danger-50 dark:border-danger-800 dark:text-danger-400 dark:hover:bg-danger-900/20 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <Unlink className="w-3.5 h-3.5" />
            {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── DeviceSession type ────────────────────────────────────────────────────────
interface DeviceSession {
  session_id: string;
  device_type: "mobile" | "desktop" | "tablet" | string;
  os: string | null;
  browser: string | null;
  ip_address: string | null;
  last_seen: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function maskIp(ip: string | null): string {
  if (!ip) return "Unknown";
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.**`;
  }
  return ip.slice(0, ip.length - 2) + "**";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function DeviceIcon({ type }: { type: string }) {
  if (type === "mobile") return <Smartphone className="w-4 h-4 text-primary-500" />;
  if (type === "tablet") return <Tablet className="w-4 h-4 text-primary-500" />;
  return <Monitor className="w-4 h-4 text-gray-500" />;
}

// ── Active Sessions Component ─────────────────────────────────────────────────
function ActiveSessionsSection() {
  const { data: sessions, isLoading, refetch } = useQuery<DeviceSession[]>({
    queryKey: ["sessions"],
    queryFn: () => authApi.getSessions().then((r) => r.data),
    retry: 0,
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: () => { toast.success("Session logged out"); refetch(); },
    onError: () => toast.error("Failed to revoke session"),
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      const others = (sessions ?? []).slice(1);
      await Promise.all(others.map((s) => authApi.revokeSession(s.session_id)));
    },
    onSuccess: () => { toast.success("All other sessions logged out"); refetch(); },
    onError: () => toast.error("Failed to log out all sessions"),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const list = sessions ?? [];

  return (
    <div className="space-y-2">
      {list.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={() => revokeAllMutation.mutate()}
            disabled={revokeAllMutation.isPending}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-danger-300 text-danger-600 hover:bg-danger-50 dark:border-danger-800 dark:text-danger-400 dark:hover:bg-danger-900/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            {revokeAllMutation.isPending ? "Logging out…" : "Log out all other devices"}
          </button>
        </div>
      )}

      {list.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-3">No active sessions found.</p>
      )}

      {list.map((session, idx) => {
        const isCurrent = idx === 0;
        return (
          <div
            key={session.session_id}
            className={`flex items-center gap-3 p-3 rounded-xl border ${
              isCurrent
                ? "border-primary-200 bg-primary-50/50 dark:border-primary-800 dark:bg-primary-900/10"
                : "border-gray-200 dark:border-gray-700"
            }`}
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <DeviceIcon type={session.device_type} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-medium text-gray-900 dark:text-white">
                  {session.browser ?? "Unknown browser"}{session.os ? ` on ${session.os}` : ""}
                </p>
                {isCurrent && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                    This device
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {maskIp(session.ip_address)} &middot; {relativeTime(session.last_seen)}
              </p>
            </div>

            {!isCurrent && (
              <button
                onClick={() => revokeMutation.mutate(session.session_id)}
                disabled={revokeMutation.isPending}
                title="Log out this session"
                className="flex-shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:border-danger-400 hover:text-danger-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-danger-700 dark:hover:text-danger-400 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <LogOut className="w-3 h-3" />
                Log out
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Delete Account Modal ──────────────────────────────────────────────────────
function DeleteAccountModal({ onClose, onConfirm, isPending }: {
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const isMatch = confirmText === "DELETE";

  return (
    <Modal
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="danger" className="flex-1" disabled={!isMatch} isLoading={isPending} onClick={onConfirm}>
            {isPending ? "Deleting…" : "Delete My Account"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-danger-100 dark:bg-danger-900/30 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-danger-600 dark:text-danger-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Delete Account</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">This action is permanent and cannot be undone.</p>
          </div>
        </div>

        <div className="bg-danger-50 dark:bg-danger-900/20 rounded-xl p-3 text-sm text-danger-700 dark:text-danger-300 space-y-1">
          <p className="font-medium">You will lose:</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>All your progress, XP and badges</li>
            <li>Quiz attempts and analytics</li>
            <li>Subscription and payment history</li>
            <li>Referral rewards</li>
          </ul>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
            Type <span className="font-mono font-bold text-danger-600 dark:text-danger-400">DELETE</span> to confirm
          </label>
          <Input
            type="text"
            className="font-mono"
            placeholder="DELETE"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
}

export default function ProfilePage() {
  const user        = useAppSelector((s) => s.auth.user);
  const dispatch    = useAppDispatch();
  const navigate    = useNavigate();
  const { t }       = useLanguage();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const isEditing   = searchParams.get("edit") === "1";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarKey = user?.id ? `avatar_${user.id}` : null;
  const [avatarSrc, setAvatarSrc] = useState<string | null>(
    avatarKey ? localStorage.getItem(avatarKey) : null
  );
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState<ProfileForm>({
    full_name: "",
    phone: "",
    school_name: "",
    board: "CBSE",
    class_number: "10",
  });

  // ── API queries ──
  const { data: profile, refetch } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => api.get(`/v1/users/profile/${user!.id}`).then((r) => r.data),
    enabled: !!user?.id,
    retry: 0,
  });

  // Fetch supported boards from the content service so new boards added server-side
  // appear automatically without a frontend deploy.
  const { data: boardsData, isLoading: boardsLoading } = useQuery({
    queryKey: ["content-boards"],
    queryFn: () => contentApi.boards().then((r) => r.data as { id: string; name: string; code: string }[]),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Resolve the board_id for the currently selected board so we can fetch its classes.
  const selectedBoardId = boardsData?.find(
    (b) => b.name === form.board || b.code === form.board
  )?.id ?? boardsData?.[0]?.id;

  // Fetch classes for the selected board — list of valid class numbers is owned by the
  // content service so the range can be adjusted server-side without a frontend deploy.
  const { data: classesData, isLoading: classesLoading } = useQuery({
    queryKey: ["content-classes", selectedBoardId],
    queryFn: () => contentApi.classes(selectedBoardId!).then((r) => r.data as { id: string; name: string; number: number }[]),
    enabled: !!selectedBoardId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: gamification } = useQuery({
    queryKey: ["gamification", user?.id],
    queryFn: () => api.get(`/v1/gamification/profile/${user!.id}`).then((r) => r.data),
    enabled: !!user?.id,
    retry: 0,
  });

  const { data: referral } = useQuery({
    queryKey: ["referral-code", user?.id],
    queryFn: () => api.get(`/v1/referrals/code/${user!.id}`).then((r) => r.data),
    enabled: !!user?.id,
    retry: 0,
  });

  const { data: rewards } = useQuery({
    queryKey: ["rewards", user?.id],
    queryFn: () => api.get(`/v1/referrals/rewards/${user!.id}`).then((r) => r.data),
    enabled: !!user?.id,
    retry: 0,
  });

  // ── Pending parent-link requests (students only) ─────────────────────────
  // A parent linking to this account creates the link as is_approved=false
  // server-side — it grants that parent NO access (dashboard, monitoring,
  // AI chat about this student) until approved here. Without this UI the
  // approval step was simply unreachable: parents could request a link but
  // no student-facing screen ever existed to grant it.
  const isStudentAccount = user?.role?.toLowerCase() === "student";
  const { data: parentLinksData, refetch: refetchParentLinks } = useQuery({
    queryKey: ["student-parent-links", user?.id],
    queryFn: () => parentApi.getParentLinks(user!.id).then((r) => r.data as ParentLink[]),
    enabled: !!user?.id && isStudentAccount,
  });
  const pendingParentLinks = (parentLinksData ?? []).filter((l) => !l.is_approved);
  const approvedParentLinks = (parentLinksData ?? []).filter((l) => l.is_approved);
  const [respondingLinkId, setRespondingLinkId] = useState<string | null>(null);
  const respondToLink = async (link: ParentLink, approve: boolean) => {
    setRespondingLinkId(link.id);
    try {
      if (approve) {
        await parentApi.updateLink(link.id, { is_approved: true });
        toast.success(interpolate(t("parentLinkApprovedToast"), { name: link.parent_name?.trim() || t("parentYourParent") }), { duration: 6000 });
      } else {
        await parentApi.removeLink(link.id);
        toast.success(t("parentLinkRejectedToast"));
      }
      refetchParentLinks();
      queryClient.invalidateQueries({ queryKey: ["link-badges"] });
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setRespondingLinkId(null);
    }
  };

  // Fetch up-to-date auth profile (includes google_id)
  const { data: authMe, refetch: refetchAuthMe } = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => authApi.me().then((r) => r.data),
    retry: 0,
  });

  // ── Delete account mutation ──
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteAccountMutation = useMutation({
    mutationFn: () => authApi.deleteAccount(),
    onSuccess: () => {
      toast.success("Account deleted. We're sorry to see you go.");
      dispatch(logoutAction());
      navigate("/login");
    },
    onError: () => toast.error("Failed to delete account. Please try again."),
  });

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      setForm({
        full_name:    profile.full_name   ?? user?.full_name  ?? "",
        phone:        profile.phone       ?? "",
        school_name:  profile.school_name ?? user?.school_name ?? "",
        board:        profile.board       ?? "CBSE",
        class_number: String(profile.class_number ?? "10"),
      });
    }
  }, [profile]);

  // ── Save profile mutation ──
  // PATCH (partial) — school_name goes through the USER profile so the
  // server-side curriculum-change limit (3 changes, then 90-day lock)
  // governs Board + Class + School together.
  const curriculumLocked =
    !!profile?.curriculum_locked_until && new Date(profile.curriculum_locked_until) > new Date();
  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/v1/users/profile/${user!.id}`, {
        full_name:    form.full_name   || undefined,
        board:        form.board       || undefined,
        class_number: Number(form.class_number) || undefined,
        school_name:  form.school_name || undefined,
      });
      // Auth layer keeps phone/name (+ school mirror for /auth/me displays)
      await authApi.updateProfile({
        ...(form.phone       ? { phone:       form.phone }       : {}),
        ...(form.full_name   ? { full_name:   form.full_name }   : {}),
        ...(form.school_name ? { school_name: form.school_name } : {}),
      });
    },
    onSuccess: () => {
      toast.success("Profile updated!");
      refetch();
      // Board/class drive the Learn tab, leaderboard and analytics catalogs
      // ("my-catalog", "my-catalog-for-*") — refetch them with the new values.
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("my-catalog"),
      });
      setSearchParams({});
    },
    onError: (e: any) => {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 423) toast.error(detail, { duration: 6000 });
      else toast.error(typeof detail === "string" ? detail : "Failed to save profile");
    },
  });

  // ── Avatar upload — stored SERVER-SIDE so the photo appears everywhere
  // (chat, battles, leaderboards) and on every device, not just this browser.
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    try {
      // 1. Upload bytes → user_service stores them and returns the public URL
      const r = await api.post("/v1/users/profile/avatar", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const url: string = r.data.avatar_url;
      // 2. Mirror onto the auth profile so /auth/me (and every login) carries it
      await authApi.updateProfile({ avatar_url: url });
      // 3. Update local UI immediately (header listens for the storage event)
      setAvatarSrc(url);
      if (avatarKey) localStorage.setItem(avatarKey, url);
      if (user) dispatch(setUser({ ...user, avatar_url: url }));
      window.dispatchEvent(new Event("storage"));
      toast.success("Profile photo updated — visible everywhere now!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Could not upload the photo. Try a smaller image.");
    } finally {
      e.target.value = ""; // allow re-selecting the same file
    }
  };

  // Seed the preview from the server-side photo (other device / fresh browser)
  useEffect(() => {
    if (!avatarSrc && authMe?.avatar_url) setAvatarSrc(authMe.avatar_url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMe?.avatar_url]);

  const copyReferralCode = () => {
    if (referral?.code) {
      navigator.clipboard.writeText(referral.code);
      setCopied(true);
      toast.success("Referral code copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const [studentIdCopied, setStudentIdCopied] = useState(false);
  const copyStudentId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setStudentIdCopied(true);
      toast.success("Student ID copied!");
      setTimeout(() => setStudentIdCopied(false), 2000);
    }
  };


  const displayName = profile?.full_name ?? user?.email?.split("@")[0] ?? "Student";
  const totalXP     = gamification?.xp?.total_xp ?? 0;
  const level       = Math.floor(totalXP / 500) + 1;
  const streak      = gamification?.streak?.current ?? 0;
  void (gamification?.badges?.length ?? 0); // badge display not yet implemented

  // Derive role badge label
  const roleLabel = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase()
    : "Student";

  return (
    <div className="w-full space-y-3 animate-fade-in">

      {/* ── Header Card ── */}
      <div className="rounded-2xl bg-primary-600 p-4 shadow-sm">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt="avatar"
                className="w-16 h-16 rounded-xl object-cover ring-2 ring-white/30"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-white/20 flex items-center justify-center ring-2 ring-white/30">
                <span className="text-2xl font-bold text-white">
                  {displayName[0]?.toUpperCase()}
                </span>
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-white rounded-lg flex items-center justify-center shadow-md hover:bg-gray-100 transition-colors"
              title="Change photo"
            >
              <Camera className="w-3.5 h-3.5 text-primary-600" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* Name / email / role / edit */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white capitalize truncate leading-tight">{displayName}</h2>
                <p className="text-xs text-white/70 truncate mt-0.5">{user?.email ?? user?.phone}</p>
                <span className="inline-block mt-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                  {roleLabel}
                </span>
              </div>
              {!isEditing ? (
                <button
                  onClick={() => setSearchParams({ edit: "1" })}
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              ) : (
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setSearchParams({})}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white text-primary-700 hover:bg-white/90 transition-colors disabled:opacity-60"
                  >
                    <Save className="w-3 h-3" />
                    {saveMutation.isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              )}
            </div>

            {/* Quick stats row */}
            {!isEditing && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white">
                  <Flame className="w-3 h-3 text-orange-300" /> {streak}d streak
                </span>
                <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white">
                  <Zap className="w-3 h-3 text-yellow-300" /> {totalXP.toLocaleString()} XP
                </span>
                <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white">
                  <Trophy className="w-3 h-3 text-yellow-200" /> Lv {level}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Edit form inside header */}
        {isEditing && (
          <div className="mt-4 space-y-2">
            {/* Curriculum-change warning — Board/Class/School are limited */}
            {curriculumLocked ? (
              <div className="rounded-xl bg-danger-500/25 border border-danger-100/40 px-3 py-2.5 text-xs font-semibold text-white">
                🔒 Board, Class &amp; School changes are locked until {new Date(profile.curriculum_locked_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
                Other fields can still be updated.
              </div>
            ) : (
              <div className="rounded-xl bg-warning-500/25 border border-warning-100/40 px-3 py-2.5 text-xs font-semibold text-white">
                ⚠️ Board, Class &amp; School can only be changed {3 - (profile?.curriculum_changes_count ?? 0)} more
                time{3 - (profile?.curriculum_changes_count ?? 0) === 1 ? "" : "s"} — after that they lock for 3 months.
                All your subjects and chapters follow these settings.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-white/70 mb-1 block">Full Name</label>
                <input
                  className="w-full px-3 py-2 text-sm rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/70 mb-1 block">Phone</label>
                <input
                  className="w-full px-3 py-2 text-sm rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 XXXXXXXXXX"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-white/70 mb-1 block">School Name</label>
              <input
                className="w-full px-3 py-2 text-sm rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
                value={form.school_name}
                onChange={(e) => setForm({ ...form, school_name: e.target.value })}
                placeholder="e.g. Delhi Public School"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-white/70 mb-1 block">Board</label>
                {boardsLoading ? (
                  <div className="w-full h-9 rounded-xl bg-white/10 animate-pulse" />
                ) : !boardsData || boardsData.length === 0 ? (
                  <p className="text-xs text-white/50 py-2">No boards available</p>
                ) : (
                  <select
                    className="w-full px-3 py-2 text-sm rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                    value={form.board}
                    onChange={(e) => setForm({ ...form, board: e.target.value })}
                  >
                    {boardsData.map((b) => <option key={b.id} value={b.name} className="text-gray-900">{b.name}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-white/70 mb-1 block">Class</label>
                {classesLoading ? (
                  <div className="w-full h-9 rounded-xl bg-white/10 animate-pulse" />
                ) : !classesData || classesData.length === 0 ? (
                  <p className="text-xs text-white/50 py-2">No classes available</p>
                ) : (
                  <select
                    className="w-full px-3 py-2 text-sm rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                    value={form.class_number}
                    onChange={(e) => setForm({ ...form, class_number: e.target.value })}
                  >
                    {classesData.map((c) => <option key={c.id} value={c.number} className="text-gray-900">Class {c.number}</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2-col layout at xl */}
      <div className="xl:flex xl:gap-6 xl:items-start">

        {/* LEFT: profile info + referral + rewards */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Profile info pills */}
          {!isEditing && (
            <Card>
              <div className="flex flex-wrap gap-2">
                {profile?.phone && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-600">
                    <Phone className="w-3 h-3" /> {profile.phone}
                  </span>
                )}
                {(profile?.school_name || user?.school_name) && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-600">
                    <School className="w-3 h-3" /> {profile?.school_name ?? user?.school_name}
                  </span>
                )}
                {(profile?.class_number || profile?.board) && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-600">
                    <GraduationCap className="w-3 h-3" />
                    {profile.board?.toUpperCase()}
                    {profile.class_number ? ` · Class ${profile.class_number}` : ""}
                  </span>
                )}
                {user?.email && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-600">
                    <Mail className="w-3 h-3" /> {user.email}
                  </span>
                )}
              </div>
            </Card>
          )}

          {/* Student ID — parents need this exact value to link the child's
              account via "Link a Student", and had no way to find it before
              this (the form asked for a UUID with no indication of where a
              student would even see their own). */}
          {!isEditing && user?.role?.toLowerCase() === "student" && (
            <Card>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Your Student ID</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Share this with your parent so they can link your account from their dashboard.
              </p>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 flex items-center justify-between gap-3">
                <p className="text-sm font-mono text-gray-800 dark:text-gray-200 break-all">{user?.id}</p>
                <Button variant="secondary" size="sm" onClick={copyStudentId} className="flex items-center gap-1.5 shrink-0">
                  {studentIdCopied ? <CheckCheck className="w-3.5 h-3.5 text-success-600" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </Button>
              </div>
            </Card>
          )}

          {/* Linked parents (read-only) + pending parent-link requests */}
          {!isEditing && isStudentAccount && (
            <Card>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{t("parentLinkedParentsTitle")}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {t("parentLinkedParentsDesc")}
              </p>
              {approvedParentLinks.length === 0 && pendingParentLinks.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                  {t("parentNoParentLinked")}
                </p>
              )}
              <div className="space-y-2">
                {approvedParentLinks.map((link) => (
                  <div key={link.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                        {link.parent_name ?? t("parentAParent")}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 capitalize truncate">{link.relationship}</p>
                      {link.approved_at && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {interpolate(t("parentLinkedSince"), { date: formatDayMonYear(link.approved_at) })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-success-600">{t("parentLinkedLabel")}</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate("/messages", { state: { openParentChat: true } })}
                        className="flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {t("messages")}
                      </Button>
                    </div>
                  </div>
                ))}
                {pendingParentLinks.map((link) => (
                  <div key={link.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                        {link.parent_name ?? t("parentAParent")}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 capitalize truncate">{link.relationship}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={respondingLinkId === link.id}
                        onClick={() => respondToLink(link, false)}
                      >
                        {t("parentReject")}
                      </Button>
                      <Button
                        size="sm"
                        disabled={respondingLinkId === link.id}
                        isLoading={respondingLinkId === link.id}
                        onClick={() => respondToLink(link, true)}
                      >
                        {t("parentApprove")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Referral */}
          {!isEditing && referral && (
            <Card>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Referral Program</h3>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 flex items-center justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Your referral code</p>
                  <p className="text-xl font-bold text-primary-600 dark:text-primary-400 tracking-widest truncate">
                    {referral.code}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={copyReferralCode} className="flex items-center gap-1.5 flex-shrink-0">
                  {copied ? <CheckCheck className="w-3.5 h-3.5 text-success-600" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{referral.total_referrals ?? 0}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Referrals</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-success-600 dark:text-success-400">{referral.qualified_referrals ?? 0}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Qualified</p>
                </div>
              </div>
            </Card>
          )}

          {/* Rewards */}
          {!isEditing && rewards?.length > 0 && (
            <Card>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-warning-500" /> Rewards Earned
              </h3>
              <div className="space-y-2">
                {rewards.map((r: any) => (
                  <div
                    key={r.milestone}
                    className="flex items-center justify-between gap-2 p-3 bg-warning-50 dark:bg-warning-900/20 rounded-xl border border-warning-100 dark:border-warning-900/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {r.reward_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.milestone} referral milestone</p>
                    </div>
                    <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                      r.is_claimed
                        ? "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400"
                        : "bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400"
                    }`}>
                      {r.is_claimed ? "Claimed" : "Unlocked"}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Security + below — mobile/tablet only */}
          {!isEditing && (
            <div className="xl:hidden space-y-3">
              <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-gray-500" /> Security
                </h3>
                <PasswordChangeForm userId={user!.id} />
              </Card>
              <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-gray-500" /> Linked Accounts
                </h3>
                <LinkedAccountsSection
                  googleId={authMe?.google_id}
                  hasPassword={!!authMe?.hashed_password}
                  onDisconnected={() => refetchAuthMe()}
                />
              </Card>
              <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" /> Notification Preferences
                </h3>
                <NotificationPreferences userId={user!.id} />
              </Card>
              <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-gray-500 dark:text-gray-400" /> Active Sessions
                </h3>
                <ActiveSessionsSection />
              </Card>
              <Card className="border-danger-200 dark:border-danger-900">
                <h3 className="text-base font-semibold text-danger-600 dark:text-danger-400 mb-2 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" /> Danger Zone
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-sm font-medium px-4 py-2 rounded-lg border border-danger-300 text-danger-600 hover:bg-danger-50 dark:border-danger-800 dark:text-danger-400 dark:hover:bg-danger-900/20 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Account
                </button>
              </Card>
            </div>
          )}
        </div>

        {/* RIGHT: sticky sidebar — xl+ only */}
        <aside className="hidden xl:flex flex-col w-72 flex-shrink-0 sticky top-6 self-start space-y-3">
          {!isEditing && (
            <>
              <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-gray-500" /> Security
                </h3>
                <PasswordChangeForm userId={user!.id} />
              </Card>
              <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-gray-500" /> Linked Accounts
                </h3>
                <LinkedAccountsSection
                  googleId={authMe?.google_id}
                  hasPassword={!!authMe?.hashed_password}
                  onDisconnected={() => refetchAuthMe()}
                />
              </Card>
              <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" /> Notification Preferences
                </h3>
                <NotificationPreferences userId={user!.id} />
              </Card>
              <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-gray-500 dark:text-gray-400" /> Active Sessions
                </h3>
                <ActiveSessionsSection />
              </Card>
              <Card className="border-danger-200 dark:border-danger-900">
                <h3 className="text-base font-semibold text-danger-600 dark:text-danger-400 mb-2 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" /> Danger Zone
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-sm font-medium px-4 py-2 rounded-lg border border-danger-300 text-danger-600 hover:bg-danger-50 dark:border-danger-800 dark:text-danger-400 dark:hover:bg-danger-900/20 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Account
                </button>
              </Card>
            </>
          )}
        </aside>

      </div>

      {/* Delete Account Modal */}
      {confirmDelete && (
        <DeleteAccountModal
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => deleteAccountMutation.mutate()}
          isPending={deleteAccountMutation.isPending}
        />
      )}

    </div>
  );
}
