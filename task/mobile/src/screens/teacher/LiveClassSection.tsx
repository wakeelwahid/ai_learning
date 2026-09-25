import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, semantic, accentSolid, radius, spacing, cardShadow } from "@/theme/colors";

/** STATIC PREVIEW — no backend yet. Every value here is a fixed mock so the
 * layout/flow can be reviewed before the real live-class feature (scheduling,
 * a video-conferencing integration, attendance) is built. */
const UPCOMING_CLASSES = [
  { id: "1", title: "Quadratic Equations — Live Doubt Session", subject: "Mathematics", time: "Today, 4:00 PM", students: 32 },
  { id: "2", title: "Photosynthesis Deep Dive", subject: "Biology", time: "Tomorrow, 11:00 AM", students: 28 },
  { id: "3", title: "Weekly Revision — Algebra", subject: "Mathematics", time: "Fri, 3:30 PM", students: 32 },
];

const PAST_RECORDINGS = [
  { id: "1", title: "Trigonometry Basics", date: "2 days ago", duration: "42 min", views: 27 },
  { id: "2", title: "Cell Structure & Function", date: "5 days ago", duration: "38 min", views: 25 },
];

export default function LiveClassSection() {
  return (
    <View style={{ gap: 12 }}>
      <View style={s.bannerRow}>
        <View style={s.comingSoonBadge}>
          <Text style={s.comingSoonTxt}>Coming Soon</Text>
        </View>
        <Text style={s.bannerNote} numberOfLines={2}>Preview of the Live Class feature — not yet functional</Text>
      </View>

      <TouchableOpacity style={s.scheduleBtn} activeOpacity={0.7} disabled>
        <Ionicons name="calendar-outline" size={16} color="#fff" />
        <Text style={s.scheduleBtnTxt}>Schedule a Class</Text>
      </TouchableOpacity>

      <View style={s.card}>
        <Text style={s.cardTitle}>📡 Upcoming Classes</Text>
        <View style={{ marginTop: 10, gap: 10 }}>
          {UPCOMING_CLASSES.map((c) => (
            <View key={c.id} style={s.row}>
              <View style={[s.icon, { backgroundColor: accentSolid.indigo + "1a" }]}>
                <Ionicons name="videocam-outline" size={18} color={accentSolid.indigo} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{c.title}</Text>
                <Text style={s.rowMeta} numberOfLines={1}>{c.subject} · {c.time} · {c.students} students</Text>
              </View>
              <TouchableOpacity style={s.startBtn} disabled>
                <Ionicons name="play" size={13} color={palette.gray600} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>🎬 Past Recordings</Text>
        <View style={{ marginTop: 10, gap: 8 }}>
          {PAST_RECORDINGS.map((r) => (
            <View key={r.id} style={s.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitleSm} numberOfLines={1}>{r.title}</Text>
                <Text style={s.rowMeta} numberOfLines={1}>{r.date} · {r.duration} · {r.views} views</Text>
              </View>
              <TouchableOpacity style={s.startBtn} disabled>
                <Ionicons name="play" size={13} color={palette.gray600} />
              </TouchableOpacity>
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
  scheduleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.primary600, opacity: 0.5, borderRadius: radius.md, paddingVertical: spacing.sm + 2 },
  scheduleBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  cardTitle: { fontSize: 14, fontWeight: "700", color: palette.gray800 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray100 },
  icon: { width: 34, height: 34, borderRadius: radius.sm + 2, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 12.5, fontWeight: "700", color: palette.gray800 },
  rowTitleSm: { fontSize: 12.5, fontWeight: "600", color: palette.gray700 },
  rowMeta: { fontSize: 10.5, color: palette.gray400, marginTop: 2 },
  startBtn: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
});
