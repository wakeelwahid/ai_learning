import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useAppSelector } from "@/store";
import { chatApi, ChatRoom, RoomMember, StudentSearchResult } from "@/api/chat";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui";
import { palette, semantic, typography, radius, spacing, cardShadow } from "@/theme/colors";

// ─── Props ────────────────────────────────────────────────────────────────────
// Companion screen to NewGroupScreen — takes plain props (matches
// ParentRoomViewScreen's style) and is wired into the stack via a thin
// route-params-extracting wrapper in MainNavigator.

interface Props {
  roomId: string;
  onBack: () => void;
}

// ─── Avatar helpers (same as ChatRoomScreen / NewGroupScreen) ────────────────

// Deterministic per-user avatar tint — a varied rotation of solid brand-safe
// colors (not the brand indigo, kept distinct so avatars stay visually
// distinguishable); decorative only, not a gradient.
const AVATAR_COLORS = [
  palette.primary600, palette.purple600, "#0891B2", palette.success600,
  palette.warning600, palette.danger600, "#DB2777", palette.primary700,
];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Member row — admin badge, "(You)" marker, admin-only Remove action ──────

function MemberRow({
  member, isMe, canRemove, removing, onRemove,
}: {
  member: RoomMember;
  isMe: boolean;
  canRemove: boolean;
  removing: boolean;
  onRemove: (m: RoomMember) => void;
}) {
  const color = avatarColor(member.full_name);
  return (
    <View style={styles.memberRow}>
      <View style={[styles.memberAvatar, { backgroundColor: color }]}>
        <Text style={styles.memberAvatarText}>{initials(member.full_name)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.full_name}{isMe ? "  (You)" : ""}
        </Text>
      </View>
      {member.is_admin && (
        <View style={styles.adminBadge}>
          <Ionicons name="shield-checkmark" size={11} color={palette.primary700} />
          <Text style={styles.adminBadgeText}>Admin</Text>
        </View>
      )}
      {member.is_online && (
        <View style={styles.onlineBadge}>
          <Text style={styles.onlineBadgeText}>Online</Text>
        </View>
      )}
      {canRemove && (
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => onRemove(member)}
          disabled={removing}
          activeOpacity={0.8}
        >
          {removing
            ? <ActivityIndicator size="small" color={palette.danger600} />
            : <Text style={styles.removeBtnText}>Remove</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Search result row (for adding new members) ──────────────────────────────

function StudentRow({
  student,
  added,
  pending,
  onAdd,
}: {
  student: StudentSearchResult;
  added:   boolean;
  pending: boolean;
  onAdd:   (s: StudentSearchResult) => void;
}) {
  const color = avatarColor(student.user_id);
  return (
    <View style={styles.studentRow}>
      <View style={[styles.studentAvatar, { backgroundColor: color }]}>
        <Text style={styles.studentAvatarTxt}>{initials(student.full_name)}</Text>
      </View>
      <View style={styles.studentInfo}>
        <Text style={styles.studentName}>{student.full_name}</Text>
        {student.school_name ? (
          <Text style={styles.studentMeta}>{student.school_name}</Text>
        ) : null}
      </View>
      {added ? (
        <View style={styles.addedPill}>
          <Ionicons name="checkmark" size={13} color={palette.success700} />
          <Text style={styles.addedPillText}>Added</Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => onAdd(student)}
          disabled={pending}
          activeOpacity={0.75}
          style={styles.addBtn}
        >
          {pending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="add" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GroupSettingsScreen({ roomId, onBack }: Props) {
  const user = useAppSelector((s) => s.auth.user);
  const myId = user?.id ?? "";

  const [room,    setRoom]    = useState<ChatRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [searchQuery,   setSearchQuery]   = useState("");
  const [friends,       setFriends]       = useState<StudentSearchResult[]>([]);
  const [searching,     setSearching]     = useState(false);
  const [addingId,      setAddingId]      = useState<string | null>(null);
  const [justAdded,     setJustAdded]     = useState<Set<string>>(new Set());
  const [nameDraft,     setNameDraft]     = useState("");
  const [savingName,    setSavingName]    = useState(false);
  const [removingId,    setRemovingId]    = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<RoomMember | null>(null);
  const [confirmLeave,  setConfirmLeave]  = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);

  // cap = admin + 10 friends = 11 membership rows (matches the backend)
  const MAX_MEMBERS = 11;
  const memberCount = room?.members.length ?? 0;
  const atLimit = memberCount >= MAX_MEMBERS;
  const me = room?.members.find((m) => m.user_id === myId);
  const isAdmin = !!me?.is_admin;

  // ── Load room (no single-room GET endpoint — reuse the rooms list) ─────────
  const loadRoom = useCallback(async () => {
    if (!myId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await chatApi.getRooms(myId);
      const found = (data ?? []).find((r) => r.room_id === roomId) ?? null;
      if (!found) {
        setError("Group not found.");
      } else {
        setRoom(found);
        setNameDraft(found.room_name ?? "");
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Failed to load group details.");
    } finally {
      setLoading(false);
    }
  }, [roomId, myId]);

  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  // ── Friends pool (groups are friends-only — server-enforced) ────────────────
  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    chatApi.getFriends()
      .then(({ data }) => { if (!cancelled) setFriends(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, []);

  const memberIds = new Set((room?.members ?? []).map((m) => m.user_id));
  const addableFriends = friends.filter((f) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return f.full_name.toLowerCase().includes(q) ||
      (f.school_name ?? "").toLowerCase().includes(q);
  });

  // ── Rename (admin only) ─────────────────────────────────────────────────────
  const handleRename = useCallback(async () => {
    if (!room || !nameDraft.trim() || nameDraft.trim() === room.room_name) return;
    setSavingName(true);
    try {
      const { data } = await chatApi.renameGroup(room.room_id, nameDraft.trim());
      setRoom((prev) => (prev ? { ...prev, room_name: data.name } : prev));
      Toast.show({ type: "success", text1: "Group renamed", text2: data.name });
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Rename failed", text2: err?.response?.data?.detail ?? "Please try again." });
    } finally {
      setSavingName(false);
    }
  }, [room, nameDraft]);

  // ── Delete group (group admin; platform admins can via the same endpoint) ──
  const handleDeleteGroup = useCallback(async () => {
    if (!room) return;
    setDeleting(true);
    try {
      await chatApi.deleteGroup(room.room_id);
      Toast.show({ type: "success", text1: "Group deleted", text2: room.room_name });
      onBack();
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Couldn't delete group", text2: err?.response?.data?.detail ?? "Please try again." });
      setDeleting(false);
    }
  }, [room, onBack]);

  // ── Remove member (admin) / leave group (non-admin self) ───────────────────
  const doRemove = useCallback(async (member: RoomMember) => {
    if (!room) return;
    setRemovingId(member.user_id);
    try {
      const { data } = await chatApi.removeGroupMember(room.room_id, member.user_id);
      if (data.left) {
        Toast.show({ type: "success", text1: "You left the group" });
        onBack();
        return;
      }
      setRoom((prev) =>
        prev ? { ...prev, members: prev.members.filter((m) => m.user_id !== member.user_id) } : prev
      );
      setJustAdded((prev) => { const n = new Set(prev); n.delete(member.user_id); return n; });
      Toast.show({ type: "success", text1: "Member removed", text2: member.full_name });
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Couldn't remove", text2: err?.response?.data?.detail ?? "Please try again." });
    } finally {
      setRemovingId(null);
    }
  }, [room, onBack]);

  // ── Add member to the existing group ────────────────────────────────────────
  const handleAddMember = useCallback(async (student: StudentSearchResult) => {
    if (!room) return;
    if (memberCount >= MAX_MEMBERS) {
      Toast.show({ type: "error", text1: "Group full", text2: "This group already has the maximum of 10 friends." });
      return;
    }
    setAddingId(student.user_id);
    try {
      await chatApi.addMember(room.room_id, student.user_id, myId);
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              members: [
                ...prev.members,
                { user_id: student.user_id, full_name: student.full_name, is_online: false, avatar_url: student.avatar_url },
              ],
            }
          : prev
      );
      setJustAdded((prev) => new Set([...prev, student.user_id]));
      Toast.show({ type: "success", text1: "Member added", text2: student.full_name });
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "Failed to add member. Please try again.";
      Toast.show({ type: "error", text1: "Error", text2: msg });
    } finally {
      setAddingId(null);
    }
  }, [room, memberCount, myId]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={palette.gray700} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Group Settings</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.primary600} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !room) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={palette.gray700} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Group Settings</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color={palette.danger500} />
          <Text style={styles.errorTxt}>{error ?? "Group not found."}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadRoom}>
            <Text style={styles.retryBtnTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={palette.gray700} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{room.room_name || "Group Settings"}</Text>
            <Text style={styles.headerSubtitle}>{memberCount} member{memberCount === 1 ? "" : "s"}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <FlatList
          data={isAdmin ? addableFriends : []}
          keyExtractor={(item) => item.user_id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              {/* Group name — editable by the admin only */}
              {isAdmin ? (
                <View style={styles.section}>
                  <Text style={styles.label}>Group Name</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="people-outline" size={18} color={palette.gray400} style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      value={nameDraft}
                      onChangeText={(t) => setNameDraft(t.slice(0, 100))}
                      placeholder="Group name"
                      placeholderTextColor={palette.gray400}
                      maxLength={100}
                    />
                    <TouchableOpacity
                      onPress={handleRename}
                      disabled={savingName || !nameDraft.trim() || nameDraft.trim() === room.room_name}
                      activeOpacity={0.85}
                      style={[
                        styles.saveNameBtn,
                        (savingName || !nameDraft.trim() || nameDraft.trim() === room.room_name) && styles.saveNameBtnDisabled,
                      ]}
                    >
                      {savingName
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.saveNameBtnTxt}>Save</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {/* Current members */}
              <View style={styles.section}>
                <Text style={styles.label}>Members ({memberCount})</Text>
              </View>
              {room.members.map((m) => (
                <MemberRow
                  key={m.user_id}
                  member={m}
                  isMe={m.user_id === myId}
                  canRemove={isAdmin && !m.is_admin && m.user_id !== myId}
                  removing={removingId === m.user_id}
                  onRemove={(mem) => setConfirmRemove(mem)}
                />
              ))}

              {/* Add friends (groups are friends-only; admin manages members) */}
              {isAdmin && (
                <View style={styles.section}>
                  <Text style={styles.label}>Add Friends</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="search-outline" size={18} color={palette.gray400} style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Filter your friends..."
                      placeholderTextColor={palette.gray400}
                      returnKeyType="search"
                    />
                    {searching && <ActivityIndicator size="small" color={palette.primary600} style={{ marginRight: spacing.md }} />}
                  </View>
                  {atLimit && (
                    <Text style={styles.limitWarning}>
                      This group already has the maximum of 10 friends.
                    </Text>
                  )}
                </View>
              )}
            </>
          }
          renderItem={({ item }) => (
            <StudentRow
              student={item}
              added={memberIds.has(item.user_id) || justAdded.has(item.user_id)}
              pending={addingId === item.user_id}
              onAdd={handleAddMember}
            />
          )}
          ListEmptyComponent={
            isAdmin && !searching && friends.length === 0 ? (
              <EmptyState icon="people-outline" title="No friends to add — groups are friends-only" />
            ) : isAdmin && !searching && addableFriends.length === 0 && searchQuery.trim() ? (
              <EmptyState icon="person-outline" title={`No friends match "${searchQuery}"`} />
            ) : null
          }
          ListFooterComponent={
            !isAdmin ? (
              <TouchableOpacity
                style={styles.leaveBtn}
                onPress={() => setConfirmLeave(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="exit-outline" size={17} color={palette.danger600} />
                <Text style={styles.leaveBtnTxt}>Leave Group</Text>
              </TouchableOpacity>
            ) : (
              <View>
                <TouchableOpacity
                  style={styles.leaveBtn}
                  onPress={() => setConfirmDelete(true)}
                  disabled={deleting}
                  activeOpacity={0.85}
                >
                  {deleting
                    ? <ActivityIndicator size="small" color={palette.danger600} />
                    : <>
                        <Ionicons name="trash-outline" size={17} color={palette.danger600} />
                        <Text style={styles.leaveBtnTxt}>Delete Group</Text>
                      </>}
                </TouchableOpacity>
                <Text style={styles.adminNote}>
                  Deleting removes the group and its messages for all {memberCount} members.
                </Text>
              </View>
            )
          }
          contentContainerStyle={styles.listContent}
        />
      </KeyboardAvoidingView>

      {/* Confirmations (cross-platform modals) */}
      <ConfirmModal
        visible={confirmRemove !== null}
        variant="destructive"
        title="Remove member?"
        message={confirmRemove ? `Remove ${confirmRemove.full_name} from "${room.room_name}"?` : ""}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={() => { const m = confirmRemove; setConfirmRemove(null); if (m) doRemove(m); }}
        onCancel={() => setConfirmRemove(null)}
      />
      <ConfirmModal
        visible={confirmDelete}
        variant="destructive"
        title="Delete group?"
        message={`"${room.room_name}" and all its messages will be permanently deleted for every member.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => { setConfirmDelete(false); handleDeleteGroup(); }}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmModal
        visible={confirmLeave}
        variant="warning"
        title="Leave group?"
        message={`You'll stop receiving messages from "${room.room_name}".`}
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={() => { setConfirmLeave(false); if (me) doRemove(me); }}
        onCancel={() => setConfirmLeave(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Mirrors NewGroupScreen.tsx / ParentMonitorScreen.tsx conventions closely.

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing["3xl"], gap: spacing.md },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg - 2,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
    ...cardShadow,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: palette.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter:   { flex: 1, alignItems: "center" },
  headerTitle:    { ...typography.h4, color: palette.gray900 },
  headerSubtitle: { ...typography.bodySm, color: palette.gray500, marginTop: 2 },

  // Sections
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  label:   { ...typography.caption, color: palette.gray700, marginBottom: spacing.sm, textTransform: "none" },

  // Member row (current members)
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray50,
  },
  memberAvatar:     { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  memberAvatarText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  memberName:       { flex: 1, ...typography.bodyLg, color: palette.gray900, fontWeight: "500" },
  onlineBadge:      { backgroundColor: semantic.success.bg, borderRadius: 10, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  onlineBadgeText:  { color: palette.success700, fontSize: 11, fontWeight: "600" },
  adminBadge:       { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: palette.primary50, borderRadius: 10, paddingHorizontal: spacing.sm, paddingVertical: 3, marginLeft: spacing.sm },
  adminBadgeText:   { color: palette.primary700, fontSize: 11, fontWeight: "700" },
  removeBtn:        { marginLeft: spacing.sm, borderWidth: 1.5, borderColor: palette.danger100, backgroundColor: palette.danger50, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm - 2, minWidth: 68, minHeight: 32, alignItems: "center", justifyContent: "center" },
  removeBtnText:    { color: palette.danger600, fontSize: 12, fontWeight: "700" },
  saveNameBtn:      { backgroundColor: palette.primary600, borderRadius: radius.sm, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm, marginRight: spacing.sm - 2, minHeight: 36, alignItems: "center", justifyContent: "center" },
  saveNameBtnDisabled: { backgroundColor: palette.primary200 },
  saveNameBtnTxt:   { color: "#fff", fontSize: 12, fontWeight: "700" },
  leaveBtn:         { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing["2xl"], minHeight: 48, borderWidth: 1.5, borderColor: palette.danger100, backgroundColor: palette.danger50, borderRadius: radius.lg, paddingVertical: spacing.md + 1 },
  leaveBtnTxt:      { color: palette.danger600, ...typography.bodyMedium, fontWeight: "700" },
  adminNote:        { ...typography.bodySm, color: palette.gray400, textAlign: "center", marginTop: spacing["2xl"], paddingHorizontal: spacing["3xl"], lineHeight: 17 },

  // Input
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: palette.gray200,
    borderRadius: radius.lg,
    paddingRight: spacing.xs,
  },
  inputIcon: { paddingHorizontal: spacing.md },
  textInput: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: palette.gray900,
    paddingRight: spacing.sm,
  },
  limitWarning: { fontSize: 12, color: palette.warning600, marginTop: spacing.sm - 2, fontWeight: "500" },

  // Student search row
  listContent: { paddingBottom: spacing["4xl"] },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray50,
  },
  studentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  studentAvatarTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
  studentInfo: { flex: 1 },
  studentName: { ...typography.bodyMedium, color: palette.gray900 },
  studentMeta: { fontSize: 12, color: palette.gray400, marginTop: 2 },

  addBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary600,
  },
  addedPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: semantic.success.bg,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 3,
  },
  addedPillText: { color: palette.success700, fontSize: 11, fontWeight: "700" },

  // Error state
  errorTxt: { fontSize: 14, color: palette.danger600, textAlign: "center", lineHeight: 20 },
  retryBtn: {
    marginTop: spacing.xs,
    backgroundColor: palette.primary50,
    paddingHorizontal: spacing["2xl"],
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  retryBtnTxt: { fontSize: 13, fontWeight: "700", color: palette.primary600 },
});
