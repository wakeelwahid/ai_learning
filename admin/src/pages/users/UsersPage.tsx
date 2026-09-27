import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, paymentApi } from "@/lib/api";
import Modal from "@/components/ui/Modal";
import StatsCard from "@/components/ui/StatsCard";
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  Search,
  Loader,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  // Phone-OTP signup is a supported path with no email on file — this must
  // stay nullable, not `string`, to match real backend data.
  email: string | null;
  name?: string | null;
  phone?: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  last_login?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const ROLES = ["student", "teacher", "admin", "parent"] as const;
type Role = (typeof ROLES)[number];

const roleBadge: Record<string, string> = {
  student: "badge-info",
  parent: "badge-success",
  teacher: "badge-warning",
  admin: "badge-danger",
  super_admin: "badge-danger",
};

const roleAvatarBg: Record<string, string> = {
  student: "bg-info-100 text-info-700 dark:bg-info-900/40 dark:text-info-300",
  parent: "bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-300",
  teacher: "bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-300",
  admin: "bg-danger-100 text-danger-700 dark:bg-danger-900/40 dark:text-danger-300",
  super_admin: "bg-danger-100 text-danger-700 dark:bg-danger-900/40 dark:text-danger-300",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Same normalize/validate/sanitize trio as frontend's and mobile's login
// screens, so an admin gets the identical inline feedback a self-service
// signup would — the backend's CreateTeacherRequest normalizes on its own,
// but only after a round-trip, so this catches a malformed number sooner.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return digits;
}

function sanitizePhoneInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

function phoneFieldError(digitsOnly: string): string | null {
  if (!digitsOnly) return null;
  if (digitsOnly.length < 10) return "Enter a 10-digit mobile number.";
  if (!/^[6-9]/.test(digitsOnly)) return "Enter a valid Indian mobile number.";
  return null;
}

