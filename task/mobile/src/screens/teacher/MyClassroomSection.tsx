import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { palette, semantic, accentSolid, radius, spacing, cardShadow } from "@/theme/colors";

/** STATIC PREVIEW — no backend yet. There is no teacher→student roster or
 * classroom-assignment system in this platform today (a teacher only sees
 * an anonymous board+class aggregate, see the Analytics tab); this section
 * previews what a real assigned-classroom roster — and the class-code join
 * flow that would populate it — would look like once that ownership model
 * is built. Every value here is a fixed mock. */
const CLASS_CODE = "MATH10A-X7K2";

const ROSTER = [
  { name: "Aarav Sharma", roll: "10-A-01", avgScore: 87, trend: "up" as const },
  { name: "Priya Patel", roll: "10-A-02", avgScore: 92, trend: "up" as const },
  { name: "Rohan Gupta", roll: "10-A-03", avgScore: 64, trend: "down" as const },
  { name: "Ananya Singh", roll: "10-A-04", avgScore: 78, trend: "up" as const },
  { name: "Vikram Rao", roll: "10-A-05", avgScore: 55, trend: "down" as const },
  { name: "Ishita Verma", roll: "10-A-06", avgScore: 81, trend: "up" as const },
];

const PENDING_JOINS = [
  { name: "Karan Mehta", time: "10 min ago" },
  { name: "Sanya Kapoor", time: "2 hours ago" },
];

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function MyClassroomSection() {
  return (
    <View style={{ gap: 12 }}>
      <View style={s.bannerRow}>
        <View style={s.comingSoonBadge}>
          <Text style={s.comingSoonTxt}>Coming Soon</Text>
        </View>
        <Text style={s.bannerNote} numberOfLines={2}>Preview of a real assigned classroom roster — not yet functional</Text>
      </View>

      <LinearGradient colors={[accentSolid.indigo, palette.primary600]} style={s.codeCard}>
        <View style={s.codeHeaderRow}>
          <Ionicons name="person-add" size={15} color="rgba(255,255,255,0.85)" />
          <Text style={s.codeLabel}>Class Join Code</Text>
        </View>
        <Text style={s.codeValue}>{CLASS_CODE}</Text>
        <Text style={s.codeHint}>Share this code — students enter it to join your class instantly</Text>
        <View style={s.codeActions}>
          <TouchableOpacity style={s.codeBtn} disabled>
            <Ionicons name="copy-outline" size={14} color="#fff" />
            <Text style={s.codeBtnTxt}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.codeBtn} disabled>
            <Ionicons name="share-social-outline" size={14} color="#fff" />
            <Text style={s.codeBtnTxt}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.codeIconBtn} disabled>
            <Ionicons name="refresh" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {PENDING_JOINS.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>🎉 Recently Joined</Text>
          <View style={{ marginTop: 10, gap: 8 }}>
            {PENDING_JOINS.map((p) => (
              <View key={p.name} style={s.row}>
                <View style={[s.avatar, { backgroundColor: semantic.success.bg }]}>
                  <Text style={[s.avatarTxt, { color: semantic.success.text }]}>{initials(p.name)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{p.name}</Text>
                  <Text style={s.rowMeta}>via Class Code</Text>
                </View>
                <Text style={s.rowMeta}>{p.time}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={s.card}>
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>🏫 Class 10-A · CBSE</Text>
          <Text style={s.countTxt}>{ROSTER.length} students</Text>
        </View>
        <View style={{ marginTop: 10, gap: 8 }}>
          {ROSTER.map((st) => (
            <View key={st.roll} style={s.row}>
              <View style={s.avatar}>
                <Text style={s.avatarTxt}>{initials(st.name)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{st.name}</Text>
                <Text style={s.rowMeta}>{st.roll}</Text>
              </View>
              <Text style={s.scoreTxt}>{st.avgScore}%</Text>
              <Ionicons
                name={st.trend === "up" ? "trending-up" : "trending-down"}
                size={16}
                color={st.trend === "up" ? semantic.success.solid : semantic.danger.solid}
              />
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
  codeCard: { borderRadius: radius.lg, padding: spacing.lg },
  codeHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  codeLabel: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.85)" },
  codeValue: { fontSize: 22, fontWeight: "800", color: "#fff", marginTop: 4, letterSpacing: 0.5 },
  codeHint: { fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 4, lineHeight: 15 },
  codeActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  codeBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md },
  codeBtnTxt: { fontSize: 12, fontWeight: "700", color: "#fff" },
  codeIconBtn: { backgroundColor: "rgba(255,255,255,0.2)", width: 32, height: 32, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  cardTitle: { fontSize: 14, fontWeight: "700", color: palette.gray800 },
  countTxt: { fontSize: 12, color: palette.gray400 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray100 },
  avatar: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: accentSolid.indigo + "1a", alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: 11, fontWeight: "800", color: accentSolid.indigo },
  rowTitle: { fontSize: 12.5, fontWeight: "700", color: palette.gray800 },
  rowMeta: { fontSize: 10.5, color: palette.gray400, marginTop: 2 },
  scoreTxt: { fontSize: 12.5, fontWeight: "800", color: palette.gray700 },
});
