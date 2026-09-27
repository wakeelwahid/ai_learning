import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, semantic, accentSolid, radius, spacing, cardShadow } from "@/theme/colors";

/** STATIC PREVIEW — no backend yet. Every value here is a fixed mock so the
 * layout/flow can be reviewed before the real parent-messaging and
 * meeting-scheduling feature is built. */
const PARENT_MESSAGES = [
  { id: "1", parent: "Priya Patel's Parent", preview: "Thank you for the update on Priya's progress.", time: "1h ago", unread: false },
  { id: "2", parent: "Rohan Gupta's Parent", preview: "Could we schedule a call to discuss Rohan's recent scores?", time: "5h ago", unread: true },
  { id: "3", parent: "Vikram Rao's Parent", preview: "Is there extra practice material for weak topics?", time: "1d ago", unread: true },
];

const MEETING_REQUESTS = [
  { id: "1", parent: "Rohan Gupta's Parent", topic: "Discuss recent quiz performance", requestedFor: "Sat, 11:00 AM" },
  { id: "2", parent: "Meera Joshi's Parent", topic: "Progress review meeting", requestedFor: "Mon, 4:00 PM" },
];

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function ParentConnectSection() {
  return (
    <View style={{ gap: 12 }}>
      <View style={s.bannerRow}>
        <View style={s.comingSoonBadge}>
          <Text style={s.comingSoonTxt}>Coming Soon</Text>
        </View>
        <Text style={s.bannerNote} numberOfLines={2}>Preview of parent messaging & meeting requests — not yet functional</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>💬 Parent Messages</Text>
        <View style={{ marginTop: 10, gap: 8 }}>
          {PARENT_MESSAGES.map((m) => (
            <View key={m.id} style={s.row}>
              <View style={s.avatar}>
                <Text style={s.avatarTxt}>{initials(m.parent)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.rowBetween}>
                  <Text style={s.rowTitle} numberOfLines={1}>{m.parent}</Text>
                  <Text style={s.rowMeta}>{m.time}</Text>
                </View>
                <Text style={s.previewTxt} numberOfLines={1}>{m.preview}</Text>
              </View>
              {m.unread && <View style={s.unreadDot} />}
            </View>
          ))}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>📅 Meeting Requests</Text>
        <View style={{ marginTop: 10, gap: 10 }}>
          {MEETING_REQUESTS.map((m) => (
            <View key={m.id} style={s.meetingCard}>
              <Text style={s.rowTitle}>{m.parent}</Text>
              <Text style={s.topicTxt}>{m.topic}</Text>
              <View style={s.rowBetween}>
                <View style={s.timeRow}>
                  <Ionicons name="videocam-outline" size={12} color={palette.gray400} />
                  <Text style={s.rowMeta}>{m.requestedFor}</Text>
                </View>
                <View style={s.actionRow}>
                  <TouchableOpacity style={s.acceptBtn} disabled>
                    <Ionicons name="checkmark" size={13} color={semantic.success.text} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.declineBtn} disabled>
                    <Ionicons name="close" size={13} color={semantic.danger.text} />
                  </TouchableOpacity>
                </View>
              </View>
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
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  cardTitle: { fontSize: 14, fontWeight: "700", color: palette.gray800 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray100 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: 11, fontWeight: "800", color: palette.primary600 },
  rowTitle: { fontSize: 12.5, fontWeight: "700", color: palette.gray800, flexShrink: 1 },
  rowMeta: { fontSize: 10, color: palette.gray400 },
  previewTxt: { fontSize: 11, color: palette.gray500, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.primary500 },
  meetingCard: { padding: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray100, gap: 6 },
  topicTxt: { fontSize: 11.5, color: palette.gray500 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionRow: { flexDirection: "row", gap: 6 },
  acceptBtn: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: semantic.success.bg, alignItems: "center", justifyContent: "center" },
  declineBtn: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: semantic.danger.bg, alignItems: "center", justifyContent: "center" },
});
