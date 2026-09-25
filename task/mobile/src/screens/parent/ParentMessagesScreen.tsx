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
import { useLinkedChild } from "@/hooks/useLinkedChild";
import { PendingApprovalState, PendingBadge } from "@/components/parent/PendingApproval";
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

export default function ParentMessagesScreen() {
  const navigation = useNavigation<any>();
  const listRef = useRef<FlatList<DirectMessage>>(null);

  // Resolve the linked child the correct way: parentId -> getStudents ->
  // selected child (see useLinkedChild).
  const {
    parentId, children, child, childId, childName, hasMultipleChildren, isApproved,
    selectedChildId, selectChild, isLoading: childrenLoading,
  } = useLinkedChild();

  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<DirectMessage[]>([]);

  const threadQueryKey = ["parent-message-thread", parentId, childId];

  const {
    data: serverMessages = [],
    isLoading,
    isError,
    error: threadError,
    refetch,
  } = useQuery({
    queryKey: threadQueryKey,
    queryFn: () => messageApi.getThread(childId as string, parentId).then((r) => r.data ?? []),
    enabled: !!parentId && !!childId && isApproved,
    staleTime: 5_000,
    refetchInterval: POLL_INTERVAL_MS,
  });

  // Drop optimistic messages once the server confirms them (matched by content + sender,
  // since the real record replaces the temp id).
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
    if (!text || sending || !childId || !parentId) return;
    setInputText("");
    setSending(true);

    const optimistic: DirectMessage = {
      id: `opt_${Date.now()}`,
      sender_id: parentId,
      recipient_id: childId,
      content: text,
      is_read: false,
      created_at: new Date().toISOString(),
      isOptimistic: true,
    };
    setOptimisticMessages((prev) => [...prev, optimistic]);

    try {
      await messageApi.send(childId, parentId, text);
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
  }, [inputText, sending, childId, parentId, refetch]);

  // Auto-scroll to bottom when message count changes.
  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

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
            Link a student account first to message your child.
          </Text>
        </View>
      );
    }

    if (child && !isApproved) {
      return <PendingApprovalState child={child} />;
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
          <Text style={styles.emptyBody}>Say hello to {childName}!</Text>
        </View>
      );
    }

    return (
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble msg={item} isOwn={item.sender_id === parentId} />
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

      {/* Header — solid indigo fill (was indigo→violet gradient) */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{initials(childName)}</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>{childName}</Text>
            <Text style={styles.headerSubtitle}>Direct message</Text>
          </View>
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

      {/* Content */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {renderContent()}

        {/* Input Bar */}
        {childId && isApproved && (
          <View style={styles.inputBar}>
            <TextInput
              style={[styles.input, { maxHeight: 96 }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder={`Message ${childName}...`}
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

  // Header — solid indigo, no gradient
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

  // Child picker (only shown for parents with more than one linked child)
  childPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: palette.gray50 },
  childChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, backgroundColor: palette.gray100 },
  childChipActive: { backgroundColor: palette.primary50 },
  childChipTxt: { fontSize: 12, fontWeight: "700", color: palette.gray500 },
  childChipTxtActive: { color: palette.primary600 },

  // Message list
  messageList: { paddingHorizontal: 14, paddingVertical: 12, flexGrow: 1, justifyContent: "flex-end" },

  // Bubble row
  bubbleRow: { flexDirection: "row", marginBottom: 8 },
  bubbleRowOwn: { justifyContent: "flex-end" },
  bubbleRowOther: { justifyContent: "flex-start" },

  // Bubbles
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleOwn: { backgroundColor: palette.primary600, borderBottomRightRadius: 4, elevation: 1 },
  bubbleOther: { backgroundColor: "#fff", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: palette.gray200, elevation: 1 },
  bubbleTextOwn: { color: "#fff", fontSize: 15, lineHeight: 21 },
  bubbleTextOther: { color: palette.gray900, fontSize: 15, lineHeight: 21 },
  bubbleTime: { fontSize: 11, marginTop: 4, textAlign: "right" },
  bubbleTimeOwn: { color: "rgba(255,255,255,0.7)" },
  bubbleTimeOther: { color: palette.gray400 },

  // Input bar
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

  // States
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
