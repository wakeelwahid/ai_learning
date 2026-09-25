import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import Toast from "react-native-toast-message";
import { battleApi } from "@/api/battle";
import { palette, semantic, radius, spacing, typography, cardShadow } from "@/theme/colors";
import { EmptyState } from "@/components/ui";

// Mirrors frontend/src/pages/battle/BattleHistory.tsx — "Played" tab uses
// battleApi.history() (battles the user participated in, win/loss/draw),
// "Created" tab uses battleApi.myBattles() (battles the user hosted).

const PAGE_SIZE = 10;

// Battle-type tag colors — decorative category tags (not semantic
// status/feedback), so intentionally kept outside the semantic palette;
// mapped to the closest token-family hues used elsewhere in the app.
const TYPE_BADGE: Record<string, string> = {
  solo: palette.info500, "1v1": palette.purple600, group: "#F97316", public: palette.success500,
  team: palette.danger500, class_battle: palette.warning500, school_battle: "#EC4899",
  subject: "#06B6D4", chapter: palette.success500, study_party: "#F43F5E",
};

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  waiting:   { bg: palette.warning100, text: palette.warning700 },
  starting:  { bg: "#FFEDD5", text: "#9A3412" },
  active:    { bg: semantic.success.bg, text: semantic.success.text },
  completed: { bg: palette.gray100, text: palette.gray600 },
  cancelled: { bg: semantic.danger.bg, text: semantic.danger.text },
  abandoned: { bg: semantic.danger.bg, text: semantic.danger.text },
};

interface Props {
  userId: string;
  displayName: string;
  onBack: () => void;
  onRematch: (battle: any) => void;
}

