import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  SafeAreaView, StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, Clipboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { aiApi } from "@/api/ai";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import { useStudyHeartbeat } from "@/hooks/useStudyHeartbeat";
import StudyLimitBanner from "@/components/StudyLimitBanner";
import UpgradePrompt from "@/components/ui/UpgradePrompt";
import { palette, radius, spacing, typography } from "@/theme/colors";

interface Message { role: "user" | "assistant"; text: string; llm?: string }

const SUGGESTIONS = [
  "Explain Newton's Laws of Motion",
  "What is photosynthesis?",
  "How to solve quadratic equations?",
  "Explain the French Revolution",
  "What is the periodic table?",
];

const BOARDS   = ["CBSE", "HBSE", "ICSE", "UP Board"];
const CLASSES  = ["6", "7", "8", "9", "10", "11", "12"];
const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "History", "Geography"];

export default function AITutorScreen() {
  const { t } = useLanguage();
  const user = useAppSelector(s => s.auth.user);
  const navigation = useNavigation<any>();
  useStudyHeartbeat(true);
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "👋 " + t("howCanIHelp") || "How can I help you learn today? Ask me anything from your syllabus!" },
  ]);
  const [input,       setInput]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [board,       setBoard]       = useState("");
  const [classNum,    setClassNum]    = useState("");
  const [subject,     setSubject]     = useState("");
  const [chapter,     setChapter]     = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);

  const send = async (query: string) => {
    if (!query.trim() || loading) return;
    const userMsg: Message = { role: "user", text: query };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setLoading(true);
    setQuotaMessage(null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const res = await aiApi.study({
        query,
        board:     board || undefined,
        class_num: classNum ? parseInt(classNum) : undefined,
        subject:   subject || undefined,
        chapter:   chapter || undefined,
        user_id:   user?.id,
      });
      const data = res.data;
      setMessages(m => [...m, {
        role: "assistant",
        text: data.answer || "I couldn't find relevant information. Please refine your question.",
        llm:  data.llm,
      }]);
    } catch (err: any) {
      const detail: string | undefined = err?.response?.data?.detail;
      if (err?.response?.status === 429 && detail) {
        setQuotaMessage(detail);
      } else {
        setMessages(m => [...m, {
          role: "assistant",
          text: detail ?? "Sorry, I'm having trouble connecting. Please try again.",
        }]);
      }
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const handleCopy = (text: string, index: number) => {
    Clipboard.setString(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(i => (i === index ? null : i)), 1500);
  };

  const handleClear = () => {
    setMessages([
      { role: "assistant", text: "👋 " + (t as any)("howCanIHelp") || "How can I help you learn today? Ask me anything from your syllabus!" },
    ]);
  };

  const FilterPill = ({ label, value, options, onSelect }: any) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
      <Text style={styles.filterLabel}>{label}:</Text>
      {options.map((o: string) => (
        <TouchableOpacity
          key={o}
          onPress={() => onSelect(value === o ? "" : o)}
          style={[styles.pill, value === o && styles.pillActive]}
        >
          <Text style={[styles.pillTxt, value === o && styles.pillTxtActive]}>{o}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.primary600 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>{t("aiStudyTutor")}</Text>
            <Text style={styles.headerSub}>{t("syllabusOnly")}</Text>
          </View>
          <View style={styles.headerActions}>
            {messages.length > 1 && (
              <TouchableOpacity onPress={handleClear} style={styles.filterBtn}>
                <Ionicons name="refresh-outline" size={20} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setShowFilters(v => !v)}
              style={[styles.filterBtn, showFilters && styles.filterBtnActive]}
            >
              <Ionicons name="options-outline" size={20} color={showFilters ? palette.primary600 : "#fff"} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <StudyLimitBanner style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }} />

      {/* Filters Panel */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          <FilterPill label={t("board")}   value={board}    options={BOARDS}   onSelect={setBoard}    />
          <FilterPill label={t("class")}   value={classNum} options={CLASSES}  onSelect={setClassNum} />
          <FilterPill label={t("subject")} value={subject}  options={SUBJECTS} onSelect={setSubject}  />
          <TextInput
            style={styles.chapterInput}
            placeholder={`${t("chapter")} (optional)`}
            placeholderTextColor={palette.gray400}
            value={chapter}
            onChangeText={setChapter}
          />
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.msgList}
          showsVerticalScrollIndicator={false}
        >
          {/* Suggestions when no user message yet */}
          {messages.length === 1 && (
            <View style={styles.suggestionsSection}>
              <Text style={styles.suggestionsTitle}>{t("suggestedQuestions")}</Text>
              {SUGGESTIONS.map((s, i) => (
                <TouchableOpacity key={i} onPress={() => send(s)} style={styles.suggestionChip}>
                  <Ionicons name="bulb-outline" size={14} color={palette.primary600} style={{ marginRight: spacing.sm - 2 }} />
                  <Text style={styles.suggestionTxt}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {messages.map((m, i) => (
            <View key={i} style={[styles.msgRow, m.role === "user" && styles.msgRowUser]}>
              {m.role === "assistant" && (
                <View style={[styles.avatarCircle, { backgroundColor: palette.primary600 }]}>
                  <Ionicons name="sparkles" size={14} color="#fff" />
                </View>
              )}
              {m.role === "user" ? (
                <View style={[styles.bubble, styles.bubbleUser]}>
                  <Text style={[styles.bubbleTxt, styles.bubbleTxtUser]}>{m.text}</Text>
                </View>
              ) : (
                <View style={styles.bubbleCol}>
                  <View style={[styles.bubble, styles.bubbleAI, styles.bubbleFull]}>
                    <Text style={styles.bubbleTxt}>{m.text}</Text>
                    {m.llm && <Text style={styles.llmTag}>{m.llm}</Text>}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleCopy(m.text, i)}
                    style={styles.copyBtn}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons
                      name={copiedIndex === i ? "checkmark" : "copy-outline"}
                      size={13}
                      color={copiedIndex === i ? palette.success500 : palette.gray400}
                    />
                    <Text style={[styles.copyBtnTxt, copiedIndex === i && styles.copyBtnTxtActive]}>
                      {copiedIndex === i ? "Copied" : "Copy"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}

          {loading && (
            <View style={styles.msgRow}>
              <View style={[styles.avatarCircle, { backgroundColor: palette.primary600 }]}>
                <Ionicons name="sparkles" size={14} color="#fff" />
              </View>
              <View style={[styles.bubble, styles.bubbleAI, styles.typingBubble]}>
                <ActivityIndicator size="small" color={palette.primary600} />
                <Text style={styles.typingTxt}>  Thinking…</Text>
              </View>
            </View>
          )}

          {quotaMessage && (
            <View style={{ marginTop: spacing.sm }}>
              <UpgradePrompt message={quotaMessage} variant="compact" />
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.inputField}
            placeholder={t("askSyllabus")}
            placeholderTextColor={palette.gray400}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
            style={[
              styles.sendBtn,
              { backgroundColor: input.trim() && !loading ? palette.primary600 : palette.gray200 },
            ]}
          >
            <Ionicons name="send" size={18} color={input.trim() && !loading ? "#fff" : palette.gray400} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: palette.gray50 },
  header:         { paddingTop: spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing["2xl"] },
  headerRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerActions:  { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerTitle:    { color: "#fff", ...typography.h3, fontWeight: "800" },
  headerSub:      { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 },
  filterBtn:      { width: 38, height: 38, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  filterBtnActive:{ backgroundColor: "#fff" },
  filtersPanel:   { backgroundColor: "#fff", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.gray200 },
  filterLabel:    { fontSize: 12, fontWeight: "600", color: palette.gray700, marginRight: spacing.sm, alignSelf: "center" },
  pill:           { backgroundColor: palette.gray100, borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1, marginRight: spacing.sm - 2, minHeight: 32, justifyContent: "center" },
  pillActive:     { backgroundColor: palette.primary600 },
  pillTxt:        { fontSize: 12, color: palette.gray700 },
  pillTxtActive:  { color: "#fff" },
  chapterInput:   { backgroundColor: palette.gray50, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 13, color: palette.gray900 },
  msgList:        { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  suggestionsSection: { marginBottom: spacing.sm },
  suggestionsTitle: { fontSize: 13, fontWeight: "600", color: palette.gray500, marginBottom: spacing.sm },
  suggestionChip: { flexDirection: "row", alignItems: "center", backgroundColor: palette.primary50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, marginBottom: spacing.sm - 2, minHeight: 44 },
  suggestionTxt:  { color: palette.primary600, fontSize: 13, flex: 1 },
  msgRow:         { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  msgRowUser:     { justifyContent: "flex-end" },
  avatarCircle:   { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  bubbleCol:      { maxWidth: "80%", alignItems: "flex-start" },
  bubbleFull:     { maxWidth: "100%" },
  bubble:         { maxWidth: "80%", borderRadius: radius.lg, padding: spacing.md },
  bubbleUser:     { backgroundColor: palette.primary600, borderBottomRightRadius: 4 },
  bubbleAI:       { backgroundColor: "#fff", borderBottomLeftRadius: 4, elevation: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  bubbleTxt:      { fontSize: 14, color: palette.gray900, lineHeight: 20 },
  bubbleTxtUser:  { color: "#fff" },
  llmTag:         { fontSize: 10, color: palette.gray400, marginTop: spacing.xs },
  copyBtn:        { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: 2, minHeight: 28 },
  copyBtnTxt:     { fontSize: 11, color: palette.gray400 },
  copyBtnTxtActive: { color: palette.success500 },
  typingBubble:   { flexDirection: "row", alignItems: "center" },
  typingTxt:      { fontSize: 13, color: palette.gray500 },
  inputBar:       { flexDirection: "row", alignItems: "flex-end", backgroundColor: "#fff", paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 1, borderTopWidth: 1, borderTopColor: palette.gray200, gap: spacing.sm + 1 },
  inputField:     { flex: 1, backgroundColor: palette.gray50, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.lg, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 1, fontSize: 14, color: palette.gray900, maxHeight: 100 },
  sendBtn:        { width: 44, height: 44, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },

  // Lock screen (unsubscribed)
});
