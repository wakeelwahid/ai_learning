import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, semantic, accentSolid, radius, spacing, cardShadow } from "@/theme/colors";

/** STATIC PREVIEW — no backend yet. Every value here is a fixed mock so the
 * layout/flow can be reviewed before the real assignment-creation and
 * submission-tracking feature is built. */
const ASSIGNMENTS = [
  { id: "1", title: "Chapter 5 Practice — Quadratic Equations", subject: "Mathematics", due: "Due tomorrow", submitted: 24, total: 32, status: "active" as const },
  { id: "2", title: "Lab Report: Photosynthesis Experiment", subject: "Biology", due: "Due in 3 days", submitted: 12, total: 28, status: "active" as const },
  { id: "3", title: "Essay: Industrial Revolution", subject: "History", due: "Overdue by 1 day", submitted: 18, total: 30, status: "overdue" as const },
  { id: "4", title: "Unit 3 Vocabulary Quiz", subject: "English", due: "Completed", submitted: 32, total: 32, status: "done" as const },
];

const STATUS_META: Record<string, { bg: string; text: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  active: { bg: semantic.warning.bg, text: semantic.warning.text, label: "In Progress", icon: "time-outline" },
  overdue: { bg: semantic.danger.bg, text: semantic.danger.text, label: "Overdue", icon: "alert-circle-outline" },
  done: { bg: semantic.success.bg, text: semantic.success.text, label: "Completed", icon: "checkmark-circle-outline" },
};

export default function AssignmentsSection() {
  return (
    <View style={{ gap: 12 }}>
      <View style={s.bannerRow}>
        <View style={s.comingSoonBadge}>
          <Text style={s.comingSoonTxt}>Coming Soon</Text>
        </View>
        <Text style={s.bannerNote} numberOfLines={2}>Preview of assignment creation & tracking — not yet functional</Text>
      </View>

      <TouchableOpacity style={s.newBtn} activeOpacity={0.7} disabled>
        <Ionicons name="add" size={16} color="#fff" />
        <Text style={s.newBtnTxt}>New Assignment</Text>
      </TouchableOpacity>

      <View style={s.card}>
        <Text style={s.cardTitle}>📋 Assignments</Text>
        <View style={{ marginTop: 10, gap: 10 }}>
          {ASSIGNMENTS.map((a) => {
            const meta = STATUS_META[a.status];
            const pct = Math.round((a.submitted / a.total) * 100);
            return (
              <View key={a.id} style={s.assignmentRow}>
                <View style={s.rowBetween}>
                  <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{a.title}</Text>
                    <Text style={s.rowMeta} numberOfLines={1}>{a.subject} · {a.due}</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={11} color={meta.text} />
                    <Text style={[s.statusTxt, { color: meta.text }]}>{meta.label}</Text>
                  </View>
                </View>
                <View style={s.progressRow}>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: accentSolid.indigo }]} />
                  </View>
                  <Text style={s.progressTxt}>{a.submitted}/{a.total}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bannerRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  comingSoonBadge: { backgroundColor: semantic.warning.bg, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radius.pill },
  comingSoonTxt: { fontSize: 11, fontWeight: "800", color: semantic.warning.text },
  bannerNote: { fontSize: 11, color: palette.gray500, flex: 1 },
  newBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.primary600, opacity: 0.5, borderRadius: radius.md, paddingVertical: spacing.sm + 2 },
  newBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  cardTitle: { fontSize: 14, fontWeight: "700", color: palette.gray800 },
  assignmentRow: { padding: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray100, gap: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  rowTitle: { fontSize: 12.5, fontWeight: "700", color: palette.gray800 },
  rowMeta: { fontSize: 10.5, color: palette.gray400, marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  statusTxt: { fontSize: 10, fontWeight: "700" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barTrack: { flex: 1, height: 6, backgroundColor: palette.gray100, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  progressTxt: { fontSize: 10.5, color: palette.gray400, fontWeight: "600" },
});
