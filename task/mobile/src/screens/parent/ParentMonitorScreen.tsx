import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAppSelector } from "@/store";
import client from "@/api/client";
import { ChatRoom } from "@/api/chat";
import { errorDetail } from "@/api/errorDetail";
import { useLinkedChild } from "@/hooks/useLinkedChild";
import { PendingApprovalState, PendingBadge } from "@/components/parent/PendingApproval";
import { palette, semantic, accentSolid, radius, spacing, cardShadow } from "@/theme/colors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  // Optional: this screen is normally rendered as a bottom tab (no props passed),
  // where it falls back to React Navigation directly. The explicit callbacks are
  // kept for any caller that wants to embed it as a controlled modal instead.
  onBack?:      () => void;
  onOpenRoom?:  (room: ChatRoom, childId: string, childName: string) => void;
}

// ─── Time formatter ───────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d   = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  if (diff < 60_000)             return "just now";
  if (diff < 3_600_000)          return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)         return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 604_800_000)        return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = [
  accentSolid.indigo, accentSolid.violet, accentSolid.cyan, accentSolid.emerald,
  accentSolid.amber, accentSolid.rose, accentSolid.fuchsia, accentSolid.teal,
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Room row ─────────────────────────────────────────────────────────────────

function RoomRow({
  room,
  onPress,
}: {
  room:    ChatRoom;
  onPress: () => void;
}) {
  const color      = avatarColor(room.room_id);
  const roomLabel  = room.room_name || (room.members[0]?.full_name ?? "Unknown");
  const lastMsg    = room.last_message?.content ?? "No messages yet";
  const lastTime   = room.last_message?.created_at ? formatTime(room.last_message.created_at) : "";

  return (
    <TouchableOpacity style={styles.roomRow} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.roomAvatar, { backgroundColor: color }]}>
        {room.is_group
          ? <Ionicons name="people" size={20} color="#fff" />
          : <Text style={styles.roomAvatarTxt}>{initials(roomLabel)}</Text>
        }
      </View>
      <View style={styles.roomInfo}>
        <View style={styles.roomTopRow}>
          <Text style={styles.roomName} numberOfLines={1}>{roomLabel}</Text>
          {lastTime ? <Text style={styles.roomTime}>{lastTime}</Text> : null}
        </View>
        <Text style={styles.roomLastMsg} numberOfLines={1}>{lastMsg}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={palette.gray300} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ParentMonitorScreen({ onBack, onOpenRoom }: Props) {
  const user = useAppSelector((s) => s.auth.user);
  const navigation = useNavigation<any>();

  const handleBack = onBack ?? (() => navigation.goBack());
  const handleOpenRoom = onOpenRoom ?? ((room: ChatRoom, cId: string, cName: string) =>
    navigation.navigate("ParentRoomView", {
      roomId:    room.room_id,
      roomName:  room.room_name || room.members[0]?.full_name || "Chat",
      childId:   cId,
      childName: cName,
    })
  );

  // Resolve the linked child the correct way: parentId -> getStudents ->
  // selected child (see useLinkedChild — replaces the old broken
  // school_name-tag-parsing logic that nothing ever actually wrote).
  const {
    children, child, childId, childName, hasMultipleChildren, isApproved,
    selectedChildId, selectChild, isLoading: childrenLoading,
  } = useLinkedChild();

  const [rooms,     setRooms]     = useState<ChatRoom[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const fetchRooms = useCallback(async (silent = false) => {
    if (!childId || !user || !isApproved) return;
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const { data } = await client.get<ChatRoom[]>(
        `/v1/users/chat/parent/monitor/${childId}`,
        { params: { parent_user_id: user.id } }
      );
      setRooms(data);
    } catch (err: any) {
      setError(errorDetail(err, "Failed to load conversations."));
    } finally {
      silent ? setRefreshing(false) : setLoading(false);
    }
  }, [childId, user, isApproved]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderContent = () => {
    if (childrenLoading) {
      return (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={palette.primary600} />
        </View>
      );
    }

    if (!childId) {
      return (
        <View style={styles.centeredState}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="link-outline" size={40} color={palette.gray400} />
          </View>
          <Text style={styles.emptyTitle}>No Student Account Linked</Text>
          <Text style={styles.emptyBody}>
            Link a student account first to monitor their conversations.
          </Text>
        </View>
      );
    }

    if (child && !isApproved) {
      return <PendingApprovalState child={child} />;
    }

    if (loading) {
      return (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={palette.primary600} />
          <Text style={styles.loadingTxt}>Loading conversations...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centeredState}>
          <Ionicons name="alert-circle-outline" size={40} color={palette.danger500} />
          <Text style={styles.errorTxt}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchRooms()}>
            <Text style={styles.retryBtnTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.room_id}
        renderItem={({ item }) => (
          <RoomRow
            room={item}
            onPress={() => handleOpenRoom(item, childId, childName)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchRooms(true)}
            colors={[palette.primary600]}
            tintColor={palette.primary600}
          />
        }
        ListEmptyComponent={
          <View style={styles.centeredState}>
            <View style={styles.emptyIconBox}>
              <Ionicons name="chatbubble-ellipses-outline" size={40} color={palette.gray400} />
            </View>
            <Text style={styles.emptyTitle}>No Conversations Yet</Text>
            <Text style={styles.emptyBody}>
              {childName} has not started any chats yet.
            </Text>
          </View>
        }
        contentContainerStyle={rooms.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
      />
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={palette.gray700} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Monitor Chat</Text>
          {childId && (
            <Text style={styles.headerSubtitle}>{childName}</Text>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Child picker — only shown when a parent has more than one linked child */}
      {hasMultipleChildren && (
        <View style={styles.childPickerRow}>
          {children.map((c) => {
            const active = c.student_user_id === selectedChildId;
            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => selectChild(c.student_user_id)}
                style={[styles.childChip, active && styles.childChipActive]}
              >
                <Text style={[styles.childChipTxt, active && styles.childChipTxtActive]}>
                  {c.student_name ?? "Student"}
                </Text>
                {!c.is_approved && <PendingBadge style={{ marginLeft: 6 }} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Disclaimer banner */}
      <View style={styles.disclaimerBanner}>
        <View style={styles.disclaimerIconBadge}>
          <Ionicons name="eye-outline" size={14} color={palette.warning600} />
        </View>
        <Text style={styles.disclaimerTxt}>
          Read-only view. You cannot send messages on your child's behalf.
        </Text>
      </View>

      {/* Content */}
      {renderContent()}
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
    paddingVertical: spacing.md + 2,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: palette.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle:  { fontSize: 16, fontWeight: "800", color: palette.gray900 },
  headerSubtitle: { fontSize: 12, color: palette.gray500, marginTop: 2 },

  // Child picker (only shown for parents with more than one linked child)
  childPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  childChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, backgroundColor: palette.gray100 },
  childChipActive: { backgroundColor: palette.primary50 },
  childChipTxt: { fontSize: 12, fontWeight: "700", color: palette.gray500 },
  childChipTxtActive: { color: palette.primary600 },

  // Disclaimer
  disclaimerBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: semantic.warning.bg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: semantic.warning.border,
    gap: spacing.sm + 2,
  },
  disclaimerIconBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: "rgba(217,119,6,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  disclaimerTxt: {
    flex: 1,
    fontSize: 12,
    color: semantic.warning.text,
    fontWeight: "500",
    lineHeight: 17,
  },

  // Room row
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: spacing.md,
    marginTop: spacing.sm + 2,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md + 2,
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.gray100,
    ...cardShadow,
  },
  roomAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  roomAvatarTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
  roomInfo:      { flex: 1, minWidth: 0 },
  roomTopRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  roomName:      { flex: 1, fontSize: 14, fontWeight: "700", color: palette.gray900, marginRight: spacing.sm },
  roomTime:      { fontSize: 11, color: palette.gray400 },
  roomLastMsg:   { fontSize: 13, color: palette.gray500 },

  // States
  centeredState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing["3xl"], gap: spacing.md },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle:  { fontSize: 15, fontWeight: "700", color: palette.gray700, textAlign: "center" },
  emptyBody:   { fontSize: 13, color: palette.gray400, textAlign: "center", lineHeight: 19 },
  loadingTxt:  { fontSize: 14, color: palette.gray500, marginTop: spacing.sm },
  errorTxt:    { fontSize: 14, color: palette.danger500, textAlign: "center", lineHeight: 20 },
  retryBtn: {
    marginTop: 4,
    backgroundColor: palette.primary50,
    paddingHorizontal: spacing["2xl"],
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  retryBtnTxt: { fontSize: 13, fontWeight: "700", color: palette.primary600 },
});
