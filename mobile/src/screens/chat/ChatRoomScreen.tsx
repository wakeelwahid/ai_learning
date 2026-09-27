import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, KeyboardAvoidingView,
  Platform, Animated, Modal, ActionSheetIOS, Alert, Clipboard,
  ActivityIndicator, Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useNavigation } from "@react-navigation/native";
import { chatApi, ChatMessage, ChatRoom, Reaction } from "@/api/chat";
import UserAvatar from "@/components/UserAvatar";
import { useChatWebSocket } from "@/hooks/useChatWebSocket";
import { palette, radius, spacing, typography, cardShadow, accentSolid } from "@/theme/colors";
import FriendActivityModal from "@/components/FriendActivityModal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Distinct per-sender identity colors for avatars/names — a deliberately
// varied palette (NOT the single-accent brand color), same purpose as a
// GitHub/Slack "assign each user a color" scheme. Kept as a dedicated list
// rather than reusing semantic/brand tokens since it needs 8 visually
// distinct hues for hashing, not a single accent.
const AVATAR_COLORS = [
  palette.primary600, palette.purple600, "#0891b2", palette.success600,
  palette.warning600, palette.danger600, "#db2777", palette.primary700,
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

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate();
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: -6, duration: 250, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0,  duration: 250, useNativeDriver: true }),
          Animated.delay(500),
        ])
      ).start();

    animate(dot1, 0);
    animate(dot2, 150);
    animate(dot3, 300);
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingWrap}>
      <View style={styles.typingBubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[styles.typingDot, { transform: [{ translateY: dot }] }]}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Status Icons ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ChatMessage["status"] }) {
  // WhatsApp-style ticks on the light-green own bubble:
  // gray ✓ sent, gray ✓✓ delivered, green ✓✓ seen.
  if (status === "sent") {
    return <Ionicons name="checkmark" size={13} color={palette.gray400} />;
  }
  if (status === "delivered") {
    return <Ionicons name="checkmark-done" size={13} color={palette.gray400} />;
  }
  return <Ionicons name="checkmark-done" size={13} color={palette.success600} />;
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

interface BubbleProps {
  msg:        ChatMessage;
  isOwn:      boolean;
  isGroup:    boolean;
  onLongPress: (msg: ChatMessage) => void;
  onReactionPress: (msg: ChatMessage, emoji: string) => void;
}

function MessageBubble({ msg, isOwn, isGroup, onLongPress, onReactionPress }: BubbleProps) {
  const color = avatarColor(msg.sender_name);

  return (
    <Pressable
      onLongPress={() => onLongPress(msg)}
      style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}
    >
      {/* Other sender avatar for group chats — uploaded photo or initials */}
      {!isOwn && isGroup && (
        <UserAvatar userId={msg.sender_id} name={msg.sender_name} size={28} style={{ marginRight: 6, alignSelf: "flex-end" }} />
      )}

      <View style={[styles.bubbleOuter, isOwn ? styles.bubbleOuterOwn : { maxWidth: "78%" }]}>
        {/* Sender name for group (other messages) */}
        {!isOwn && isGroup && (
          <Text style={[styles.senderName, { color }]}>{msg.sender_name}</Text>
        )}

        {/* Reply preview */}
        {msg.reply_to_preview && (
          <View style={[styles.replyPreview, isOwn ? styles.replyPreviewOwn : styles.replyPreviewOther]}>
            <View style={[styles.replyPreviewBar, { backgroundColor: isOwn ? palette.success700 : palette.success500 }]} />
            <View style={styles.replyContent}>
              <Text style={[styles.replySender, isOwn ? styles.replyTextOwn : styles.replyTextOther]}>
                {msg.reply_to_preview.sender_name}
              </Text>
              <Text
                style={[styles.replyText, isOwn ? styles.replyTextOwn : styles.replyTextOther]}
                numberOfLines={1}
              >
                {msg.reply_to_preview.content}
              </Text>
            </View>
          </View>
        )}

        {/* Bubble */}
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther}>
            {msg.content}
          </Text>
          <View style={styles.bubbleMeta}>
            <Text style={[styles.bubbleTime, isOwn ? styles.bubbleTimeOwn : styles.bubbleTimeOther]}>
              {formatMessageTime(msg.created_at)}
            </Text>
            {isOwn && <StatusIcon status={msg.status} />}
          </View>
        </View>

        {/* Reactions */}
        {msg.reactions && msg.reactions.length > 0 && (
          <View style={[styles.reactionsRow, isOwn ? styles.reactionsRowOwn : styles.reactionsRowOther]}>
            {msg.reactions.map((r: Reaction) => (
              <TouchableOpacity
                key={r.emoji}
                style={styles.reactionChip}
                onPress={() => onReactionPress(msg, r.emoji)}
                activeOpacity={0.7}
              >
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                {r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── Date Separator ───────────────────────────────────────────────────────────

function DateSeparator({ date }: { date: string }) {
  return (
    <View style={styles.dateSepRow}>
      <View style={styles.dateSepLine} />
      <Text style={styles.dateSepText}>{formatDateLabel(date)}</Text>
      <View style={styles.dateSepLine} />
    </View>
  );
}

// ─── Member List Modal ────────────────────────────────────────────────────────

function MemberListModal({
  visible, room, onClose, onManage,
}: { visible: boolean; room: ChatRoom; onClose: () => void; onManage: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Members ({room.members.length})</Text>
          <TouchableOpacity onPress={onClose} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="close" size={24} color={palette.gray700} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.manageRow} onPress={onManage} activeOpacity={0.7}>
          <View style={styles.manageIconWrap}>
            <Ionicons name="settings-outline" size={18} color="#fff" />
          </View>
          <Text style={styles.manageRowText}>Manage Group</Text>
          <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
        </TouchableOpacity>
        {room.members.map((m) => (
          <View key={m.user_id} style={styles.memberRow}>
            <View style={[styles.memberAvatar, { backgroundColor: avatarColor(m.full_name) }]}>
              <Text style={styles.memberAvatarText}>{initials(m.full_name)}</Text>
            </View>
            <Text style={styles.memberName}>{m.full_name}</Text>
            {m.is_online && (
              <View style={styles.memberOnline}>
                <Text style={styles.memberOnlineText}>Online</Text>
              </View>
            )}
          </View>
        ))}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface Props {
  room:   ChatRoom;
  myId:   string;
  onBack: () => void;
}

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export default function ChatRoomScreen({ room, myId, onBack }: Props) {
  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [hasMore,        setHasMore]        = useState(true);
  const [inputText,      setInputText]      = useState("");
  const [replyTo,        setReplyTo]        = useState<ChatMessage | null>(null);
  const [typingUsers,    setTypingUsers]    = useState<Set<string>>(new Set());
  const [showMembers,    setShowMembers]    = useState(false);
  const [showEmojiFor,   setShowEmojiFor]   = useState<ChatMessage | null>(null);
  const [sending,        setSending]        = useState(false);

  const listRef      = useRef<FlatList>(null);
  const typingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigation = useNavigation<any>();
  const { send, connected, lastMessage } = useChatWebSocket();

  const isGroup   = room.is_group;
  const otherUser = !isGroup ? room.members.find((m) => m.user_id !== myId) : null;
  const headerName = isGroup
    ? room.room_name
    : (otherUser?.full_name ?? room.room_name);
  const headerOnline = !isGroup && (otherUser?.is_online ?? false);
  // Tapping the friend's name/avatar in a 1:1 chat opens their recent
  // activity timeline (quiz scores, battle wins, level-ups, ...).
  const [showFriendActivity, setShowFriendActivity] = useState(false);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await chatApi.getMessages(room.room_id, myId);
        if (!cancelled) {
          setMessages(res.data ?? []);
          setHasMore((res.data ?? []).length >= 40);
        }
        chatApi.markRead(room.room_id, myId).catch(() => {});
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [room.room_id]);

  // ── WebSocket events ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lastMessage) return;
    const { type, payload } = lastMessage as { type: string; payload: Record<string, unknown> };

    if (type === "new_message") {
      const msg = payload as unknown as ChatMessage;
      if (msg.room_id !== room.room_id) return;
      setMessages((prev) => {
        if (prev.find((m) => m.message_id === msg.message_id)) return prev;
        if (msg.sender_id === myId) {
          // Own WS echo — it can beat the REST response; swap it into the
          // optimistic bubble instead of appending a duplicate.
          const optIdx = prev.findIndex(
            (m) => m.message_id.startsWith("opt_") && m.content === msg.content
          );
          if (optIdx >= 0) {
            const next = [...prev];
            next[optIdx] = msg;
            return next;
          }
        }
        return [msg, ...prev];
      });
      if (msg.sender_id !== myId) {
        // Viewing the room = instantly seen → sender's ticks turn green live
        chatApi.markRead(room.room_id, myId).catch(() => {});
      }
    } else if (type === "typing") {
      const p = payload as { room_id: string; user_id: string; user_name: string };
      if (p.room_id !== room.room_id || p.user_id === myId) return;
      setTypingUsers((prev) => new Set([...prev, p.user_id]));
    } else if (type === "typing_stop") {
      const p = payload as { room_id: string; user_id: string };
      if (p.room_id !== room.room_id) return;
      setTypingUsers((prev) => { const next = new Set(prev); next.delete(p.user_id); return next; });
    } else if (type === "messages_read") {
      // WhatsApp "seen" semantics: the reader has seen everything they were
      // sent in this room — flip ALL of my messages to read (green ticks).
      const p = payload as { room_id: string; read_by: string };
      if (p.room_id !== room.room_id || p.read_by === myId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.sender_id === myId && m.status !== "read" ? { ...m, status: "read" } : m
        )
      );
    } else if (type === "reaction_update") {
      // No room_id on this event — message ids are globally unique, so a
      // direct id match is safe.
      const p = payload as { message_id: string; reactions: Reaction[] };
      setMessages((prev) =>
        prev.map((m) => m.message_id === p.message_id ? { ...m, reactions: p.reactions } : m)
      );
    }
  }, [lastMessage, room.room_id, myId]);

  // ── Load more (scroll to top → inverted means scroll to bottom) ──────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[messages.length - 1].created_at;
    try {
      const res = await chatApi.getMessages(room.room_id, myId, oldest);
      const older = res.data ?? [];
      setMessages((prev) => [...prev, ...older]);
      setHasMore(older.length >= 40);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, messages, room.room_id]);

  // ── Typing notification ──────────────────────────────────────────────────────
  const handleInputChange = useCallback((text: string) => {
    setInputText(text);
    if (connected) {
      send({ type: "typing", room_id: room.room_id });
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        send({ type: "typing_stop", room_id: room.room_id });
      }, 2000);
    }
  }, [connected, send, room.room_id]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setInputText("");
    setReplyTo(null);
    setSending(true);

    // Optimistic message
    const optimistic: ChatMessage = {
      message_id: `opt_${Date.now()}`,
      room_id:    room.room_id,
      sender_id:  myId,
      sender_name: "You",
      content:    text,
      created_at: new Date().toISOString(),
      status:     "sent",
      reply_to_id: replyTo?.message_id ?? null,
      reply_to_preview: replyTo
        ? { message_id: replyTo.message_id, content: replyTo.content, sender_name: replyTo.sender_name }
        : null,
      reactions: [],
    };
    setMessages((prev) => [optimistic, ...prev]);

    try {
      const res = await chatApi.sendMessage(room.room_id, myId, text, replyTo?.message_id);
      const real = res.data;
      setMessages((prev) =>
        prev.map((m) => m.message_id === optimistic.message_id ? real : m)
      );
    } catch (err: any) {
      const detail: string | undefined = err?.response?.data?.detail;
      setMessages((prev) => prev.filter((m) => m.message_id !== optimistic.message_id));
      Toast.show({ type: "error", text1: "Send failed", text2: detail ?? "Could not send message. Please try again." });
    } finally {
      setSending(false);
    }
  }, [inputText, sending, room.room_id, myId, replyTo]);

  // ── Long press action sheet ───────────────────────────────────────────────────
  // Cross-platform message action menu — Alert/ActionSheetIOS sheets are
  // silent no-ops on react-native-web, which made Reply/React/Copy
  // unreachable there.
  const [actionMsg, setActionMsg] = useState<ChatMessage | null>(null);
  const handleLongPress = useCallback((msg: ChatMessage) => setActionMsg(msg), []);

  const handleReactionPress = useCallback(async (msg: ChatMessage, emoji: string) => {
    try {
      await chatApi.reactToMessage(msg.message_id, myId, emoji);
    } catch {
      // silent — server will push reaction_update via WS
    }
  }, [room.room_id]);

  const handleEmojiReact = useCallback((emoji: string) => {
    if (showEmojiFor) {
      handleReactionPress(showEmojiFor, emoji);
      setShowEmojiFor(null);
    }
  }, [showEmojiFor, handleReactionPress]);

  // ── Render items with date separators ────────────────────────────────────────
  type ListItem = { type: "message"; data: ChatMessage } | { type: "date"; date: string; id: string };

  const listItems = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    for (let i = 0; i < messages.length; i++) {
      items.push({ type: "message", data: messages[i] });
      // Insert date separator when the next message is from a different day
      const next = messages[i + 1];
      if (!next || !isSameDay(messages[i].created_at, next.created_at)) {
        items.push({ type: "date", date: messages[i].created_at, id: `date_${messages[i].message_id}` });
      }
    }
    return items;
  }, [messages]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === "date") return <DateSeparator date={item.date} />;
    const msg   = item.data;
    const isOwn = msg.sender_id === myId;
    return (
      <MessageBubble
        msg={msg}
        isOwn={isOwn}
        isGroup={isGroup}
        onLongPress={handleLongPress}
        onReactionPress={handleReactionPress}
      />
    );
  }, [myId, isGroup, handleLongPress, handleReactionPress]);

  const keyExtractor = useCallback((item: ListItem) => {
    return item.type === "message" ? item.data.message_id : item.id;
  }, []);

  // ── UI ───────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={palette.gray700} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerIdentity}
          activeOpacity={0.7}
          disabled={isGroup || !otherUser}
          onPress={() => setShowFriendActivity(true)}
        >
          <View style={styles.headerAvatarWrap}>
            <View style={[styles.headerAvatar, { backgroundColor: avatarColor(headerName) }]}>
              <Text style={styles.headerAvatarText}>{initials(headerName)}</Text>
            </View>
            {headerOnline && <View style={styles.headerOnlineDot} />}
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName} numberOfLines={1}>{headerName}</Text>
              {!isGroup && !!otherUser && (
                <Ionicons name="chevron-forward" size={13} color={palette.gray400} />
              )}
            </View>
            {headerOnline ? (
              <Text style={styles.headerOnlineLabel}>Online</Text>
            ) : !isGroup && !!otherUser ? (
              <Text style={styles.headerTapHint}>Tap to view activity</Text>
            ) : null}
            {isGroup && <Text style={styles.headerOnlineLabel}>{room.members.length} members</Text>}
          </View>
        </TouchableOpacity>
        {isGroup && (
          <TouchableOpacity onPress={() => setShowMembers(true)} style={styles.infoBtn} activeOpacity={0.7}>
            <Ionicons name="information-circle-outline" size={24} color={palette.primary600} />
          </TouchableOpacity>
        )}
        {isGroup && (
          <TouchableOpacity
            onPress={() => navigation.navigate("GroupSettings", { roomId: room.room_id })}
            style={styles.infoBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={22} color={palette.primary600} />
          </TouchableOpacity>
        )}
        {!connected && (
          <View style={styles.offlineDot}>
            <Ionicons name="cloud-offline-outline" size={16} color={palette.danger500} />
          </View>
        )}
      </View>

      {/* Message List */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={palette.primary600} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={listItems}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            inverted
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              loadingMore ? <ActivityIndicator size="small" color={palette.gray500} style={styles.footerLoader} /> : null
            }
            ListHeaderComponent={
              typingUsers.size > 0 ? <TypingIndicator /> : null
            }
          />
        )}

        {/* Reply Preview Bar */}
        {replyTo && (
          <View style={styles.replyBar}>
            <View style={styles.replyBarAccent} />
            <View style={styles.replyBarContent}>
              <Text style={styles.replyBarName}>{replyTo.sender_name}</Text>
              <Text style={styles.replyBarText} numberOfLines={1}>{replyTo.content}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <Ionicons name="close" size={20} color={palette.gray500} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={handleInputChange}
            placeholder="Message..."
            placeholderTextColor={palette.gray400}
            multiline
            returnKeyType="default"
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            activeOpacity={0.8}
            style={[
              styles.sendBtnTouchable,
              { backgroundColor: (!inputText.trim() || sending) ? palette.gray300 : accentSolid.emerald },
            ]}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={18} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Member list modal */}
      <MemberListModal
        visible={showMembers}
        room={room}
        onClose={() => setShowMembers(false)}
        onManage={() => {
          setShowMembers(false);
          navigation.navigate("GroupSettings", { roomId: room.room_id });
        }}
      />

      {/* Friend activity timeline — 1:1 rooms only, opened from the header */}
      {!isGroup && !!otherUser && (
        <FriendActivityModal
          visible={showFriendActivity}
          friendId={otherUser.user_id}
          friendName={headerName}
          onClose={() => setShowFriendActivity(false)}
        />
      )}

      {/* Message action menu — cross-platform Modal */}
      <Modal
        visible={actionMsg !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMsg(null)}
      >
        <Pressable style={styles.emojiOverlay} onPress={() => setActionMsg(null)}>
          <View style={styles.actionSheet}>
            <Text style={styles.actionSheetPreview} numberOfLines={2}>
              {actionMsg?.content}
            </Text>
            {([
              { icon: "arrow-undo-outline", label: "Reply", run: () => actionMsg && setReplyTo(actionMsg) },
              { icon: "happy-outline",      label: "React", run: () => actionMsg && setShowEmojiFor(actionMsg) },
              { icon: "copy-outline",       label: "Copy",  run: () => actionMsg && Clipboard.setString(actionMsg.content) },
            ] as const).map((a) => (
              <TouchableOpacity
                key={a.label}
                style={styles.actionSheetItem}
                activeOpacity={0.8}
                onPress={() => { a.run(); setActionMsg(null); }}
              >
                <Ionicons name={a.icon as any} size={18} color={palette.primary600} />
                <Text style={styles.actionSheetItemTxt}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Emoji picker */}
      <Modal
        visible={showEmojiFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEmojiFor(null)}
      >
        <Pressable style={styles.emojiOverlay} onPress={() => setShowEmojiFor(null)}>
          <View style={styles.emojiSheet}>
            <Text style={styles.emojiTitle}>React</Text>
            <View style={styles.emojiRow}>
              {EMOJI_OPTIONS.map((emoji) => (
                <TouchableOpacity key={emoji} onPress={() => handleEmojiReact(emoji)} style={styles.emojiBtn}>
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // WhatsApp-style chat wallpaper — deliberate one-off decorative tint for
  // this screen's chat background, not part of the brand/semantic palette.
  safe:    { flex: 1, backgroundColor: "#EFEAE2" },
  flex:    { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Header
  header:           { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: palette.gray100, ...cardShadow },
  backBtn:          { marginRight: spacing.sm, padding: spacing.xs, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  headerAvatarWrap: { position: "relative", marginRight: spacing.sm + 2 },
  headerAvatar:     { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerAvatarText: { color: "#fff", ...typography.bodyMedium, fontWeight: "700" },
  headerOnlineDot:  { position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: palette.success500, borderWidth: 2, borderColor: "#fff" },
  headerIdentity:   { flex: 1, flexDirection: "row", alignItems: "center", minHeight: 44 },
  headerInfo:       { flex: 1 },
  headerNameRow:    { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  headerName:       { ...typography.bodyMedium, fontWeight: "700", color: palette.gray900, flexShrink: 1 },
  headerOnlineLabel:{ ...typography.caption, textTransform: "none", letterSpacing: 0, color: palette.success600, fontWeight: "500" },
  headerTapHint:    { ...typography.caption, textTransform: "none", letterSpacing: 0, color: palette.gray400, fontWeight: "500" },
  infoBtn:          { padding: spacing.xs, marginLeft: spacing.sm, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  offlineDot:       { padding: spacing.xs, marginLeft: spacing.xs },

  // Messages
  messageList: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },

  // Typing
  typingWrap:    { paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  typingBubble:  { flexDirection: "row", backgroundColor: "#fff", borderRadius: radius.lg, borderWidth: 1, borderColor: palette.gray200, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, alignSelf: "flex-start", gap: spacing.xs },
  typingDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.gray400 },

  // Bubble row
  bubbleRow:      { flexDirection: "row", marginBottom: spacing.sm - 2, alignItems: "flex-end" },
  bubbleRowOwn:   { justifyContent: "flex-end" },
  bubbleRowOther: { justifyContent: "flex-start" },
  smallAvatar:    { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: spacing.xs + 2, marginBottom: spacing.xs },
  smallAvatarText:{ color: "#fff", fontSize: 10, fontWeight: "700" },
  bubbleOuter:    { maxWidth: "78%" },
  bubbleOuterOwn: { maxWidth: "78%", alignItems: "flex-end" },
  senderName:     { ...typography.caption, textTransform: "none", letterSpacing: 0, marginBottom: 2, marginLeft: 2 },

  // Reply preview in bubble — reply accent uses success green (WhatsApp
  // reply-quote convention), not the primary brand color.
  replyPreview:      { flexDirection: "row", borderRadius: radius.sm, marginBottom: 3, overflow: "hidden" },
  replyPreviewOwn:   { backgroundColor: "rgba(0,0,0,0.06)" },
  replyPreviewOther: { backgroundColor: palette.gray100 },
  replyPreviewBar:   { width: 3, backgroundColor: palette.success500, borderRadius: 2 },
  replyContent:      { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  replySender:       { ...typography.caption, textTransform: "none", letterSpacing: 0 },
  replyText:         { fontSize: 12 },
  replyTextOwn:  { color: "#3B6E47" },
  replyTextOther:    { color: palette.gray700 },

  // Bubbles — WhatsApp-specific hues (own = light green, other = white)
  // kept as deliberate one-offs; this screen's identity is a WhatsApp-style
  // chat, not the brand surface.
  bubble:         { borderRadius: radius.lg, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 2 },
  bubbleOwn:      { backgroundColor: "#D9FDD3", borderBottomRightRadius: 4, elevation: 1 },
  bubbleOther:    { backgroundColor: "#fff", borderBottomLeftRadius: 4, elevation: 1 },
  bubbleTextOwn:  { color: "#111B21", fontSize: 15, lineHeight: 21 },
  bubbleTextOther:{ color: "#111B21", fontSize: 15, lineHeight: 21 },
  bubbleMeta:     { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: spacing.xs, gap: 3 },
  bubbleTime:     { fontSize: 11 },
  bubbleTimeOwn:  { color: "#667781" },
  bubbleTimeOther:{ color: "#667781" },

  // Reactions
  reactionsRow:    { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 3 },
  reactionsRowOwn: { justifyContent: "flex-end" },
  reactionsRowOther: { justifyContent: "flex-start" },
  reactionChip:    { flexDirection: "row", alignItems: "center", backgroundColor: palette.gray100, borderRadius: radius.md, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: palette.gray200 },
  reactionEmoji:   { fontSize: 14 },
  reactionCount:   { fontSize: 12, color: palette.gray700, marginLeft: 2, fontWeight: "600" },

  // Date separator
  dateSepRow:  { flexDirection: "row", alignItems: "center", marginVertical: spacing.md, paddingHorizontal: spacing.sm },
  dateSepLine: { flex: 1, height: 1, backgroundColor: palette.gray200 },
  dateSepText: { ...typography.caption, textTransform: "none", letterSpacing: 0, color: palette.gray400, marginHorizontal: spacing.sm + 2, fontWeight: "500" },

  // Reply bar above input
  replyBar:        { flexDirection: "row", alignItems: "center", backgroundColor: palette.gray100, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: palette.gray200 },
  replyBarAccent:  { width: 3, height: "100%", backgroundColor: palette.success500, borderRadius: 2, marginRight: spacing.sm },
  replyBarContent: { flex: 1 },
  replyBarName:    { fontSize: 12, fontWeight: "700", color: palette.success600 },
  replyBarText:    { ...typography.bodySm, color: palette.gray700 },

  // Input bar
  inputBar:    { flexDirection: "row", alignItems: "flex-end", backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: palette.gray100, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, gap: spacing.sm },
  input:       { flex: 1, backgroundColor: palette.gray100, borderRadius: 22, paddingHorizontal: spacing.md + 2, paddingVertical: Platform.OS === "ios" ? spacing.sm + 2 : spacing.sm - 2, fontSize: typography.bodyLg.fontSize, color: palette.gray900, minHeight: 40, maxHeight: 96 },
  // Send action uses a success/emerald accent (a "go" affordance distinct
  // from the primary brand color, matching this screen's WhatsApp-style
  // send button convention) — not part of the removed brand gradient.
  sendBtnTouchable: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", elevation: 2, shadowColor: palette.success700, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },

  // Member modal
  modalHeader:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  modalTitle:      { ...typography.h4, color: palette.gray900 },
  manageRow:       { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.md - 4, borderBottomWidth: 1, borderBottomColor: palette.gray100, backgroundColor: palette.gray50 },
  manageIconWrap:  { width: 32, height: 32, borderRadius: radius.sm + 2, alignItems: "center", justifyContent: "center", marginRight: spacing.md, backgroundColor: palette.primary600 },
  manageRowText:   { flex: 1, ...typography.bodyMedium, color: palette.gray700 },
  memberRow:       { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.md - 4, borderBottomWidth: 1, borderBottomColor: palette.gray50 },
  memberAvatar:    { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  memberAvatarText:{ color: "#fff", ...typography.bodyMedium, fontWeight: "700" },
  memberName:      { flex: 1, ...typography.bodyLg, color: palette.gray900, fontWeight: "500" },
  memberOnline:    { backgroundColor: palette.success100, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  memberOnlineText:{ color: palette.success700, fontSize: 11, fontWeight: "600" },

  // Emoji modal
  actionSheet: { backgroundColor: "#fff", borderTopLeftRadius: radius.lg + 2, borderTopRightRadius: radius.lg + 2, padding: spacing.md, paddingBottom: spacing["2xl"] + 4 },
  actionSheetPreview: { ...typography.caption, textTransform: "none", letterSpacing: 0, color: palette.gray400, marginBottom: spacing.sm + 2, paddingHorizontal: spacing.xs },
  actionSheetItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md - 4, paddingHorizontal: spacing.xs, minHeight: 44 },
  actionSheetItemTxt: { ...typography.bodyLg, color: palette.gray900, fontWeight: "600" },
  emojiOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  emojiSheet:   { backgroundColor: "#fff", borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl },
  emojiTitle:   { ...typography.h4, color: palette.gray700, marginBottom: spacing.md + 2, textAlign: "center" },
  emojiRow:     { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-around" },
  emojiBtn:     { padding: spacing.sm, minWidth: "30%", alignItems: "center", minHeight: 44 },
  emojiText:    { fontSize: 30 },
  footerLoader: { marginVertical: spacing.sm },
});
