import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, RefreshControl, ActivityIndicator,
  Modal, Animated, TextInput, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import Toast from "react-native-toast-message";
import { useAppSelector } from "@/store";
import { chatApi, ChatRoom } from "@/api/chat";
import { useLinkedParent, type ParentLink } from "@/hooks/useLinkedParent";
import ChallengeFriendModal, { ChallengeTarget } from "@/components/ChallengeFriendModal";
import StudentSearchScreen from "./StudentSearchScreen";
import NewGroupScreen from "./NewGroupScreen";
import ChatRoomScreen from "./ChatRoomScreen";
import StudentMessagesScreen from "@/screens/main/StudentMessagesScreen";
import { palette, semantic, radius, spacing, typography } from "@/theme/colors";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Deterministic per-user avatar tint — a varied rotation of solid brand-safe
// colors (decorative only, not a gradient).
const AVATAR_COLORS = [
  palette.primary600, palette.purple600, "#0891B2", palette.success600,
  palette.warning600, palette.danger600, "#DB2777", palette.primary700,
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function otherMemberName(room: ChatRoom, myId: string): string {
  if (room.is_group) return room.room_name;
  const other = room.members.find((m) => m.user_id !== myId);
  return other?.full_name ?? room.room_name;
}

function isOnline(room: ChatRoom, myId: string): boolean {
  if (room.is_group) return false;
  const other = room.members.find((m) => m.user_id !== myId);
  return other?.is_online ?? false;
}

// ─── Pinned family/parent row ────────────────────────────────────────────────
// Separate data source (messageApi via useLinkedParent) from the chatApi
// rooms below — rendered as a FlatList ListHeaderComponent rather than
// merged into the `rooms` array/type, so it always pins to the top like a
// WhatsApp pinned chat.

function relationshipLabel(link?: ParentLink | null): string {
  if (!link?.relationship) return "Parent";
  const r = link.relationship.trim();
  return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
}

interface ParentThreadRowProps {
  parents: ParentLink[];
  thread: { last_message: string; last_message_time: string; unread_count: number } | null;
  active: boolean;
  onPress: () => void;
}

function ParentThreadRow({ parents, thread, active, onPress }: ParentThreadRowProps) {
  const primary = parents[0] ?? null;
  const name = parents.length > 1 ? "Family" : primary?.parent_name ?? "Parent";
  const color = avatarColor(name);
  const preview = thread?.last_message ?? "No messages yet";
  const time = thread?.last_message_time;
  const unread = thread?.unread_count ?? 0;

  return (
    <TouchableOpacity
      style={[styles.roomRow, active && styles.roomRowActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.avatarWrap}>
        <View style={[styles.avatarCircle, { backgroundColor: color }]}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
      </View>

      <View style={styles.roomInfo}>
        <View style={styles.roomTopRow}>
          <View style={styles.roomNameRow}>
            <Text style={styles.roomName} numberOfLines={1}>{name}</Text>
            <View style={styles.familyBadge}>
              <Text style={styles.familyBadgeText}>{relationshipLabel(primary)}</Text>
            </View>
          </View>
          {!!time && <Text style={styles.roomTime}>{formatTime(time)}</Text>}
        </View>
        <View style={styles.roomBottomRow}>
          <Text style={[styles.roomPreview, unread > 0 && styles.roomPreviewBold]} numberOfLines={1}>
            {preview}
          </Text>
          {unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Room Row ─────────────────────────────────────────────────────────────────

interface RoomRowProps {
  room:   ChatRoom;
  myId:   string;
  onPress: () => void;
  /** Direct chats only — opens the Challenge Friend modal for this friend. */
  onChallenge?: () => void;
}

function RoomRow({ room, myId, onPress, onChallenge }: RoomRowProps) {
  const name    = otherMemberName(room, myId);
  const online  = isOnline(room, myId);
  const color   = avatarColor(name);
  const preview = room.last_message?.content ?? "No messages yet";
  const time    = room.last_message?.updated_at ?? room.updated_at;
  const unread  = room.unread_count;
  // Uploaded profile photo of the DM partner (groups keep the initials circle)
  const otherAvatar = room.is_group ? null
    : room.members.find((m) => m.user_id !== myId)?.avatar_url ?? null;

  return (
    <TouchableOpacity style={styles.roomRow} onPress={onPress} activeOpacity={0.75}>
      {/* Avatar */}
      <View style={styles.avatarWrap}>
        {otherAvatar ? (
          <Image source={{ uri: otherAvatar }} style={styles.avatarPhoto} />
        ) : (
          <View style={[styles.avatarCircle, { backgroundColor: color }]}>
            <Text style={styles.avatarText}>{initials(name)}</Text>
          </View>
        )}
        {online && <View style={styles.onlineDot} />}
      </View>

      {/* Info */}
      <View style={styles.roomInfo}>
        <View style={styles.roomTopRow}>
          <View style={styles.roomNameRow}>
            <Text style={styles.roomName} numberOfLines={1}>{name}</Text>
            {room.is_group && (
              <View style={styles.groupBadge}>
                <Text style={styles.groupBadgeText}>Group</Text>
              </View>
            )}
          </View>
          <Text style={styles.roomTime}>{formatTime(time)}</Text>
        </View>
        <View style={styles.roomBottomRow}>
          <Text style={[styles.roomPreview, unread > 0 && styles.roomPreviewBold]} numberOfLines={1}>
            {preview}
          </Text>
          {unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Per-friend battle challenge (direct chats only) */}
      {!room.is_group && onChallenge && (
        <TouchableOpacity
          style={styles.challengeBtn}
          onPress={onChallenge}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.8}
        >
          <Ionicons name="flash" size={16} color={palette.primary600} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── FAB ──────────────────────────────────────────────────────────────────────

interface FabProps {
  onPress: () => void;
}

function FloatingButton({ onPress }: FabProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start(onPress);
  };

  return (
    <Animated.View style={[styles.fab, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity onPress={handlePress} style={styles.fabInner} activeOpacity={0.9}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const navigation = useNavigation<any>();
  const user = useAppSelector((s) => s.auth.user);
  const myId = user?.id ?? "";
  const { hasParent, approvedParents, parentThread } = useLinkedParent();

  const [rooms,       setRooms]       = useState<ChatRoom[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [showSearch,  setShowSearch]  = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [activeRoom,  setActiveRoom]  = useState<ChatRoom | null>(null);
  const [showParentChat, setShowParentChat] = useState(false);
  const [roomFilter,  setRoomFilter]  = useState("");
  const [challengeTarget, setChallengeTarget] = useState<ChallengeTarget | null>(null);

  // Friend-vs-friend battle challenge from a direct chat row
  const handleChallenge = useCallback((room: ChatRoom) => {
    const other = room.members.find((m) => m.user_id !== myId);
    if (!other) return;
    setChallengeTarget({
      user_id: other.user_id,
      full_name: other.full_name ?? null,
      avatar_url: other.avatar_url ?? null,
    });
  }, [myId]);

  const CACHE_KEY = `chat_rooms_${myId}`;

  // Pending friend requests badge — Redis-cached count endpoint, polled
  // cheaply (the backend invalidates the cache on every send/accept/reject/
  // cancel, so the badge is fresh right after any action).
  const { data: pendingData, refetch: refetchPending } = useQuery({
    queryKey: ["chat-friend-request-count", myId],
    queryFn: () => chatApi.getFriendRequestCount(myId).then((r) => r.data),
    enabled: !!myId,
    refetchInterval: 30_000,
  });
  const pendingCount = pendingData?.count ?? 0;
  const [searchTab, setSearchTab] = useState<"search" | "requests">("search");

  // Load from cache immediately, then fetch fresh
  const loadRooms = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        setRooms(JSON.parse(cached));
        setLoading(false);
      }
    } catch {
      // ignore cache errors
    }

    try {
      const res = await chatApi.getRooms(myId);
      const fresh = res.data ?? [];
      setRooms(fresh);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
    } catch {
      // network failure — cached data stays
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [myId, CACHE_KEY]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRooms(true);
  }, [loadRooms]);

  const handleRoomPress = (room: ChatRoom) => setActiveRoom(room);

  const handleRoomCreated = useCallback((room: ChatRoom) => {
    setShowSearch(false);
    setActiveRoom(room);
    setRooms((prev) => {
      const exists = prev.find((r) => r.room_id === room.room_id);
      if (exists) return prev;
      return [room, ...prev];
    });
  }, []);

  // NewGroupScreen only returns the new room's id, so refresh the room list
  // and open the room once it shows up in the fresh data (mirrors onRoomCreated above).
  const handleGroupCreated = useCallback(async (roomId: string) => {
    setShowNewGroup(false);
    try {
      const res = await chatApi.getRooms(myId);
      const fresh = res.data ?? [];
      setRooms(fresh);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
      const created = fresh.find((r) => r.room_id === roomId);
      if (created) setActiveRoom(created);
    } catch {
      // network failure — the new group will show up on next manual refresh
    }
  }, [myId, CACHE_KEY]);

  // FAB action menu — a real cross-platform Modal (mirrors the web page's
  // always-visible "Find Students" / "New Group" actions). The previous
  // Alert.alert/ActionSheetIOS implementation was a silent no-op on
  // react-native-web builds, which made "New Group" unreachable there.
  const [showFabMenu, setShowFabMenu] = useState(false);
  const handleFabPress = useCallback(() => setShowFabMenu(true), []);

  // Clears any AsyncStorage keys prefixed "chat_" — RN equivalent of web's
  // localStorage "chat_" purge in the Clear Chat Cache action.
  const handleClearCache = useCallback(async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const chatKeys = allKeys.filter((k) => k.startsWith("chat_"));
      if (chatKeys.length > 0) await AsyncStorage.multiRemove(chatKeys);
      Toast.show({ type: "success", text1: "Chat cache cleared" });
      loadRooms(true);
    } catch {
      Toast.show({ type: "error", text1: "Could not clear cache" });
    }
  }, [loadRooms]);

  // Same cross-platform-Modal treatment as the FAB menu (Alert-based sheets
  // are silent no-ops on react-native-web).
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const handleOverflowPress = useCallback(() => setShowOverflowMenu(true), []);

  // Client-side filter over the loaded rooms — mirrors web's filteredRooms (name / last message)
  const filteredRooms = useMemo(() => {
    const q = roomFilter.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => {
      const name = otherMemberName(r, myId).toLowerCase();
      const preview = r.last_message?.content?.toLowerCase() ?? "";
      return name.includes(q) || preview.includes(q);
    });
  }, [rooms, roomFilter, myId]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (activeRoom) {
    return (
      <ChatRoomScreen
        room={activeRoom}
        myId={myId}
        onBack={() => {
          setActiveRoom(null);
          loadRooms(true);
        }}
      />
    );
  }

  if (showParentChat) {
    return <StudentMessagesScreen onBack={() => setShowParentChat(false)} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.headerActions}>
          <View style={styles.headerIconWrap}>
            <TouchableOpacity
              style={styles.headerSearchBtn}
              onPress={() => { setSearchTab(pendingCount > 0 ? "requests" : "search"); setShowSearch(true); }}
              activeOpacity={0.7}
            >
              <Ionicons name={pendingCount > 0 ? "person-add" : "search"} size={20} color={palette.primary600} />
            </TouchableOpacity>
            {pendingCount > 0 && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeTxt}>{pendingCount > 9 ? "9+" : pendingCount}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.headerSearchBtn}
            onPress={handleOverflowPress}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={palette.primary600} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search / filter chats */}
      <View style={styles.filterRow}>
        <Ionicons name="search" size={16} color={palette.gray400} style={styles.filterIcon} />
        <TextInput
          style={styles.filterInput}
          value={roomFilter}
          onChangeText={setRoomFilter}
          placeholder="Search chats…"
          placeholderTextColor={palette.gray400}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Room List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.primary600} />
        </View>
      ) : (
        <FlatList
          data={filteredRooms}
          keyExtractor={(item) => item.room_id}
          renderItem={({ item }) => (
            <RoomRow
              room={item}
              myId={myId}
              onPress={() => handleRoomPress(item)}
              onChallenge={() => handleChallenge(item)}
            />
          )}
          ListHeaderComponent={
            hasParent && (!roomFilter.trim() || approvedParents.some((p) => (p.parent_name ?? "").toLowerCase().includes(roomFilter.trim().toLowerCase())))
              ? (
                <ParentThreadRow
                  parents={approvedParents}
                  thread={parentThread}
                  active={showParentChat}
                  onPress={() => setShowParentChat(true)}
                />
              )
              : null
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.primary600}
              colors={[palette.primary600]}
            />
          }
          ListEmptyComponent={
            hasParent ? null : roomFilter.trim() ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={64} color={palette.gray300} />
                <Text style={styles.emptyTitle}>No matching chats</Text>
                <Text style={styles.emptySubtitle}>Try a different search term.</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={64} color={palette.gray300} />
                <Text style={styles.emptyTitle}>No chats yet</Text>
                <Text style={styles.emptySubtitle}>Find students to chat with!</Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => setShowSearch(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-add" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.emptyBtnText}>Find Students</Text>
                </TouchableOpacity>
              </View>
            )
          }
          contentContainerStyle={filteredRooms.length === 0 ? styles.emptyContainer : undefined}
        />
      )}

      {/* FAB — opens the action menu offering both Find Students & New Group, one tap away */}
      <FloatingButton onPress={handleFabPress} />

      {/* Friend-vs-friend battle challenge (opened from a chat row's ⚡ button) */}
      <ChallengeFriendModal target={challengeTarget} onClose={() => setChallengeTarget(null)} />

      {/* Overflow (Chat Settings) menu — cross-platform Modal */}
      <Modal visible={showOverflowMenu} animationType="fade" transparent onRequestClose={() => setShowOverflowMenu(false)}>
        <TouchableOpacity
          style={styles.fabMenuOverlay}
          activeOpacity={1}
          onPress={() => setShowOverflowMenu(false)}
        >
          <View style={styles.fabMenuCard}>
            <Text style={styles.fabMenuTitle}>Chat Settings</Text>
            <TouchableOpacity
              style={styles.fabMenuItem}
              activeOpacity={0.8}
              onPress={() => { setShowOverflowMenu(false); handleClearCache(); }}
            >
              <View style={[styles.fabMenuIcon, { backgroundColor: palette.danger50 }]}>
                <Ionicons name="trash-outline" size={18} color={palette.danger600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fabMenuItemTitle, { color: palette.danger600 }]}>Clear Chat Cache</Text>
                <Text style={styles.fabMenuItemSub}>Remove locally cached rooms & messages</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* FAB action menu — cross-platform Modal (works on native AND web) */}
      <Modal visible={showFabMenu} animationType="fade" transparent onRequestClose={() => setShowFabMenu(false)}>
        <TouchableOpacity
          style={styles.fabMenuOverlay}
          activeOpacity={1}
          onPress={() => setShowFabMenu(false)}
        >
          <View style={styles.fabMenuCard}>
            <Text style={styles.fabMenuTitle}>New Chat</Text>
            <TouchableOpacity
              style={styles.fabMenuItem}
              activeOpacity={0.8}
              onPress={() => { setShowFabMenu(false); setShowSearch(true); }}
            >
              <View style={[styles.fabMenuIcon, { backgroundColor: palette.primary50 }]}>
                <Ionicons name="person-add" size={18} color={palette.primary600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fabMenuItemTitle}>Find Students</Text>
                <Text style={styles.fabMenuItemSub}>Search and send friend requests</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.gray400} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fabMenuItem}
              activeOpacity={0.8}
              onPress={() => { setShowFabMenu(false); setShowNewGroup(true); }}
            >
              <View style={[styles.fabMenuIcon, { backgroundColor: semantic.success.bg }]}>
                <Ionicons name="people" size={18} color={palette.success600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fabMenuItemTitle}>New Group</Text>
                <Text style={styles.fabMenuItemSub}>Create a study group (up to 10 students)</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.gray400} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Student Search Modal */}
      <Modal
        visible={showSearch}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSearch(false)}
      >
        <StudentSearchScreen
          key={searchTab}
          myId={myId}
          initialTab={searchTab}
          onClose={() => { setShowSearch(false); setSearchTab("search"); refetchPending(); }}
          onRoomCreated={handleRoomCreated}
        />
      </Modal>

      {/* New Group Modal */}
      <Modal
        visible={showNewGroup}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNewGroup(false)}
      >
        <NewGroupScreen
          onBack={() => setShowNewGroup(false)}
          onCreated={handleGroupCreated}
        />
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: "#fff" },

  // FAB / overflow action menus (cross-platform Modal action sheets)
  fabMenuOverlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end", padding: spacing.lg },
  fabMenuCard:      { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing.md + 2, marginBottom: 70 },
  fabMenuTitle:     { ...typography.caption, color: palette.gray400, marginBottom: spacing.sm, marginLeft: spacing.xs },
  fabMenuItem:      { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.xs, minHeight: 44 },
  fabMenuIcon:      { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  fabMenuItemTitle: { ...typography.bodyMedium, color: palette.gray900, fontWeight: "700" },
  fabMenuItemSub:   { fontSize: 11, color: palette.gray400, marginTop: 1 },
  header:           { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.lg - 2, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  headerTitle:      { ...typography.h1, color: palette.gray900 },
  headerActions:    { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerIconWrap:   { position: "relative" },
  headerSearchBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center" },
  pendingBadge:     { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: palette.danger500, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: "#fff" },
  pendingBadgeTxt:  { fontSize: 10, fontWeight: "800", color: "#fff" },
  centered:         { flex: 1, alignItems: "center", justifyContent: "center" },

  // Filter / search chats input
  filterRow:        { flexDirection: "row", alignItems: "center", marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.xs, backgroundColor: palette.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md },
  filterIcon:        { marginRight: spacing.sm - 2 },
  filterInput:       { flex: 1, paddingVertical: spacing.sm + 1, fontSize: 14, color: palette.gray900 },

  // Room row
  roomRow:          { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.lg - 2, backgroundColor: "#fff" },
  roomRowActive:    { backgroundColor: palette.primary50 },
  familyBadge:      { marginLeft: spacing.sm - 2, backgroundColor: palette.success50, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  familyBadgeText:  { color: palette.success600, fontSize: 10, fontWeight: "700" },
  avatarWrap:       { position: "relative", marginRight: spacing.md },
  avatarCircle:     { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  avatarPhoto:      { width: 52, height: 52, borderRadius: 26 },
  avatarText:       { color: "#fff", fontSize: 17, fontWeight: "700" },
  onlineDot:        { position: "absolute", bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: palette.success500, borderWidth: 2, borderColor: "#fff" },
  roomInfo:         { flex: 1 },
  roomTopRow:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  roomNameRow:      { flexDirection: "row", alignItems: "center", flex: 1, marginRight: spacing.sm },
  roomName:         { fontSize: 15, fontWeight: "700", color: palette.gray900, flexShrink: 1 },
  groupBadge:       { marginLeft: spacing.sm - 2, backgroundColor: palette.gray600, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  groupBadgeText:   { color: "#fff", fontSize: 10, fontWeight: "700" },
  roomTime:         { fontSize: 12, color: palette.gray400, flexShrink: 0 },
  roomBottomRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  roomPreview:      { fontSize: 13, color: palette.gray500, flex: 1, marginRight: spacing.sm },
  roomPreviewBold:  { color: palette.gray900, fontWeight: "600" },
  unreadBadge:      { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: palette.success500, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  unreadText:       { color: "#fff", fontSize: 11, fontWeight: "700" },
  challengeBtn:     { marginLeft: spacing.sm + 2, width: 34, height: 34, borderRadius: 17, backgroundColor: palette.primary50, borderWidth: 1, borderColor: palette.primary100, alignItems: "center", justifyContent: "center" },

  separator:        { height: 1, backgroundColor: palette.gray50, marginLeft: 80 },

  // Empty state
  emptyContainer:   { flex: 1 },
  emptyState:       { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyTitle:       { fontSize: 18, fontWeight: "700", color: palette.gray700, marginTop: spacing.md },
  emptySubtitle:    { fontSize: 14, color: palette.gray400, marginTop: spacing.xs, marginBottom: spacing["2xl"] },
  emptyBtn:         { flexDirection: "row", alignItems: "center", backgroundColor: palette.success600, paddingVertical: spacing.md, paddingHorizontal: spacing["2xl"], borderRadius: radius.lg, minHeight: 44, elevation: 2, shadowColor: palette.success600, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 },
  emptyBtnText:     { color: "#fff", fontWeight: "700", fontSize: 15 },

  // FAB
  fab:              { position: "absolute", bottom: spacing["2xl"], right: spacing.xl },
  fabInner:         { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.success600, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: palette.success600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
});
