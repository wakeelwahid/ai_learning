import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { palette, semantic, accentSolid, radius, spacing, cardShadow } from "@/theme/colors";

/** STATIC PREVIEW — no backend yet. Every value here is a fixed mock so the
 * layout/flow can be reviewed before the real AI classroom-insights and
 * weekly-report-generation feature is built. */
const INSIGHTS = [
  "12 students in Class 10-A are weak in Trigonometry — consider a revision session before Friday's test.",
  "Quiz completion rate dropped 15% this week compared to last week.",
  "Rohan Gupta's engagement has declined for 4 consecutive days — may need a check-in.",
];

const SUGGESTIONS = [
  { title: "Assign: Trigonometry Revision Pack", reason: "Based on class-wide weak-topic pattern" },
  { title: "Assign: Quick Recall Quiz — Cell Biology", reason: "Reinforces last week's low-scoring topic" },
];

export default function AITeachingAssistantSection() {
  return (
    <View style={{ gap: 12 }}>
      <View style={s.bannerRow}>
        <View style={s.comingSoonBadge}>
          <Text style={s.comingSoonTxt}>Coming Soon</Text>
        </View>
        <Text style={s.bannerNote} numberOfLines={2}>Preview of AI-powered classroom insights — not yet functional</Text>
      </View>

      <LinearGradient colors={[accentSolid.indigo, palette.primary600]} style={s.aiCard}>
        <View style={s.aiIcon}>
          <Ionicons name="sparkles" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.aiTitle}>Ask your AI Teaching Assistant</Text>
          <Text style={s.aiSub} numberOfLines={1}>"Which students need a Trigonometry refresher?"</Text>
        </View>
        <TouchableOpacity style={s.aiSendBtn} disabled>
          <Ionicons name="send" size={14} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <View style={s.card}>
        <Text style={s.cardTitle}>✨ Classroom Insights</Text>
        <View style={{ marginTop: 10, gap: 8 }}>
          {INSIGHTS.map((insight, i) => (
            <View key={i} style={s.insightRow}>
              <Ionicons name="sparkles" size={14} color={semantic.warning.text} style={{ marginTop: 1 }} />
              <Text style={s.insightTxt}>{insight}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>💡 Smart Assignment Suggestions</Text>
        <View style={{ marginTop: 10, gap: 8 }}>
          {SUGGESTIONS.map((sg, i) => (
            <View key={i} style={s.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{sg.title}</Text>
                <Text style={s.rowMeta} numberOfLines={1}>{sg.reason}</Text>
              </View>
              <TouchableOpacity style={s.useBtn} disabled>
                <Text style={s.useBtnTxt}>Use</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>📊 Weekly Report & Parent Digest</Text>
        <Text style={s.reportDesc}>
          Generate an AI-written weekly summary of your classroom's performance, ready to share with parents.
        </Text>
        <TouchableOpacity style={s.generateBtn} disabled>
          <Ionicons name="document-text-outline" size={15} color="#fff" />
          <Text style={s.generateBtnTxt}>Generate Weekly Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bannerRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  comingSoonBadge: { backgroundColor: semantic.warning.bg, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radius.pill },
  comingSoonTxt: { fontSize: 11, fontWeight: "800", color: semantic.warning.text },
  bannerNote: { fontSize: 11, color: palette.gray500, flex: 1 },
  aiCard: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.lg, padding: spacing.lg },
  aiIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  aiTitle: { fontSize: 13, fontWeight: "700", color: "#fff" },
  aiSub: { fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  aiSendBtn: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  cardTitle: { fontSize: 14, fontWeight: "700", color: palette.gray800 },
  insightRow: { flexDirection: "row", gap: 8, backgroundColor: semantic.warning.bg, borderRadius: radius.md, padding: spacing.sm + 2 },
  insightTxt: { flex: 1, fontSize: 11.5, color: semantic.warning.text, lineHeight: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray100 },
  rowTitle: { fontSize: 12.5, fontWeight: "700", color: palette.gray800 },
  rowMeta: { fontSize: 10.5, color: palette.gray400, marginTop: 2 },
  useBtn: { backgroundColor: palette.gray100, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  useBtnTxt: { fontSize: 11, fontWeight: "700", color: palette.gray600 },
  reportDesc: { fontSize: 12, color: palette.gray500, marginTop: 6, lineHeight: 17 },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.primary600, opacity: 0.5, borderRadius: radius.md, paddingVertical: spacing.sm + 2, marginTop: 10 },
  generateBtnTxt: { color: "#fff", fontSize: 12.5, fontWeight: "700" },
});