export default function BattleHistoryScreen({ userId, displayName, onBack, onRematch }: Props) {
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<"played" | "created">("played");
  const [myPage, setMyPage] = useState(0);
  const [rematchingId, setRematchingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["battle-history", userId],
    queryFn: () => battleApi.history(userId).then((r) => r.data),
  });

  const { data: myBattlesData, isLoading: myLoading } = useQuery({
    queryKey: ["my-battles-history", userId, myPage],
    queryFn: () => battleApi.myBattles(userId, PAGE_SIZE, myPage * PAGE_SIZE).then((r) => r.data),
    enabled: tab === "created",
  });

  const { data: lbData } = useQuery({
    queryKey: ["battle-leaderboard"],
    queryFn: () => battleApi.leaderboard().then((r) => r.data),
    enabled: tab === "played",
  });

  const history: any[] = historyData?.history ?? [];
  const leaderboard: any[] = lbData?.leaderboard ?? [];
  const myBattles: any[] = myBattlesData?.battles ?? [];
  const myTotal: number = myBattlesData?.total ?? 0;
  const myTotalPages = Math.max(1, Math.ceil(myTotal / PAGE_SIZE));

  const handleReview = (battleId: string) => {
    navigation.navigate("BattleReview", { battleId, userId });
  };

  const handleRematch = async (battleId: string) => {
    setRematchingId(battleId);
    try {
      const r = await battleApi.rematch(battleId, userId, displayName);
      Toast.show({ type: "success", text1: "Rematch created!", text2: "Get ready for round two." });
      onRematch(r.data);
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Rematch failed", text2: e?.response?.data?.detail || "Could not create a rematch" });
    } finally {
      setRematchingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Battle History</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === "played" && styles.tabBtnActive]}
            onPress={() => setTab("played")}
          >
            <Ionicons name="flash-outline" size={13} color={tab === "played" ? palette.primary600 : "#fff"} />
            <Text style={[styles.tabTxt, tab === "played" && styles.tabTxtActive]}>Played</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === "created" && styles.tabBtnActive]}
            onPress={() => setTab("created")}
          >
            <Ionicons name="add-circle-outline" size={13} color={tab === "created" ? palette.primary600 : "#fff"} />
            <Text style={[styles.tabTxt, tab === "created" && styles.tabTxtActive]}>My Battles</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 10 }} showsVerticalScrollIndicator={false}>

        {tab === "played" && (
          <>
            {historyLoading && <ActivityIndicator color={palette.primary600} style={{ marginTop: 20 }} />}

            {!historyLoading && history.length === 0 && (
              <EmptyState icon="flash-outline" title="No battles played yet" />
            )}

            {history.map((b: any) => {
              const won = b.result === "won";
              const draw = b.result === "draw";
              const isRematching = rematchingId === b.battle_id;
              return (
                <View key={b.battle_id} style={styles.row}>
                  <View style={[styles.resultIcon, { backgroundColor: won ? palette.warning100 : palette.gray100 }]}>
                    <Ionicons
                      name={won ? "trophy" : draw ? "remove" : "flash-outline"}
                      size={18}
                      color={won ? palette.warning600 : palette.gray400}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{b.subject || "General"}</Text>
                      <View style={[styles.badge, { backgroundColor: (TYPE_BADGE[b.battle_type] ?? palette.primary500) + "22" }]}>
                        <Text style={[styles.badgeTxt, { color: TYPE_BADGE[b.battle_type] ?? palette.primary500 }]}>
                          {(b.battle_type ?? "").replace(/_/g, " ")}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.rowMeta}>
                      {b.score ?? 0} pts{b.rank ? ` · Rank #${b.rank}` : ""} · +{b.xp_earned ?? 0} XP
                      {b.played_at ? ` · ${new Date(b.played_at).toLocaleDateString()}` : ""}
                    </Text>
                    <View style={styles.actionRow}>
                      <View style={[styles.resultChip, won ? styles.resultChipWin : draw ? styles.resultChipDraw : styles.resultChipLoss]}>
                        <Text style={[styles.resultChipTxt, { color: won ? semantic.success.text : draw ? palette.gray600 : semantic.danger.text }]}>
                          {won ? "Win" : draw ? "Draw" : "Loss"}
                        </Text>
                      </View>
                      <TouchableOpacity style={styles.smallBtn} onPress={() => handleReview(b.battle_id)}>
                        <Ionicons name="book-outline" size={11} color={palette.primary600} />
                        <Text style={styles.smallBtnTxt}>Review</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.smallBtnAlt} onPress={() => handleRematch(b.battle_id)} disabled={!!rematchingId}>
                        {isRematching
                          ? <ActivityIndicator size="small" color={palette.primary600} />
                          : <><Ionicons name="refresh-outline" size={11} color={palette.primary600} /><Text style={styles.smallBtnAltTxt}>Rematch</Text></>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}

            {leaderboard.length > 0 && (
              <View style={styles.lbCard}>
                <View style={styles.lbHeader}>
                  <Ionicons name="trophy" size={14} color={palette.warning500} />
                  <Text style={styles.lbTitle}>Global Leaderboard</Text>
                </View>
                {leaderboard.slice(0, 10).map((p: any, i: number) => (
                  <View key={p.user_id ?? i} style={[styles.lbRow, p.user_id === userId && styles.lbRowMe]}>
                    <Text style={styles.lbRank}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</Text>
                    <Text style={styles.lbName} numberOfLines={1}>
                      {p.display_name || "Player"}{p.user_id === userId ? " (You)" : ""}
                    </Text>
                    <Text style={styles.lbWins}>{p.battles_won ?? 0}W</Text>
                    <Text style={styles.lbXp}>{p.total_xp_earned ?? p.total_xp ?? 0} XP</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {tab === "created" && (
          <>
            {myLoading && myPage === 0 && <ActivityIndicator color={palette.primary600} style={{ marginTop: 20 }} />}

            {!myLoading && myBattles.length === 0 && (
              <EmptyState icon="add-circle-outline" title="You haven't created any battles yet" />
            )}

            {myBattles.map((b: any) => {
              const isCompleted = b.status === "completed";
              const hasScore = (b.my_score ?? 0) > 0 || (b.my_correct ?? 0) > 0;
              const isExpanded = expandedId === b.id;
              const stCfg = STATUS_COLOR[b.status] ?? STATUS_COLOR.waiting;
              return (
                <View key={b.id} style={styles.row}>
                  <View style={[styles.resultIcon, { backgroundColor: palette.primary50 }]}>
                    <Ionicons name="flash-outline" size={18} color={palette.primary600} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{b.subject || "General"}</Text>
                      <View style={[styles.badge, { backgroundColor: stCfg.bg }]}>
                        <Text style={[styles.badgeTxt, { color: stCfg.text }]}>{b.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.rowMeta}>
                      {b.difficulty} · {b.question_count}Q · {Math.round((b.time_limit_sec ?? 0) / 60)}min · {new Date(b.created_at).toLocaleDateString()}
                    </Text>
                    {hasScore && (
                      <Text style={styles.rowMeta}>
                        {b.my_score} pts · {b.my_correct} correct · {b.my_wrong} wrong{b.my_rank ? ` · Rank #${b.my_rank}` : ""}
                      </Text>
                    )}
                    <View style={styles.actionRow}>
                      {isCompleted && (
                        <TouchableOpacity style={styles.smallBtn} onPress={() => handleReview(b.id)}>
                          <Ionicons name="book-outline" size={11} color={palette.primary600} />
                          <Text style={styles.smallBtnTxt}>Review</Text>
                        </TouchableOpacity>
                      )}
                      {b.standings?.length > 0 && (
                        <TouchableOpacity style={styles.smallBtnAlt} onPress={() => setExpandedId(isExpanded ? null : b.id)}>
                          <Ionicons name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"} size={11} color={palette.gray500} />
                          <Text style={[styles.smallBtnAltTxt, { color: palette.gray500 }]}>Details</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {isExpanded && b.standings?.length > 0 && (
                      <View style={styles.standingsBox}>
                        {b.standings.map((p: any, i: number) => (
                          <View key={i} style={styles.standingRow}>
                            <Text style={styles.standingRank}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${p.rank ?? i + 1}`}</Text>
                            <Text style={styles.standingName} numberOfLines={1}>{p.display_name}{p.is_ai ? " (AI)" : ""}</Text>
                            <Text style={styles.standingScore}>{p.score} pts</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {myTotalPages > 1 && (
              <View style={styles.pagerRow}>
                <TouchableOpacity
                  style={[styles.pagerBtn, myPage === 0 && styles.pagerBtnDisabled]}
                  onPress={() => setMyPage((p) => Math.max(0, p - 1))}
                  disabled={myPage === 0}
                >
                  <Ionicons name="chevron-back" size={14} color={myPage === 0 ? palette.gray300 : palette.primary600} />
                  <Text style={[styles.pagerTxt, myPage === 0 && { color: palette.gray300 }]}>Prev</Text>
                </TouchableOpacity>
                <Text style={styles.pagerLabel}>Page {myPage + 1} of {myTotalPages}</Text>
                <TouchableOpacity
                  style={[styles.pagerBtn, myPage >= myTotalPages - 1 && styles.pagerBtnDisabled]}
                  onPress={() => setMyPage((p) => Math.min(myTotalPages - 1, p + 1))}
                  disabled={myPage >= myTotalPages - 1}
                >
                  <Text style={[styles.pagerTxt, myPage >= myTotalPages - 1 && { color: palette.gray300 }]}>Next</Text>
                  <Ionicons name="chevron-forward" size={14} color={myPage >= myTotalPages - 1 ? palette.gray300 : palette.primary600} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },
  container: { flex: 1 },

  header: { paddingTop: spacing.lg, paddingHorizontal: spacing["2xl"], paddingBottom: spacing.md, backgroundColor: palette.primary600 },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", ...typography.h4 },

  tabRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.md, padding: 4 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: spacing.sm, borderRadius: 9, minHeight: 36 },
  tabBtnActive: { backgroundColor: "#fff" },
  tabTxt: { fontSize: 12, fontWeight: "700", color: "#fff" },
  tabTxtActive: { color: palette.primary600 },

  emptyCard: { alignItems: "center", paddingVertical: spacing["4xl"], gap: spacing.sm },
  emptyTxt: { ...typography.bodySm, color: palette.gray400, fontWeight: "600" },

  row: { flexDirection: "row", gap: spacing.md, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, ...cardShadow },
  resultIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  rowTitle: { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  badge: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  badgeTxt: { fontSize: 9, fontWeight: "700", textTransform: "capitalize" },
  rowMeta: { ...typography.bodySm, color: palette.gray500, marginTop: 3 },

  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  resultChip: { borderRadius: 7, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  resultChipWin: { backgroundColor: semantic.success.bg },
  resultChipDraw: { backgroundColor: palette.gray100 },
  resultChipLoss: { backgroundColor: semantic.danger.bg },
  resultChipTxt: { fontSize: 10, fontWeight: "700" },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.primary50, borderRadius: 7, paddingHorizontal: spacing.sm, paddingVertical: 4, minHeight: 28 },
  smallBtnTxt: { fontSize: 10, fontWeight: "700", color: palette.primary600 },
  smallBtnAlt: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.gray100, borderRadius: 7, paddingHorizontal: spacing.sm, paddingVertical: 4, minHeight: 28 },
  smallBtnAltTxt: { fontSize: 10, fontWeight: "700", color: palette.gray600 },

  standingsBox: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: palette.gray100, gap: 4 },
  standingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  standingRank: { width: 22, textAlign: "center", fontSize: 10, fontWeight: "700", color: palette.gray400 },
  standingName: { flex: 1, fontSize: 11, color: palette.gray700, fontWeight: "600" },
  standingScore: { fontSize: 11, fontWeight: "700", color: palette.primary600 },

  lbCard: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, ...cardShadow },
  lbHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  lbTitle: { fontSize: 12, fontWeight: "800", color: palette.gray800 },
  lbRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6, minHeight: 32 },
  lbRowMe: { backgroundColor: palette.primary50, borderRadius: radius.sm, paddingHorizontal: 6 },
  lbRank: { width: 22, textAlign: "center", fontSize: 12 },
  lbName: { flex: 1, fontSize: 11, fontWeight: "600", color: palette.gray700 },
  lbWins: { fontSize: 10, fontWeight: "800", color: palette.primary600, marginRight: 6 },
  lbXp: { fontSize: 10, fontWeight: "700", color: palette.warning600 },

  pagerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 },
  pagerBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 9, borderWidth: 1.5, borderColor: palette.gray200, minHeight: 36 },
  pagerBtnDisabled: { opacity: 0.6 },
  pagerTxt: { fontSize: 11, fontWeight: "700", color: palette.primary600 },
  pagerLabel: { ...typography.bodySm, color: palette.gray500 },
});
