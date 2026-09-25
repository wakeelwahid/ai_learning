import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, semantic, accentSolid, radius, spacing, cardShadow } from "@/theme/colors";

/** STATIC PREVIEW — no backend yet. Every value here is a fixed mock so the
 * layout/flow can be reviewed before the real "needs support" flagging and
 * doubt-queue feature is built. */
const NEEDS_SUPPORT = [
  { name: "Rohan Gupta", roll: "10-A-03", reason: "Score dropped 18% this week in Mathematics", severity: "high" as const },
  { name: "Vikram Rao", roll: "10-A-05", reason: "No activity in the last 4 days", severity: "medium" as const },
  { name: "Meera Joshi", roll: "10-A-11", reason: "Struggling with Trigonometry (3 attempts, avg 32%)", severity: "high" as const },
];

const DOUBT_QUEUE = [
  { student: "Ananya Singh", question: "Why does sin(90°) = 1? I don't understand the unit circle.", subject: "Mathematics", time: "23 min ago" },
  { student: "Ishita Verma", question: "What's the difference between mitosis and meiosis?", subject: "Biology", time: "1h ago" },
];

const SEVERITY_META = {
  high: { bg: semantic.danger.bg, text: semantic.danger.text },
  medium: { bg: semantic.warning.bg, text: semantic.warning.text },
};

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function StudentSupportSection() {
  return (
    <View style={{ gap: 12 }}>
      <View style={s.bannerRow}>
        <View style={s.comingSoonBadge}>
          <Text style={s.comingSoonTxt}>Coming Soon</Text>
        </View>
        <Text style={s.bannerNote} numberOfLines={2}>Preview of student-support flags & the doubt queue — not yet functional</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>🆘 Needs Support</Text>
        <View style={{ marginTop: 10, gap: 8 }}>
          {NEEDS_SUPPORT.map((st) => {
            const sev = SEVERITY_META[st.severity];
            return (
              <View key={st.roll} style={s.row}>
                <View style={s.avatar}>
                  <Text style={s.avatarTxt}>{initials(st.name)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.rowBetween}>
                    <Text style={s.rowTitle} numberOfLines={1}>{st.name}</Text>
                    <View style={[s.severityBadge, { backgroundColor: sev.bg }]}>
                      <Text style={[s.severityTxt, { color: sev.text }]}>{st.severity}</Text>
                    </View>
                  </View>
                  <Text style={s.reasonTxt} numberOfLines={2}>{st.reason}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>❓ Doubt Queue</Text>
        <View style={{ marginTop: 10, gap: 10 }}>
          {DOUBT_QUEUE.map((d, i) => (
            <View key={i} style={s.doubtCard}>
              <View style={s.rowBetween}>
                <Text style={s.doubtStudent}>{d.student}</Text>
                <Text style={s.rowMeta}>{d.time}</Text>
              </View>
              <Text style={s.doubtQuestion}>{d.question}</Text>
              <View style={s.rowBetween}>
                <View style={s.subjectBadge}>
                  <Text style={s.subjectTxt}>{d.subject}</Text>
                </View>
                <TouchableOpacity style={s.resolveBtn} disabled>
                  <Ionicons name="checkmark" size={13} color={palette.gray600} />
                  <Text style={s.resolveTxt}>Resolve</Text>
                </TouchableOpacity>
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
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray100 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 },
  avatar: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: accentSolid.indigo + "1a", alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: 11, fontWeight: "800", color: accentSolid.indigo },
  rowTitle: { fontSize: 12.5, fontWeight: "700", color: palette.gray800, flexShrink: 1 },
  rowMeta: { fontSize: 10, color: palette.gray400 },
  reasonTxt: { fontSize: 11, color: palette.gray500, marginTop: 3 },
  severityBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },
  severityTxt: { fontSize: 9.5, fontWeight: "700", textTransform: "capitalize" },
  doubtCard: { padding: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray100, gap: 6 },
  doubtStudent: { fontSize: 12.5, fontWeight: "700", color: palette.gray800 },
  doubtQuestion: { fontSize: 12, color: palette.gray600, lineHeight: 17 },
  subjectBadge: { backgroundColor: palette.primary50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  subjectTxt: { fontSize: 10, fontWeight: "700", color: palette.primary600 },
  resolveBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.gray100, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  resolveTxt: { fontSize: 10.5, fontWeight: "700", color: palette.gray600 },
});
