import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { messageApi } from "@/api/message";
import { errorDetail } from "@/api/errorDetail";
import { useLinkedParent } from "@/hooks/useLinkedParent";
import { palette, radius, spacing } from "@/theme/colors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DirectMessage {
  id:            string;
  sender_id:     string;
  recipient_id:  string;
  content:       string;
  is_read:       boolean;
  created_at:    string;
  isOptimistic?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const POLL_INTERVAL_MS = 12_000;

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn }: { msg: DirectMessage; isOwn: boolean }) {
  return (
    <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <Text style={isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther}>{msg.content}</Text>
        <Text style={[styles.bubbleTime, isOwn ? styles.bubbleTimeOwn : styles.bubbleTimeOther]}>
          {formatTime(msg.created_at)}{msg.isOptimistic ? " · Sending…" : ""}
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
// Mirrors ParentMessagesScreen.tsx (student side of the same `messages`
// table / `/v1/users/messages/*` thread) — the student's counterpart was
// previously missing entirely, so a parent's DM had no screen that could
// ever display it (the student's "Chat" tab only shows the unrelated
// friend/group chat system, chatApi's chat_rooms).

export default function StudentMessagesScreen({ onBack }: { onBack?: () => void } = {}) {
  const navigation = useNavigation<any>();
  const goBack = onBack ?? (() => navigation.goBack());
  const listRef = useRef<FlatList<DirectMessage>>(null);

  const {
    studentId, parents, parent, parentId, parentName, hasMultipleParents,
    isLoading: parentsLoading,
  } = useLinkedParent();

  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<DirectMessage[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedParentId && parentId) setSelectedParentId(parentId);
  }, [parentId, selectedParentId]);

  const activeParentId = selectedParentId ?? parentId;
  const activeLink = parents.find((p) => p.parent_user_id === activeParentId);
  const activeParentName = activeLink?.parent_name ?? parentName;
  const activeRelationship = activeLink?.relationship
    ? activeLink.relationship.charAt(0).toUpperCase() + activeLink.relationship.slice(1).toLowerCase()
    : "Parent";

  const threadQueryKey = ["student-message-thread", studentId, activeParentId];

  const {
    data: serverMessages = [],
    isLoading,
    isError,
    error: threadError,
    refetch,
  } = useQuery({
    queryKey: threadQueryKey,
    queryFn: () => messageApi.getThread(activeParentId as string, studentId).then((r) => r.data ?? []),
    enabled: !!studentId && !!activeParentId,
    staleTime: 5_000,
    refetchInterval: POLL_INTERVAL_MS,
  });

  useEffect(() => {
    if (optimisticMessages.length === 0) return;
    setOptimisticMessages((prev) =>
      prev.filter(
        (opt) => !serverMessages.some((m: DirectMessage) => m.content === opt.content && m.sender_id === opt.sender_id && !m.isOptimistic)
      )
    );
  }, [serverMessages]);

  const messages = useMemo<DirectMessage[]>(() => {
    return [...serverMessages, ...optimisticMessages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [serverMessages, optimisticMessages]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending || !activeParentId || !studentId) return;
    setInputText("");
    setSending(true);

    const optimistic: DirectMessage = {
      id: `opt_${Date.now()}`,
      sender_id: studentId,
      recipient_id: activeParentId,
      content: text,
      is_read: false,
      created_at: new Date().toISOString(),
      isOptimistic: true,
    };
    setOptimisticMessages((prev) => [...prev, optimistic]);

    try {
      await messageApi.send(activeParentId, studentId, text);
      await refetch();
    } catch (err: any) {
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInputText(text);
      Toast.show({
        type: "error",
        text1: "Send failed",
        text2: errorDetail(err, "Could not send message. Please try again."),
      });
    } finally {
      setSending(false);
    }
  }, [inputText, sending, activeParentId, studentId, refetch]);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderContent = () => {
    if (parentsLoading) {
      return (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={palette.primary600} />
        </View>
      );
    }

    if (!activeParentId) {
      return (
        <View style={styles.centeredState}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="link-outline" size={40} color={palette.gray400} />
          </View>
          <Text style={styles.emptyTitle}>No Parent Linked</Text>
          <Text style={styles.emptyBody}>
            Once a parent links your account and you approve the request, you can message them here.
          </Text>
        </View>
      );
    }

    if (isLoading) {
      return (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={palette.primary600} />
          <Text style={styles.loadingTxt}>Loading messages...</Text>
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.centeredState}>
          <Ionicons name="alert-circle-outline" size={40} color={palette.danger500} />
          <Text style={styles.errorTxt}>{errorDetail(threadError, "Failed to load messages.")}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (messages.length === 0) {
      return (
        <View style={styles.centeredState}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="chatbubble-ellipses-outline" size={40} color={palette.gray400} />
          </View>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptyBody}>Say hello to {activeParentName}!</Text>
        </View>
      );
    }

    return (
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble msg={item} isOwn={item.sender_id === studentId} />
        )}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{initials(activeParentName)}</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>{activeParentName}</Text>
            <Text style={styles.headerSubtitle}>{activeRelationship}</Text>
          </View>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {hasMultipleParents && (
        <View style={styles.parentPickerRow}>
          {parents.filter((p) => p.is_approved).map((p) => {
            const active = p.parent_user_id === activeParentId;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => setSelectedParentId(p.parent_user_id)}
                style={[styles.parentChip, active && styles.parentChipActive]}
              >
                <Text style={[styles.parentChipTxt, active && styles.parentChipTxtActive]}>
                  {p.parent_name ?? "Parent"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {renderContent()}

        {activeParentId && (
          <View style={styles.inputBar}>
            <TextInput
              style={[styles.input, { maxHeight: 96 }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder={`Message ${activeParentName}...`}
              placeholderTextColor={palette.gray400}
              multiline
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
              activeOpacity={0.8}
            >
              {(!inputText.trim() || sending) ? (
                <View style={[styles.sendBtn, styles.sendBtnDisabled]}>
                  {sending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="send" size={18} color="#fff" />
                  }
                </View>
              ) : (
                <View style={[styles.sendBtn, styles.sendBtnActive]}>
                  <Ionicons name="send" size={18} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },
  flex: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.primary600,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#fff" },
  headerSubtitle: { fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 1 },

  parentPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: palette.gray50 },
  parentChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, backgroundColor: palette.gray100 },
  parentChipActive: { backgroundColor: palette.primary50 },
  parentChipTxt: { fontSize: 12, fontWeight: "700", color: palette.gray500 },
  parentChipTxtActive: { color: palette.primary600 },

  messageList: { paddingHorizontal: 14, paddingVertical: 12, flexGrow: 1, justifyContent: "flex-end" },

  bubbleRow: { flexDirection: "row", marginBottom: 8 },
  bubbleRowOwn: { justifyContent: "flex-end" },
  bubbleRowOther: { justifyContent: "flex-start" },

  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleOwn: { backgroundColor: palette.primary600, borderBottomRightRadius: 4, elevation: 1 },
  bubbleOther: { backgroundColor: "#fff", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: palette.gray200, elevation: 1 },
  bubbleTextOwn: { color: "#fff", fontSize: 15, lineHeight: 21 },
  bubbleTextOther: { color: palette.gray900, fontSize: 15, lineHeight: 21 },
  bubbleTime: { fontSize: 11, marginTop: 4, textAlign: "right" },
  bubbleTimeOwn: { color: "rgba(255,255,255,0.7)" },
  bubbleTimeOther: { color: palette.gray400 },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: palette.gray100,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: palette.gray100,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    fontSize: 15,
    color: palette.gray900,
    minHeight: 40,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: palette.primary600,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  sendBtnActive: { backgroundColor: palette.primary600 },
  sendBtnDisabled: { backgroundColor: palette.gray300, elevation: 0, shadowOpacity: 0 },

  centeredState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: palette.gray700, textAlign: "center" },
  emptyBody: { fontSize: 13, color: palette.gray400, textAlign: "center", lineHeight: 19 },
  loadingTxt: { fontSize: 14, color: palette.gray500, marginTop: 8 },
  errorTxt: { fontSize: 14, color: palette.danger500, textAlign: "center", lineHeight: 20 },
  retryBtn: {
    marginTop: 4,
    backgroundColor: palette.primary50,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  retryBtnTxt: { fontSize: 13, fontWeight: "700", color: palette.primary600 },
});
