import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, SafeAreaView, StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { aiApi, type ParentChatSource } from "@/api/ai";
import { errorDetail } from "@/api/errorDetail";
import { useLinkedChild } from "@/hooks/useLinkedChild";
import { PendingApprovalState, PendingBadge } from "@/components/parent/PendingApproval";
import EmptyState from "@/components/ui/EmptyState";
import { palette, spacing, radius } from "@/theme/colors";

interface Message { role: "user" | "assistant"; text: string; sources?: ParentChatSource[] }

// What the grounded RAG can actually answer from the child's real records.
const QUICK_QUESTIONS = [
  "Which subject needs the most improvement?",
  "How is my child performing overall?",
  "Has my child been studying regularly?",
  "How is my child doing in quiz battles?",
  "What badges and XP has my child earned?",
  "How many videos and chapters has my child completed?",
  "What career is my child interested in?",
  "What should my child focus on this week?",
];

/** Quiet, collapsed list of the records the answer was grounded in. */
function Sources({ sources }: { sources: ParentChatSource[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.sources}>
      <TouchableOpacity style={s.sourcesToggle} onPress={() => setOpen((o) => !o)}>
        <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={11} color={palette.gray500} />
        <Text style={s.sourcesToggleTxt}>Based on {sources.length} record{sources.length === 1 ? "" : "s"}</Text>
      </TouchableOpacity>
      {open && sources.map((src, i) => (
        <View key={i} style={s.source}>
          <Text style={s.sourceMeta}>{src.domain} · {src.date}</Text>
          <Text style={s.sourceTxt}>{src.text}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ParentAIChatScreen() {
  const navigation = useNavigation<any>();
  const {
    children: students, child, selectedChildId, selectChild, isApproved,
    isLoading: childrenLoading,
  } = useLinkedChild();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);

  // When the AI call fails (network error, timeout, backend down), the
  // previous fallback returned canned text with fabricated numbers (fixed
  // "82% overall", "91% attendance", etc.) that looked identical to a real
  // AI answer — a parent had no way to tell it wasn't their child's actual
  // data. Now it's an honest, clearly-labeled offline notice instead.
  const getFallback = (): string =>
    `Sorry, I couldn't reach the AI assistant right now. Please check your connection and try again — I don't want to guess at ${child?.student_name ?? "your child"}'s real performance data.`;

  const send = async (text?: string) => {
    const userMsg = (text ?? input).trim();
    if (!userMsg || loading || !child || !isApproved) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);
    try {
      const history = messages.map((m) => ({ role: m.role, content: m.text }));
      // Grounded RAG: the backend builds the context from the child's real
      // quiz/battle/study/career records, so we send the raw question. The old
      // hand-built context string only carried name/class/board, which left the
      // LLM inventing performance data.
      const { data } = await aiApi.parentChat(userMsg, child.student_user_id, history);
      setMessages((prev) => [...prev, {
        role: "assistant",
        text: data.answer ?? "No response.",
        sources: data.sources ?? [],
      }]);
    } catch (err: any) {
      const status = err?.response?.status;
      let reply: string;
      if (status === 403) {
        reply = child.is_approved
          ? errorDetail(err, "You don't have access to this child's data yet.")
          : "This child hasn't approved your link yet.";
      } else if (err?.response) {
        reply = errorDetail(err, getFallback());
      } else {
        reply = getFallback();
      }
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } finally {
      setLoading(false);
    }
  };

  const initials = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return "?";
    return trimmed.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[s.header, { backgroundColor: palette.primary600 }]}>
          <Text style={s.title} numberOfLines={1}>AI Chat</Text>
          <Text style={s.subtitle} numberOfLines={2} ellipsizeMode="tail">Ask about your child's learning</Text>
        </View>

        {students.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.selectorRow}
            contentContainerStyle={s.selectorContent}
          >
            {students.map((st, i) => {
              const active = st.student_user_id === selectedChildId;
              const name = st.student_name ?? `Child ${i + 1}`;
              return (
                <TouchableOpacity
                  key={st.id}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => selectChild(st.student_user_id)}
                >
                  <View style={[s.chipAvatar, active && s.chipAvatarActive]}>
                    <Text style={[s.chipAvatarTxt, active && s.chipAvatarTxtActive]}>{initials(name)}</Text>
                  </View>
                  <Text style={[s.chipTxt, active && s.chipTxtActive]} numberOfLines={1}>{name}</Text>
                  {!st.is_approved && <PendingBadge />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {!childrenLoading && !child && (
          <EmptyState
            icon="link-outline"
            title="No Students Linked"
            description="Link your child's account to ask the AI about their learning."
            action={{ label: "Link Student", onPress: () => navigation.navigate("LinkStudent") }}
          />
        )}

        {child && !isApproved && <PendingApprovalState child={child} />}

        {child && isApproved && (
        <>
        <ScrollView style={s.messages} contentContainerStyle={s.messagesContent}>
          {messages.length === 0 && (
            <Text style={s.placeholder}>
              Start a conversation. Ask about study tips, curriculum guidance, or how to support your child.
            </Text>
          )}
          {messages.map((m, i) => (
            <View key={i} style={[s.bubble, m.role === "user" ? s.userBubble : s.aiBubble]}>
              <Text style={m.role === "user" ? s.userText : s.aiText}>{m.text}</Text>
              {!!m.sources?.length && <Sources sources={m.sources} />}
            </View>
          ))}
          {loading && (
            <View style={s.aiBubble}>
              <Text style={s.aiText}>Thinking…</Text>
            </View>
          )}
        </ScrollView>

        {messages.length === 0 && (
          <View style={s.quickRow}>
            {QUICK_QUESTIONS.map((q) => (
              <TouchableOpacity key={q} style={s.quickChip} onPress={() => send(q)}>
                <Ionicons name="sparkles" size={12} color={palette.primary600} />
                <Text style={s.quickChipTxt} numberOfLines={2}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Ask anything…"
            placeholderTextColor={palette.gray400}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send()}
            returnKeyType="send"
          />
          <TouchableOpacity style={s.sendBtn} onPress={() => send()} disabled={loading}>
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: palette.gray50 },
  container:       { flex: 1, backgroundColor: palette.gray50 },

  header:          { paddingTop: spacing.sm, paddingBottom: spacing.lg + 2, paddingHorizontal: spacing.xl },
  title:           { fontSize: 22, fontWeight: "700", color: "#fff" },
  subtitle:        { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: spacing.xs },

  selectorRow:     { flexGrow: 0, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  selectorContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, gap: spacing.sm },
  chip:            { flexDirection: "row", alignItems: "center", gap: spacing.sm - 2, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm - 2, borderRadius: radius.pill, backgroundColor: palette.gray100, minHeight: 44 },
  chipActive:      { backgroundColor: palette.primary600 },
  chipAvatar:      { width: 20, height: 20, borderRadius: 10, backgroundColor: palette.gray200, alignItems: "center", justifyContent: "center" },
  chipAvatarActive:{ backgroundColor: "rgba(255,255,255,0.25)" },
  chipAvatarTxt:   { fontSize: 10, fontWeight: "700", color: palette.gray500 },
  chipAvatarTxtActive: { color: "#fff" },
  chipTxt:         { fontSize: 13, fontWeight: "600", color: palette.gray700, maxWidth: 120 },
  chipTxtActive:   { color: "#fff" },

  messages:        { flex: 1 },
  messagesContent: { padding: spacing.lg, gap: spacing.sm + 2 },
  placeholder:     { color: palette.gray400, fontSize: 14, textAlign: "center", marginTop: spacing["4xl"], lineHeight: 22 },
  bubble:          { maxWidth: "80%", borderRadius: radius.lg, padding: spacing.md, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  userBubble:      { backgroundColor: palette.primary600, alignSelf: "flex-end", borderBottomRightRadius: 4 },
  aiBubble:        { backgroundColor: "#fff", alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  userText:        { color: "#fff", fontSize: 14, lineHeight: 20 },
  aiText:          { color: palette.gray900, fontSize: 14, lineHeight: 20 },

  sources:         { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: palette.gray100, paddingTop: spacing.sm - 2 },
  sourcesToggle:   { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs },
  sourcesToggleTxt:{ fontSize: 11, fontWeight: "600", color: palette.gray500 },
  source:          { marginTop: spacing.sm - 2 },
  sourceMeta:      { fontSize: 10, fontWeight: "600", color: palette.gray400, textTransform: "capitalize" },
  sourceTxt:       { fontSize: 11, color: palette.gray600, lineHeight: 16, marginTop: 1 },

  // "Quick question" chips use the brand indigo at low opacity (previously a
  // violet accent, which the design system drops).
  quickRow:        { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  quickChip:       { flexDirection: "row", alignItems: "center", gap: spacing.xs + 1, backgroundColor: palette.primary50, borderColor: palette.primary100, borderWidth: 1, borderRadius: radius.md + 2, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm, maxWidth: "48%", minHeight: 44 },
  quickChipTxt:    { fontSize: 11, fontWeight: "600", color: palette.primary700, flexShrink: 1 },

  inputRow:        { flexDirection: "row", padding: spacing.md, gap: spacing.sm + 2, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: palette.gray100 },
  input:           { flex: 1, backgroundColor: palette.gray100, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, fontSize: 15, color: palette.gray900, minHeight: 44 },
  sendBtn:         { backgroundColor: palette.primary600, borderRadius: radius.pill, paddingHorizontal: spacing.lg, minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
});
