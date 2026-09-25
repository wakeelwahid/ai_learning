import React, { useState, useCallback, useEffect, useMemo } from "react";
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
  ScrollView,
    KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useAppSelector } from "@/store";
import { chatApi, StudentSearchResult } from "@/api/chat";
import { palette, radius, spacing, typography, cardShadow } from "@/theme/colors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectedMember {
  user_id:   string;
  full_name: string;
  avatar_url?: string | null;
}

interface Props {
  onBack:    () => void;
  onCreated: (roomId: string) => void;
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Deterministic per-user avatar tint — a varied rotation of solid brand-safe
// colors (decorative only, not a gradient).
const AVATAR_COLORS = [
  palette.primary600, palette.purple600, "#0891B2", palette.success600,
  palette.warning600, palette.danger600, "#DB2777", "#0D9488",
];

function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Member chip ─────────────────────────────────────────────────────────────

function MemberChip({
  member,
  onRemove,
}: {
  member: SelectedMember;
  onRemove: (id: string) => void;
}) {
  const color = avatarColor(member.user_id);
  return (
    <View style={styles.chip}>
      <View style={[styles.chipAvatar, { backgroundColor: color }]}>
        <Text style={styles.chipAvatarTxt}>{initials(member.full_name)}</Text>
      </View>
      <Text style={styles.chipName} numberOfLines={1}>
        {member.full_name.split(" ")[0]}
      </Text>
      <TouchableOpacity
        onPress={() => onRemove(member.user_id)}
        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
        style={styles.chipRemove}
      >
        <Ionicons name="close-circle" size={16} color={palette.gray500} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Search result row ────────────────────────────────────────────────────────

function StudentRow({
  student,
  selected,
  onToggle,
  disabled,
}: {
  student:  StudentSearchResult;
  selected: boolean;
  onToggle: (s: StudentSearchResult) => void;
  disabled: boolean;
}) {
  const color = avatarColor(student.user_id);
  return (
    <TouchableOpacity
      style={styles.studentRow}
      onPress={() => onToggle(student)}
      activeOpacity={0.75}
      disabled={disabled && !selected}
    >
      <View style={[styles.studentAvatar, { backgroundColor: color }]}>
        <Text style={styles.studentAvatarTxt}>{initials(student.full_name)}</Text>
      </View>
      <View style={styles.studentInfo}>
        <Text style={styles.studentName}>{student.full_name}</Text>
        {student.school_name ? (
          <Text style={styles.studentMeta}>{student.school_name}</Text>
        ) : null}
      </View>
      <View
        style={[
          styles.checkBox,
          selected && styles.checkBoxSelected,
          disabled && !selected && styles.checkBoxDisabled,
        ]}
      >
        {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NewGroupScreen({ onBack, onCreated }: Props) {
  const user = useAppSelector((s) => s.auth.user);

  const [groupName,    setGroupName]    = useState("");
  const [searchQuery,  setSearchQuery]  = useState("");
  const [friends,      setFriends]      = useState<StudentSearchResult[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [selected,     setSelected]     = useState<SelectedMember[]>([]);
  const [creating,     setCreating]     = useState(false);

  const MAX_MEMBERS = 10;
  const atLimit = selected.length >= MAX_MEMBERS;

  // Groups are FRIENDS-ONLY (server-enforced): the picker shows YOUR friend
  // list immediately — no searching strangers. The search box just filters
  // within your friends, locally.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await chatApi.getFriends();
        if (!cancelled) setFriends(data);
      } catch {
        // leave empty — the empty state explains friends are required
      } finally {
        if (!cancelled) setLoadingFriends(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visibleFriends = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) =>
      f.full_name.toLowerCase().includes(q) ||
      (f.school_name ?? "").toLowerCase().includes(q)
    );
  }, [friends, searchQuery]);

  // ── Toggle selection ──────────────────────────────────────────────────────
  const toggleMember = useCallback((student: StudentSearchResult) => {
    setSelected((prev) => {
      const exists = prev.find((m) => m.user_id === student.user_id);
      if (exists) {
        return prev.filter((m) => m.user_id !== student.user_id);
      }
      if (prev.length >= MAX_MEMBERS) return prev;
      return [
        ...prev,
        { user_id: student.user_id, full_name: student.full_name, avatar_url: student.avatar_url },
      ];
    });
  }, []);

  const removeMember = useCallback((userId: string) => {
    setSelected((prev) => prev.filter((m) => m.user_id !== userId));
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────
  const canCreate = groupName.trim().length > 0 && selected.length >= 1;

  // ── Create group ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!canCreate) {
      if (!groupName.trim()) {
        Toast.show({ type: "error", text1: "Group name required", text2: "Please enter a name for the group." });
        return;
      }
      if (selected.length < 1) {
        Toast.show({ type: "error", text1: "Add friends", text2: "Select at least one friend for the group." });
        return;
      }
      return;
    }
    setCreating(true);
    try {
      const memberIds = selected.map((m) => m.user_id);
      const { data } = await chatApi.createGroupRoom(groupName.trim(), memberIds, user?.id ?? "");
      Toast.show({ type: "success", text1: "Group created!", text2: groupName.trim() });
      onCreated(data.room_id);
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "Failed to create group. Please try again.";
      Toast.show({ type: "error", text1: "Error", text2: msg });
    } finally {
      setCreating(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
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
          <Text style={styles.headerTitle}>New Group</Text>
          <TouchableOpacity
            onPress={handleCreate}
            disabled={!canCreate || creating}
            activeOpacity={0.85}
            style={[styles.createBtn, (!canCreate || creating) && styles.createBtnDisabled]}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.createBtnTxt}>Create</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Step 1: Group name */}
        <View style={styles.section}>
          <Text style={styles.label}>Group Name</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="people-outline" size={18} color={palette.gray400} style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              value={groupName}
              onChangeText={(t) => setGroupName(t.slice(0, 50))}
              placeholder="e.g. Study Squad"
              placeholderTextColor={palette.gray400}
              maxLength={50}
              returnKeyType="next"
            />
            <Text style={styles.charCount}>{groupName.length}/50</Text>
          </View>
        </View>

        {/* Selected members chips */}
        {selected.length > 0 && (
          <View style={styles.chipSection}>
            <View style={styles.chipSectionHeader}>
              <Text style={styles.label}>Members</Text>
              <View style={[styles.counterBadge, atLimit && styles.counterBadgeFull]}>
                <Text style={[styles.counterTxt, atLimit && styles.counterTxtFull]}>
                  {selected.length} / {MAX_MEMBERS}
                </Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroll}
            >
              {selected.map((m) => (
                <MemberChip key={m.user_id} member={m} onRemove={removeMember} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Step 2: pick from YOUR FRIENDS */}
        <View style={styles.section}>
          <Text style={styles.label}>Add Friends ({selected.length}/{MAX_MEMBERS}, min 1)</Text>
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
            {loadingFriends && <ActivityIndicator size="small" color={palette.primary600} style={{ marginRight: spacing.md }} />}
          </View>
          {atLimit && (
            <Text style={styles.limitWarning}>
              Maximum {MAX_MEMBERS} members reached.
            </Text>
          )}
        </View>

        {/* Friend list (only friends can join a group) */}
        <FlatList
          data={visibleFriends}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => (
            <StudentRow
              student={item}
              selected={!!selected.find((m) => m.user_id === item.user_id)}
              onToggle={toggleMember}
              disabled={atLimit}
            />
          )}
          ListEmptyComponent={
            loadingFriends ? null : friends.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color={palette.gray300} />
                <Text style={styles.emptyTxt}>No friends yet</Text>
                <Text style={styles.emptySubTxt}>
                  Groups are friends-only — send some friend requests first!
                </Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="person-outline" size={40} color={palette.gray300} />
                <Text style={styles.emptyTxt}>No friends match "{searchQuery}"</Text>
              </View>
            )
          }
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },

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
    marginRight: spacing.sm + 2,
  },
  headerTitle: { flex: 1, ...typography.h4, color: palette.gray900 },
  createBtn: {
    paddingHorizontal: spacing.lg + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minWidth: 72,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary600,
  },
  createBtnDisabled: { backgroundColor: palette.primary200 },
  createBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Section
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  label: { ...typography.caption, color: palette.gray700, marginBottom: spacing.sm, textTransform: "none" },

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
  charCount: { fontSize: 11, color: palette.gray400, marginRight: spacing.md },

  // Member chips
  chipSection: { paddingTop: spacing.md },
  chipSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  chipScroll: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.primary50,
    borderRadius: 20,
    paddingVertical: spacing.sm - 2,
    paddingLeft: spacing.sm - 2,
    paddingRight: spacing.sm + 2,
    gap: spacing.sm - 2,
  },
  chipAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  chipAvatarTxt: { color: "#fff", fontSize: 10, fontWeight: "700" },
  chipName: { fontSize: 12, fontWeight: "600", color: palette.primary700, maxWidth: 72 },
  chipRemove: { marginLeft: 2 },

  // Counter badge
  counterBadge: {
    backgroundColor: palette.primary50,
    borderRadius: 10,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  counterBadgeFull: { backgroundColor: palette.warning100 },
  counterTxt: { fontSize: 12, fontWeight: "700", color: palette.primary700 },
  counterTxtFull: { color: palette.warning600 },

  // Limit warning
  limitWarning: { fontSize: 12, color: palette.warning600, marginTop: spacing.sm - 2, fontWeight: "500" },

  // Student row
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
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.gray300,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxSelected: { backgroundColor: palette.primary600, borderColor: palette.primary600 },
  checkBoxDisabled: { backgroundColor: palette.gray100, borderColor: palette.gray200 },

  // Empty state
  emptyState: { alignItems: "center", paddingTop: spacing["5xl"], gap: spacing.sm + 2 },
  emptyTxt: { fontSize: 14, color: palette.gray400, fontWeight: "500" },
  emptySubTxt: { fontSize: 12, color: palette.gray300, textAlign: "center", paddingHorizontal: spacing["3xl"], lineHeight: 17 },
});