function avatarInitial(user: User): string {
  // Phone-OTP signup is a supported path with no email/name on file — fall
  // back to "?" rather than crashing the whole list on .charAt(0) of null.
  const src = user.name?.trim() || user.email?.trim();
  return src ? src.charAt(0).toUpperCase() : "?";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50 dark:border-gray-800">
      {[40, 48, 28, 24, 24, 32].map((w, i) => (
        <td key={i} className="table-td">
          <div
            className={`h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse`}
            style={{ width: `${w * 4}px`, maxWidth: "100%" }}
          />
        </td>
      ))}
    </tr>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <tr>
      <td colSpan={6} className="py-16 text-center">
        <Users className="mx-auto w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">
          {filtered ? "No users match your filters" : "No users found"}
        </p>
        {filtered && (
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Try adjusting the search or filter options.
          </p>
        )}
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const qc = useQueryClient();

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "">("");

  // Pagination
  const [page, setPage] = useState(0);

  // Change-role modal
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [pendingRole, setPendingRole] = useState<string>("");

  // Create-teacher modal
  const [showCreateTeacher, setShowCreateTeacher] = useState(false);
  const [teacherPhone, setTeacherPhone] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherSchool, setTeacherSchool] = useState("");

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: users = [], isLoading, isError, refetch } = useQuery<User[]>({
    queryKey: ["admin-users", roleFilter],
    queryFn: () => {
      const params: Record<string, unknown> = {};
      if (roleFilter) params.role = roleFilter;
      return authApi.getUsers(params).then((r) => r.data);
    },
  });

  // ── Client-side filters ────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.name ?? "").toLowerCase().includes(q)
      );
    }
    if (statusFilter === "active") list = list.filter((u) => u.is_active);
    if (statusFilter === "inactive") list = list.filter((u) => !u.is_active);
    return list;
  }, [users, search, statusFilter]);

  // Reset page when filters change
  useEffect(() => setPage(0), [search, roleFilter, statusFilter]);

  const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
  const pagedUsers = filteredUsers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Effective subscription status (own / inherited-from-parent / free) for
  // just the visible page — a student can be premium with zero rows of
  // their own if a linked parent pays instead (see payment_service's
  // family_entitlement_service.py), which the plain role/status columns
  // can't show.
  const pagedUserIds = useMemo(() => pagedUsers.map((u) => u.id), [pagedUsers]);
  const { data: effectiveStatus = {} } = useQuery<Record<string, {
    status: "own" | "inherited" | "free";
    plan?: string;
    expires_at?: string | null;
    inherited_from_parent?: string;
  }>>({
    queryKey: ["admin-effective-subscriptions", pagedUserIds],
    queryFn: () => paymentApi.adminEffectiveStatusBatch(pagedUserIds).then((r) => r.data),
    enabled: pagedUserIds.length > 0,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      authApi.patchUser(id, { is_active }),
    onSuccess: () => {
      toast.success("User status updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error("Failed to update status"),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      authApi.patchUser(id, { role }),
    onSuccess: (_data, variables) => {
      toast.success(`Role updated to ${variables.role}`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setRoleTarget(null);
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? "Failed to update role"),
  });

  const createTeacherMutation = useMutation({
    mutationFn: () =>
      authApi.createTeacher({
        phone: normalizePhone(teacherPhone),
        full_name: teacherName.trim(),
        email: teacherEmail.trim() || undefined,
        school_name: teacherSchool.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Teacher account created. They can now sign in with this phone number + OTP.");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setShowCreateTeacher(false);
      setTeacherPhone("");
      setTeacherName("");
      setTeacherEmail("");
      setTeacherSchool("");
    },
    onError: (err: any) => {
      // Backend-authored message only (e.g. "A user with this phone number
      // already exists.") — never invent wording here.
      const detail = err?.response?.data?.detail;
      toast.error(detail ?? "Could not reach the server to create this teacher account.");
    },
  });

  // ── Stats ──────────────────────────────────────────────────────────────────

  const totalStudents = users.filter((u) => u.role === "student").length;
  const totalActive = users.filter((u) => u.is_active).length;
  const totalUnverified = users.filter((u) => !u.is_verified).length;

  const isFiltered = !!(search.trim() || roleFilter || statusFilter);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Users</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Manage students, parents &amp; teachers
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setShowCreateTeacher(true)}
            className="btn btn-sm btn-primary"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Teacher
          </button>
          <button
            onClick={() => refetch()}
            className="btn btn-sm btn-secondary"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatsCard
          label="Total Users"
          value={isLoading ? "…" : users.length}
          icon={Users}
          color="bg-primary-600"
        />
        <StatsCard
          label="Students"
          value={isLoading ? "…" : totalStudents}
          icon={Shield}
          color="bg-info-600"
        />
        <StatsCard
          label="Active"
          value={isLoading ? "…" : totalActive}
          icon={UserCheck}
          color="bg-success-600"
        />
        <StatsCard
          label="Unverified"
          value={isLoading ? "…" : totalUnverified}
          icon={UserX}
          color="bg-warning-600"
        />
      </div>

      {/* Table card */}
      <div className="card overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-0 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 text-sm w-full"
            />
          </div>

          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "")}
            className="input w-full sm:w-36 text-sm"
          >
            <option value="">All Roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "active" | "inactive" | "")
            }
            className="input w-full sm:w-36 text-sm"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Count bar */}
        {!isLoading && !isError && (
          <div className="px-5 py-2 border-b border-gray-50 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 text-xs text-gray-500 dark:text-gray-400">
            Showing{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {filteredUsers.length}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">{users.length}</span>{" "}
            users
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="table-th">User</th>
                <th className="table-th">Role</th>
                <th className="table-th hidden sm:table-cell">Joined</th>
                <th className="table-th">Status</th>
                <th className="table-th">Subscription</th>
                <th className="table-th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : isError ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-danger-600 dark:text-danger-400 text-sm"
                  >
                    Failed to load users.{" "}
                    <button
                      onClick={() => refetch()}
                      className="underline font-medium"
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ) : pagedUsers.length === 0 ? (
                <EmptyState filtered={isFiltered} />
              ) : (
                pagedUsers.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    subStatus={effectiveStatus[user.id]}
                    onToggle={() =>
                      toggleMutation.mutate({
                        id: user.id,
                        is_active: !user.is_active,
                      })
                    }
                    toggling={toggleMutation.isPending}
                    onChangeRole={() => {
                      setRoleTarget(user);
                      setPendingRole(user.role);
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && !isError && totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                // Sliding window of page buttons
                let idx = i;
                if (totalPages > 7) {
                  const start = Math.max(0, Math.min(page - 3, totalPages - 7));
                  idx = start + i;
                }
                return (
                  <button
                    key={idx}
                    onClick={() => setPage(idx)}
                    className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                      idx === page
                        ? "bg-primary-600 text-white"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Change Role modal */}
      {roleTarget && (
        <Modal
          title="Change Role"
          onClose={() => setRoleTarget(null)}
          size="sm"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  roleAvatarBg[roleTarget.role] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {avatarInitial(roleTarget)}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {roleTarget.name ?? roleTarget.email}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {roleTarget.email}
                </p>
              </div>
            </div>

            <div>
              <label className="label">New Role</label>
              <select
                value={pendingRole}
                onChange={(e) => setPendingRole(e.target.value)}
                className="input text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setRoleTarget(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                disabled={
                  roleMutation.isPending || pendingRole === roleTarget.role
                }
                onClick={() =>
                  roleMutation.mutate({ id: roleTarget.id, role: pendingRole })
                }
                className="btn btn-primary btn-sm"
              >
                {roleMutation.isPending ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  "Save Role"
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Teacher modal */}
      {showCreateTeacher && (
        <Modal
          title="Add Teacher"
          onClose={() => setShowCreateTeacher(false)}
          size="sm"
          footer={
            <>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setShowCreateTeacher(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                disabled={
                  createTeacherMutation.isPending ||
                  !!phoneFieldError(teacherPhone) ||
                  !teacherPhone.trim() ||
                  !teacherName.trim()
                }
                onClick={() => createTeacherMutation.mutate()}
              >
                {createTeacherMutation.isPending ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  "Create Teacher"
                )}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Teachers have no self-service sign-up — only an admin can create a teacher account.
              They will sign in with this phone number using the same OTP flow as students.
            </p>
            <div>
              <label className="label">Phone Number *</label>
              <input
                className="input w-full"
                placeholder="9876543210"
                value={teacherPhone}
                onChange={(e) => setTeacherPhone(sanitizePhoneInput(e.target.value))}
                inputMode="numeric"
                maxLength={10}
              />
              {phoneFieldError(teacherPhone) && (
                <p className="text-xs text-red-500 mt-1">{phoneFieldError(teacherPhone)}</p>
              )}
            </div>
            <div>
              <label className="label">Full Name *</label>
              <input
                className="input w-full"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Email (optional)</label>
              <input
                type="email"
                className="input w-full"
                value={teacherEmail}
                onChange={(e) => setTeacherEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label">School Name (optional)</label>
              <input
                className="input w-full"
                value={teacherSchool}
                onChange={(e) => setTeacherSchool(e.target.value)}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────

interface EffectiveSubStatus {
  status: "own" | "inherited" | "free";
  plan?: string;
  expires_at?: string | null;
  inherited_from_parent?: string;
}

interface UserRowProps {
  user: User;
  subStatus?: EffectiveSubStatus;
  onToggle: () => void;
  toggling: boolean;
  onChangeRole: () => void;
}

function UserRow({ user, subStatus, onToggle, toggling, onChangeRole }: UserRowProps) {
  return (
    <tr className="table-row-hover">
      {/* Avatar + name + email */}
      <td className="table-td">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
              roleAvatarBg[user.role] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
            }`}
          >
            {avatarInitial(user)}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[160px]">
              {user.name ?? <span className="text-gray-400 dark:text-gray-500 italic">—</span>}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[160px]">
              {user.email}
            </p>
          </div>
        </div>
      </td>

      {/* Role badge */}
      <td className="table-td">
        <span className={`badge ${roleBadge[user.role] ?? "badge-gray"}`}>
          {user.role}
        </span>
      </td>

      {/* Joined date */}
      <td className="table-td hidden sm:table-cell text-gray-500 dark:text-gray-400 text-xs">
        {formatDate(user.created_at)}
      </td>

      {/* Status toggle */}
      <td className="table-td">
        <button
          onClick={onToggle}
          disabled={toggling}
          title={user.is_active ? "Click to deactivate" : "Click to activate"}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed ${
            user.is_active ? "bg-success-500" : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
              user.is_active ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
        <span
          className={`ml-2 text-xs font-medium ${
            user.is_active ? "text-success-600 dark:text-success-400" : "text-gray-400 dark:text-gray-500"
          }`}
        >
          {user.is_active ? "Active" : "Inactive"}
        </span>
      </td>

      {/* Subscription — own vs inherited from a linked parent vs free.
          Only meaningful for students/parents; teacher/admin rows have no
          subscription concept, so this stays blank for them. */}
      <td className="table-td">
        {!subStatus ? (
          <span className="text-gray-300 dark:text-gray-600 text-xs">…</span>
        ) : subStatus.status === "own" ? (
          <span className="badge badge-success" title={subStatus.expires_at ? `Expires ${formatDate(subStatus.expires_at)}` : undefined}>
            Premium
          </span>
        ) : subStatus.status === "inherited" ? (
          <span
            className="badge badge-info"
            title={`Inherited from parent ${subStatus.inherited_from_parent?.slice(0, 8)}…${subStatus.expires_at ? ` · covered until ${formatDate(subStatus.expires_at)}` : ""}`}
          >
            Premium (via parent)
          </span>
        ) : (
          <span className="badge badge-gray">Free</span>
        )}
      </td>

      {/* Actions */}
      <td className="table-td">
        <div className="flex items-center gap-2">
          {(user.role === "student" || user.role === "parent") && (
            <Link
              to={`/users/${user.id}/analytics`}
              state={{ user }}
              className="btn btn-sm btn-secondary whitespace-nowrap"
            >
              View Analytics
            </Link>
          )}
          <button
            onClick={onChangeRole}
            className="btn btn-sm btn-secondary whitespace-nowrap"
          >
            Change Role
          </button>
        </div>
      </td>
    </tr>
  );
}
