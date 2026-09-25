import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, semantic, radius, spacing, cardShadow } from "@/theme/colors";

/** STATIC PREVIEW — no backend yet. Every value here is a fixed mock so the
 * layout/flow can be reviewed before the real class-broadcast feature is
 * built. Parent-facing messages/meetings live in the separate Parent
 * Connect section. */
const RECENT_ANNOUNCEMENTS = [
  { id: "1", text: "Reminder: Unit test on Chapter 5 this Friday. Please revise thoroughly.", time: "2 hours ago" },
  { id: "2", text: "Great performance on the last quiz, class! Keep it up.", time: "Yesterday" },
];

export default function AnnouncementsSection() {
  return (
    <View style={{ gap: 12 }}>
      <View style={s.bannerRow}>
        <View style={s.comingSoonBadge}>
          <Text style={s.comingSoonTxt}>Coming Soon</Text>
        </View>
        <Text style={s.bannerNote} numberOfLines={2}>Preview of class broadcasts — not yet functional</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>📢 Class Announcements</Text>
        <TextInput
          style={s.textInput}
          placeholder="Write an announcement to your class..."
          placeholderTextColor={palette.gray400}
          multiline
          editable={false}
        />
        <TouchableOpacity style={s.sendBtn} activeOpacity={0.7} disabled>
          <Ionicons name="send" size={14} color="#fff" />
          <Text style={s.sendBtnTxt}>Send to Class</Text>
        </TouchableOpacity>
        <View style={{ marginTop: 10, gap: 8 }}>
          {RECENT_ANNOUNCEMENTS.map((a) => (
            <View key={a.id} style={s.announcementRow}>
              <Text style={s.announcementTxt}>{a.text}</Text>
              <Text style={s.rowMeta}>{a.time}</Text>
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
  textInput: { marginTop: 10, borderWidth: 1, borderColor: palette.gray100, borderRadius: radius.md, padding: spacing.sm + 2, fontSize: 12.5, minHeight: 64, textAlignVertical: "top", color: palette.gray700 },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.primary600, opacity: 0.5, borderRadius: radius.md, paddingVertical: spacing.sm, marginTop: 8, alignSelf: "flex-start", paddingHorizontal: spacing.lg },
  sendBtnTxt: { color: "#fff", fontSize: 12.5, fontWeight: "700" },
  announcementRow: { backgroundColor: palette.gray50, borderRadius: radius.md, padding: spacing.sm + 2 },
  announcementTxt: { fontSize: 12, color: palette.gray700, lineHeight: 17 },
  rowMeta: { fontSize: 10, color: palette.gray400, marginTop: 4 },
});
