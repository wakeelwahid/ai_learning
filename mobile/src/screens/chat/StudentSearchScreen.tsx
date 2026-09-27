import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  RefreshControl, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import UserAvatar from "@/components/UserAvatar";
import { chatApi, ChatRoom, StudentSearchResult, FriendRequest } from "@/api/chat";
import { palette, accentSolid, radius, spacing, typography, cardShadow } from "@/theme/colors";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Deterministic per-user avatar tint — a varied rotation of solid accent
// colors (decorative only; the removed accentGradients pairs are now flat
// solids per the no-gradient design system rule).
const AVATAR_TINTS: string[] = [
  accentSolid.indigo, accentSolid.violet, accentSolid.cyan, accentSolid.emerald,
  accentSolid.amber, accentSolid.rose, accentSolid.fuchsia, accentSolid.teal,
];

function avatarTint(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Student Row ──────────────────────────────────────────────────────────────

interface StudentRowProps {
  student:      StudentSearchResult;
  onAction:     (student: StudentSearchResult) => void;
  onAccept:     (student: StudentSearchResult) => void;
  onReject:     (student: StudentSearchResult) => void;
  isResponding: boolean;
  loading:      boolean;
}

function StudentRow({ student, onAction, onAccept, onReject, isResponding, loading }: StudentRowProps) {
  const meta  = [student.school_name, student.class_name, student.board]
    .filter(Boolean).join(" · ");

  // Solid fill per friendship status (no gradients) — indigo for the primary
  // action, emerald/teal for accept/message, neutral gray for a sent request.
  const buttonConfig = {
    none:             { label: "Add Friend",   bg: palette.primary600, text: "#fff" },
    pending_sent:     { label: "Request Sent", bg: palette.gray200,    text: palette.gray500 },
    pending_received: { label: "Respond",      bg: palette.success600, text: "#fff" },
    friends:          { label: "Message",      bg: accentSolid.teal,   text: "#fff" },
  }[student.friendship_status];

  return (
    <View style={styles.studentRow}>
      {/* Avatar — uploaded photo when available, initials fallback otherwise */}
      <UserAvatar userId={student.user_id} name={student.full_name} uri={(student as any).avatar_url} size={46} style={{ marginRight: 0 }} />

      {/* Info */}
      <View style={styles.studentInfo}>
        <Text style={styles.studentName} numberOfLines={1} ellipsizeMode="tail">{student.full_name}</Text>
        {meta ? <Text style={styles.studentMeta} numberOfLines={1}>{meta}</Text> : null}
      </View>

      {/* Action button(s) */}
      {student.friendship_status === "pending_received" && isResponding ? (
        <View style={styles.requestActions}>
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: palette.success600 }]}
            onPress={() => onAccept(student)}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.acceptBtnText}>Accept</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={() => onReject(student)}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: buttonConfig.bg }]}
          onPress={() => onAction(student)}
          disabled={student.friendship_status === "pending_sent" || loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator size="small" color={buttonConfig.text} />
            : <Text style={[styles.actionBtnText, { color: buttonConfig.text }]}>{buttonConfig.label}</Text>
          }
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Request Row ──────────────────────────────────────────────────────────────

interface RequestRowProps {
  request:  FriendRequest;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  loading:  boolean;
}

function RequestRow({ request, onAccept, onReject, loading }: RequestRowProps) {
  const { from_user } = request;
  const tint = avatarTint(from_user.full_name);
  const mutual = request.mutual_friends_count ?? 0;
  const subtitle = [
    mutual > 0 ? `${mutual} mutual friend${mutual > 1 ? "s" : ""}` : null,
    from_user.school_name,
  ].filter(Boolean).join(" · ");
  const isOutgoing = request.direction === "outgoing";

  return (
    <View style={styles.requestRow}>
      <View style={[styles.studentAvatar, { backgroundColor: tint }]}>
        <Text style={styles.studentAvatarText}>{initials(from_user.full_name)}</Text>
      </View>
      <View style={styles.studentInfo}>
        <Text style={styles.studentName}>{from_user.full_name}</Text>
        {!!subtitle && <Text style={styles.studentMeta}>{subtitle}</Text>}
      </View>
      {isOutgoing ? (
        // Sent request — Facebook's "Cancel request"
        <TouchableOpacity
          style={styles.rejectBtn}
          onPress={() => onReject(request.request_id)}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator size="small" color={palette.gray500} />
            : <Text style={styles.rejectBtnText}>Cancel</Text>}
        </TouchableOpacity>
      ) : (
        // Incoming request — Facebook's Confirm / Delete pair
        <View style={styles.requestActions}>
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: palette.success600 }]}
            onPress={() => onAccept(request.request_id)}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.acceptBtnText}>Confirm</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={() => onReject(request.request_id)}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.rejectBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface Props {
  myId:         string;
  onClose:      () => void;
  onRoomCreated: (room: ChatRoom) => void;
  initialTab?:  "search" | "requests";
}

