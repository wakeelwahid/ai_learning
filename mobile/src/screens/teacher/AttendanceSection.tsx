import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, semantic, accentSolid, radius, spacing, cardShadow } from "@/theme/colors";

/** STATIC PREVIEW — no backend yet. There is no attendance-tracking system
 * or teacher→student roster in this platform today; this section previews
 * what daily attendance-marking would look like once that ownership model
 * is built. Every value here is a fixed mock. */
const TODAY_ROSTER = [
  { name: "Aarav Sharma", roll: "10-A-01", status: "present" as const },
  { name: "Priya Patel", roll: "10-A-02", status: "present" as const },
  { name: "Rohan Gupta", roll: "10-A-03", status: "absent" as const },
  { name: "Ananya Singh", roll: "10-A-04", status: "present" as const },
  { name: "Vikram Rao", roll: "10-A-05", status: "late" as const },
  { name: "Ishita Verma", roll: "10-A-06", status: "present" as const },
];

const WEEKLY_TREND = [
  { day: "Mon", pct: 94 },
  { day: "Tue", pct: 88 },
  { day: "Wed", pct: 91 },
  { day: "Thu", pct: 97 },
  { day: "Fri", pct: 84 },
];

const STATUS_META = {
  present: { bg: semantic.success.bg, text: semantic.success.text, label: "Present", icon: "checkmark" as const },
  absent: { bg: semantic.danger.bg, text: semantic.danger.text, label: "Absent", icon: "close" as const },
  late: { bg: semantic.warning.bg, text: semantic.warning.text, label: "Late", icon: "time-outline" as const },
};

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function AttendanceSection() {
  const presentCount = TODAY_ROSTER.filter((s) => s.status === "present").length;

  return (
    <View style={{ gap: 12 }}>
      <View style={s.bannerRow}>
        <View style={s.comingSoonBadge}>
          <Text style={s.comingSoonTxt}>Coming Soon</Text>
        </View>
        <Text style={s.bannerNote} numberOfLines={2}>Preview of daily attendance tracking — not yet functional</Text>
      </View>

      <TouchableOpacity style={s.markBtn} activeOpacity={0.7} disabled>
        <Ionicons name="calendar" size={16} color="#fff" />
        <Text style={s.markBtnTxt}>Mark Today's Attendance</Text>
      </TouchableOpacity>

      <View style={s.statsGrid}>
        <View style={s.statCard}>
          <Text style={s.statLabel}>Present Today</Text>
          <Text style={[s.statValue, { color: semantic.success.solid }]}>{presentCount}/{TODAY_ROSTER.length}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statLabel}>Week's Avg</Text>
          <Text style={s.statValue}>91%</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statLabel}>Chronic Absent</Text>
          <Text style={[s.statValue, { color: semantic.danger.solid }]}>1</Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>📅 Today · Class 10-A</Text>
        <View style={{ marginTop: 10, gap: 8 }}>
          {TODAY_ROSTER.map((st) => {
            const meta = STATUS_META[st.status];
            return (
              <View key={st.roll} style={s.row}>
                <View style={s.avatar}>
                  <Text style={s.avatarTxt}>{initials(st.name)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{st.name}</Text>
                  <Text style={s.rowMeta}>{st.roll}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
                  <Ionicons name={meta.icon} size={11} color={meta.text} />
                  <Text style={[s.statusTxt, { color: meta.text }]}>{meta.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Weekly Attendance Trend</Text>
        <View style={s.chartRow}>
          {WEEKLY_TREND.map((d) => (
            <View key={d.day} style={s.chartCol}>
              <View style={s.chartBarTrack}>
                <View style={[s.chartBarFill, { height: `${d.pct}%` as any, backgroundColor: accentSolid.indigo }]} />
              </View>
              <Text style={s.chartLabel}>{d.day}</Text>
            </View>
          ))}
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
  markBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.primary600, opacity: 0.5, borderRadius: radius.md, paddingVertical: spacing.sm + 2 },
  markBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },
  statsGrid: { flexDirection: "row", gap: spacing.sm },
  statCard: { flex: 1, backgroundColor: "#fff", borderRadius: radius.lg - 2, padding: spacing.md, borderWidth: 1, borderColor: palette.gray100, gap: 4 },
  statLabel: { fontSize: 10, color: palette.gray500, fontWeight: "600" },
  statValue: { fontSize: 16, fontWeight: "800", color: palette.gray800 },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  cardTitle: { fontSize: 14, fontWeight: "700", color: palette.gray800 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray100 },
  avatar: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: accentSolid.indigo + "1a", alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: 11, fontWeight: "800", color: accentSolid.indigo },
  rowTitle: { fontSize: 12.5, fontWeight: "700", color: palette.gray800 },
  rowMeta: { fontSize: 10.5, color: palette.gray400, marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  statusTxt: { fontSize: 10, fontWeight: "700" },
  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, height: 110, marginTop: 10 },
  chartCol: { flex: 1, alignItems: "center", gap: 6, height: "100%" },
  chartBarTrack: { flex: 1, width: "100%", justifyContent: "flex-end" },
  chartBarFill: { width: "100%", borderRadius: 4 },
  chartLabel: { fontSize: 10, color: palette.gray400, fontWeight: "600" },
});