export default function StudentSearchScreen({ myId, onClose, onRoomCreated, initialTab = "search" }: Props) {
  const [activeTab,    setActiveTab]    = useState<"search" | "requests">(initialTab);
  const [query,        setQuery]        = useState("");
  const [results,      setResults]      = useState<StudentSearchResult[]>([]);
  const [searching,    setSearching]    = useState(false);
  const [total,        setTotal]        = useState(0);
  const [hasMore,      setHasMore]      = useState(false);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const pageRef  = useRef(1);
  const queryRef = useRef("");
  const [requests,     setRequests]     = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [reqLoading,   setReqLoading]   = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load friend requests (incoming + sent, Facebook-style) ───────────────────
  const loadRequests = useCallback(async (silent = false) => {
    if (!silent) setReqLoading(true);
    try {
      const [inc, out] = await Promise.all([
        chatApi.getFriendRequests(myId, "incoming"),
        chatApi.getFriendRequests(myId, "outgoing"),
      ]);
      setRequests(inc.data ?? []);
      setSentRequests(out.data ?? []);
    } catch {
      // silent
    } finally {
      setReqLoading(false);
      setRefreshing(false);
    }
  }, [myId]);

  // Cancel a request I sent (Sent Requests section)
  const handleCancelSent = useCallback(async (requestId: string) => {
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      await chatApi.cancelFriendRequest(requestId);
      setSentRequests((prev) => prev.filter((r) => r.request_id !== requestId));
    } catch {
      Toast.show({ type: "error", text1: "Couldn't cancel request" });
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // ── Directory / search loading (paginated) ──────────────────────────────────
  // Empty query = the DISCOVER directory (all registered students, newest
  // first) so the screen shows real people the moment it opens; typing
  // switches to a name/school search. Both use the same paginated endpoint.
  const loadPage = useCallback(async (q: string, page: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setSearching(true);
    try {
      const res = await chatApi.searchStudents(q, myId, page, 20);
      const fresh = res.data.results.filter((s) => s.user_id !== myId);
      // Stale-response guard: only apply if the query hasn't changed since.
      if (queryRef.current !== q) return;
      pageRef.current = page;
      setTotal(res.data.total);
      setHasMore(res.data.has_more);
      setResults((prev) => (append ? [...prev, ...fresh] : fresh));
    } catch {
      // silent
    } finally {
      setSearching(false);
      setLoadingMore(false);
    }
  }, [myId]);

  // Initial discover list on open
  useEffect(() => {
    queryRef.current = "";
    loadPage("", 1, false);
  }, [loadPage]);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    const q = text.trim();
    queryRef.current = q;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => loadPage(q, 1, false), q ? 300 : 0);
  }, [loadPage]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !searching) {
      loadPage(queryRef.current, pageRef.current + 1, true);
    }
  }, [hasMore, loadingMore, searching, loadPage]);

  // ── Student action ────────────────────────────────────────────────────────────
  const handleStudentAction = useCallback(async (student: StudentSearchResult) => {
    const id = student.user_id;

    if (student.friendship_status === "pending_received") {
      // Reveal Accept / Reject choice inline, instead of acting immediately
      setRespondingId(id);
      return;
    }

    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      if (student.friendship_status === "friends") {
        // Open DM room (created automatically when friend request was accepted)
        const res = await chatApi.createDirectRoom(id, myId);
        onRoomCreated(res.data);
      } else if (student.friendship_status === "none") {
        await chatApi.sendFriendRequest(myId, id);
        setResults((prev) =>
          prev.map((s) => s.user_id === id ? { ...s, friendship_status: "pending_sent" } : s)
        );
      }
    } catch (err: any) {
      const detail: string | undefined = err?.response?.data?.detail;
      Alert.alert("Error", detail ?? "Action failed. Please try again.");
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  }, [onRoomCreated]);

  // ── Search-tab inline respond (Accept / Reject) ──────────────────────────────
  const handleSearchTabRespond = useCallback(async (
    student: StudentSearchResult,
    status: "accepted" | "rejected"
  ) => {
    const id = student.user_id;
    const req = requests.find((r) => r.from_user.user_id === id);
    if (!req) {
      setRespondingId(null);
      return;
    }
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await chatApi.respondFriendRequest(req.request_id, status, myId);
      setRequests((prev) => prev.filter((r) => r.request_id !== req.request_id));
      setResults((prev) =>
        prev.map((s) =>
          s.user_id === id
            ? { ...s, friendship_status: status === "accepted" ? "friends" : "none" }
            : s
        )
      );
      if (status === "accepted") {
        Alert.alert("Friend Added", `You are now friends with ${student.full_name}`);
      }
    } catch {
      Alert.alert("Error", status === "accepted" ? "Could not accept request." : "Could not reject request.");
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
      setRespondingId(null);
    }
  }, [requests, myId]);

  const handleSearchTabAccept = useCallback(
    (student: StudentSearchResult) => handleSearchTabRespond(student, "accepted"),
    [handleSearchTabRespond]
  );

  const handleSearchTabReject = useCallback(
    (student: StudentSearchResult) => handleSearchTabRespond(student, "rejected"),
    [handleSearchTabRespond]
  );

  // ── Request accept / reject ───────────────────────────────────────────────────
  const handleAccept = useCallback(async (requestId: string) => {
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      await chatApi.respondFriendRequest(requestId, "accepted", myId);
      setRequests((prev) => prev.filter((r) => r.request_id !== requestId));
    } catch {
      Alert.alert("Error", "Could not accept request.");
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  }, [myId]);

  const handleReject = useCallback(async (requestId: string) => {
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      await chatApi.respondFriendRequest(requestId, "rejected", myId);
      setRequests((prev) => prev.filter((r) => r.request_id !== requestId));
    } catch {
      Alert.alert("Error", "Could not reject request.");
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  }, [myId]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={palette.gray700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find Students</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "search" && styles.tabActive]}
          onPress={() => setActiveTab("search")}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabLabel, activeTab === "search" && styles.tabLabelActive]}>
            Search
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "requests" && styles.tabActive]}
          onPress={() => setActiveTab("requests")}
          activeOpacity={0.7}
        >
          <View style={styles.tabLabelRow}>
            <Text style={[styles.tabLabel, activeTab === "requests" && styles.tabLabelActive]}>
              Requests
            </Text>
            {requests.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{requests.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Search Tab */}
      {activeTab === "search" && (
        <View style={styles.flex}>
          {/* Search input */}
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={palette.gray400} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search by name or school..."
              placeholderTextColor={palette.gray400}
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {searching && <ActivityIndicator size="small" color={palette.primary600} style={{ marginRight: spacing.md }} />}
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.user_id}
            renderItem={({ item }) => (
              <StudentRow
                student={item}
                onAction={handleStudentAction}
                onAccept={handleSearchTabAccept}
                onReject={handleSearchTabReject}
                isResponding={respondingId === item.user_id}
                loading={actionLoading[item.user_id] ?? false}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            keyboardShouldPersistTaps="handled"
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              results.length > 0 ? (
                <Text style={styles.countLine}>
                  {query.trim()
                    ? `${results.length} of ${total} matching "${query.trim()}"`
                    : `Showing ${results.length} of ${total} registered students`}
                </Text>
              ) : null
            }
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator size="small" color={palette.primary600} style={{ marginVertical: 14 }} />
              ) : hasMore && results.length > 0 ? (
                <Text style={styles.footerHint}>Scroll for more…</Text>
              ) : null
            }
            ListEmptyComponent={
              !searching ? (
                <View style={styles.emptyState}>
                  <Ionicons
                    name={query.trim() ? "person-outline" : "people-outline"}
                    size={48}
                    color={palette.gray300}
                  />
                  <Text style={styles.emptyText}>
                    {query.trim()
                      ? `No students found for "${query}"`
                      : "No registered students yet"}
                  </Text>
                </View>
              ) : null
            }
          />
        </View>
      )}

      {/* Requests Tab */}
      {activeTab === "requests" && (
        <View style={styles.flex}>
          {reqLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={palette.primary600} />
            </View>
          ) : (
            <FlatList
              data={requests}
              keyExtractor={(item) => item.request_id}
              renderItem={({ item }) => (
                <RequestRow
                  request={item}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  loading={actionLoading[item.request_id] ?? false}
                />
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => { setRefreshing(true); loadRequests(true); }}
                  tintColor={palette.primary600}
                  colors={[palette.primary600]}
                />
              }
              ListHeaderComponent={
                requests.length > 0 ? (
                  <Text style={styles.sectionHeader}>
                    Friend Requests ({requests.length})
                  </Text>
                ) : null
              }
              ListFooterComponent={
                sentRequests.length > 0 ? (
                  <View>
                    <Text style={styles.sectionHeader}>
                      Sent Requests ({sentRequests.length})
                    </Text>
                    {sentRequests.map((r) => (
                      <RequestRow
                        key={r.request_id}
                        request={r}
                        onAccept={() => {}}
                        onReject={handleCancelSent}
                        loading={actionLoading[r.request_id] ?? false}
                      />
                    ))}
                  </View>
                ) : null
              }
              ListEmptyComponent={
                sentRequests.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="people-outline" size={48} color={palette.gray300} />
                    <Text style={styles.emptyText}>No pending friend requests</Text>
                  </View>
                ) : null
              }
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: "#fff" },
  flex:    { flex: 1 },
  centered:{ flex: 1, alignItems: "center", justifyContent: "center" },

  // Header
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.lg - 2, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  closeBtn:     { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle:  { ...typography.h4, color: palette.gray900, fontWeight: "800" },

  // Tabs
  tabBar:         { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.gray200 },
  tab:            { flex: 1, paddingVertical: spacing.lg - 2, alignItems: "center", minHeight: 44 },
  tabActive:      { borderBottomWidth: 2, borderBottomColor: palette.primary600 },
  tabLabel:       { fontSize: 14, fontWeight: "600", color: palette.gray400 },
  tabLabelActive: { color: palette.primary600 },
  tabLabelRow:    { flexDirection: "row", alignItems: "center", gap: spacing.sm - 2 },
  tabBadge:       { backgroundColor: palette.danger500, borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText:   { color: "#fff", fontSize: 11, fontWeight: "700" },

  // Search row
  searchRow:   { flexDirection: "row", alignItems: "center", backgroundColor: palette.gray100, margin: spacing.md, borderRadius: radius.lg, paddingLeft: spacing.md },
  searchIcon:  { marginRight: spacing.sm - 2 },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: 15, color: palette.gray900 },

  // Student row
  studentRow:       { flexDirection: "row", flexWrap: "wrap", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 44 },
  studentAvatar:    { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", marginRight: spacing.md, ...cardShadow },
  studentAvatarText:{ color: "#fff", fontSize: 15, fontWeight: "700" },
  studentInfo:      { flex: 1, minWidth: 80, marginRight: spacing.sm },
  studentName:      { ...typography.bodyMedium, color: palette.gray900, fontWeight: "600" },
  studentMeta:      { fontSize: 12, color: palette.gray500, marginTop: 2 },
  actionBtn:        { borderRadius: 20, paddingVertical: spacing.sm - 1, paddingHorizontal: spacing.md + 2, minWidth: 80, minHeight: 36, alignItems: "center", justifyContent: "center" },
  actionBtnText:    { fontSize: 13, fontWeight: "700" },

  // Request row
  requestRow:     { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 44 },
  requestActions: { flexDirection: "row", gap: spacing.sm },
  acceptBtn:      { borderRadius: 20, paddingVertical: spacing.sm - 1, paddingHorizontal: spacing.md + 2, minHeight: 36, alignItems: "center", justifyContent: "center" },
  acceptBtnText:  { color: "#fff", fontSize: 13, fontWeight: "700" },
  rejectBtn:      { backgroundColor: palette.gray100, borderRadius: 20, paddingVertical: spacing.sm - 1, paddingHorizontal: spacing.md + 2, minHeight: 36, alignItems: "center", justifyContent: "center" },
  rejectBtnText:  { color: palette.danger600, fontSize: 13, fontWeight: "700" },

  separator:  { height: 1, backgroundColor: palette.gray50, marginLeft: 74 },

  // Empty state
  emptyState: { alignItems: "center", paddingTop: 60 },
  sectionHeader: { ...typography.caption, color: palette.gray400, paddingHorizontal: spacing.lg, paddingTop: spacing.lg - 2, paddingBottom: spacing.sm - 2 },
  emptyText:  { fontSize: 14, color: palette.gray400, marginTop: spacing.md, textAlign: "center", paddingHorizontal: spacing["2xl"] },
  countLine:  { ...typography.caption, color: palette.gray400, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontWeight: "700" },
  footerHint: { fontSize: 11, color: palette.gray300, textAlign: "center", marginVertical: spacing.md },
});
