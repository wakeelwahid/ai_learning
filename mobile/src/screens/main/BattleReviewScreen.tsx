import React from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { battleApi } from "@/api/battle";
import { palette, semantic, radius, spacing, typography, cardShadow } from "@/theme/colors";

// ─── Types ────────────────────────────────────────────────────────────────────
// Shape returned by GET /v1/battles/{battleId}/replay (and its /review alias)
// (services/battle_service/app/api/v1/routes/battle.py: get_battle_replay)
interface ReplayQuestion {
  question_text:  string;
  options:        string[];
  correct_answer: string | null;
  your_answer:    string | null;
  is_correct:     boolean;
  points_earned:  number;
  explanation:    string | null;
}

interface BattleReplay {
  battle_id:    string;
  subject:      string;
  type:         string;
  completed_at: string | null;
  questions:    ReplayQuestion[];
  score:        number;
  accuracy:     number;
  rank:         number | null;
  xp_earned:    number;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  battleId: string;
  userId:   string;
}

// ─── Question review card ──────────────────────────────────────────────────────

function ReviewCard({ item, index }: { item: ReplayQuestion; index: number }) {
  const answered  = item.your_answer !== null && item.your_answer !== undefined && item.your_answer !== "";
  const isCorrect = item.is_correct;

  return (
    <View
      style={[
        styles.qCard,
        isCorrect ? styles.qCardCorrect : styles.qCardWrong,
      ]}
    >
      <View style={styles.qCardHeader}>
        <View style={styles.qNumBadge}>
          <Text style={styles.qNumTxt}>Q{index + 1}</Text>
        </View>
        <View style={[styles.resultBadge, isCorrect ? styles.resultBadgeCorrect : styles.resultBadgeWrong]}>
          <Ionicons
            name={isCorrect ? "checkmark-circle" : answered ? "close-circle" : "help-circle"}
            size={13}
            color={isCorrect ? palette.success700 : palette.danger600}
          />
          <Text style={[styles.resultBadgeTxt, { color: isCorrect ? palette.success700 : palette.danger600 }]}>
            {isCorrect ? "Correct" : answered ? "Incorrect" : "Not answered"}
          </Text>
        </View>
      </View>

      <Text style={styles.qText}>{item.question_text}</Text>

      {/* Your answer */}
      <View style={styles.answerRow}>
        <Text style={styles.answerLabel}>Your answer</Text>
        <View
          style={[
            styles.answerPill,
            answered
              ? (isCorrect ? styles.answerPillCorrect : styles.answerPillWrong)
              : styles.answerPillEmpty,
          ]}
        >
          <Text
            style={[
              styles.answerPillTxt,
              answered
                ? { color: isCorrect ? palette.success700 : palette.danger600 }
                : { color: palette.gray400 },
            ]}
          >
            {answered ? item.your_answer : "Skipped"}
          </Text>
        </View>
      </View>

      {/* Correct answer — only shown when the user got it wrong */}
      {!isCorrect && item.correct_answer && (
        <View style={styles.answerRow}>
          <Text style={styles.answerLabel}>Correct answer</Text>
          <View style={[styles.answerPill, styles.answerPillCorrect]}>
            <Text style={[styles.answerPillTxt, { color: palette.success700 }]}>{item.correct_answer}</Text>
          </View>
        </View>
      )}

      {/* Points earned */}
      <View style={styles.pointsRow}>
        <Ionicons name="flash-outline" size={13} color={palette.warning500} />
        <Text style={styles.pointsTxt}>{item.points_earned} pts</Text>
      </View>

      {/* Explanation */}
      {item.explanation ? (
        <View style={styles.explCard}>
          <Text style={styles.explLabel}>Explanation</Text>
          <Text style={styles.explText}>{item.explanation}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BattleReviewScreen({ battleId, userId }: Props) {
  const navigation = useNavigation<any>();

  const {
    data: replay,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["battle-review", battleId, userId],
    queryFn: async () => {
      try {
        const { data } = await battleApi.getReview(battleId, userId);
        return data as BattleReplay;
      } catch {
        // fall back to the underlying replay endpoint if /review is unavailable
        const { data } = await battleApi.getReplay(battleId, userId);
        return data as BattleReplay;
      }
    },
    enabled: !!battleId && !!userId,
    staleTime: 60_000,
  });

  const questions = replay?.questions ?? [];
  const pct = replay ? Math.round(replay.accuracy ?? 0) : 0;

  const handleBack = () => navigation.goBack();

  React.useEffect(() => {
    if (isError) {
      Toast.show({ type: "error", text1: "Could not load battle review" });
    }
  }, [isError]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Battle Review</Text>
          <View style={{ width: 36 }} />
        </View>
        {replay && (
          <View style={styles.headerStatsRow}>
            <Text style={styles.headerSub}>
              {replay.subject ? `${replay.subject} · ` : ""}{replay.score} pts · {pct}% accuracy
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Loading state */}
        {isLoading && (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" color={palette.primary600} />
            <Text style={styles.loadingTxt}>Loading battle review…</Text>
          </View>
        )}

        {/* Error state */}
        {!isLoading && isError && (
          <View style={styles.centeredState}>
            <Ionicons name="alert-circle-outline" size={40} color={palette.danger500} />
            <Text style={styles.errorTxt}>Couldn't load this battle's review.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} disabled={isFetching}>
              {isFetching ? (
                <ActivityIndicator color={palette.primary600} size="small" />
              ) : (
                <Text style={styles.retryBtnTxt}>Retry</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Empty state */}
        {!isLoading && !isError && questions.length === 0 && (
          <View style={styles.centeredState}>
            <View style={styles.emptyIconBox}>
              <Ionicons name="document-text-outline" size={36} color="#fff" />
            </View>
            <Text style={styles.emptyTitle}>No Questions to Review</Text>
            <Text style={styles.emptyBody}>
              We couldn't find any question data for this battle yet.
            </Text>
          </View>
        )}

        {/* Summary strip */}
        {!isLoading && !isError && questions.length > 0 && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryChip}>
              <Ionicons name="checkmark-circle" size={14} color={palette.success600} />
              <Text style={styles.summaryChipTxt}>
                {questions.filter(q => q.is_correct).length} correct
              </Text>
            </View>
            <View style={styles.summaryChip}>
              <Ionicons name="close-circle" size={14} color={palette.danger600} />
              <Text style={styles.summaryChipTxt}>
                {questions.filter(q => !q.is_correct).length} incorrect
              </Text>
            </View>
            {replay?.xp_earned != null && (
              <View style={styles.summaryChip}>
                <Ionicons name="star" size={14} color={palette.warning600} />
                <Text style={styles.summaryChipTxt}>+{replay.xp_earned} XP</Text>
              </View>
            )}
          </View>
        )}

        {/* Question-by-question cards */}
        {!isLoading && !isError && questions.length > 0 && (
          <View style={styles.list}>
            {questions.map((q, idx) => (
              <ReviewCard key={idx} item={q} index={idx} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: palette.gray50 },
  container: { flex: 1 },

  // Header
  header:         { paddingTop: spacing.lg, paddingHorizontal: spacing["2xl"], paddingBottom: spacing["2xl"], backgroundColor: palette.primary600 },
  headerTopRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle:    { color: "#fff", ...typography.h4 },
  headerStatsRow: { marginTop: spacing.sm, alignItems: "center" },
  headerSub:      { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" },

  // Centered states
  centeredState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing["3xl"], paddingTop: 60, gap: spacing.md },
  loadingTxt:    { ...typography.body, color: palette.gray500, marginTop: 4 },
  errorTxt:      { ...typography.body, color: palette.danger500, textAlign: "center", lineHeight: 20 },
  retryBtn:      { marginTop: 4, backgroundColor: palette.primary50, paddingHorizontal: spacing["2xl"], paddingVertical: spacing.sm, borderRadius: radius.md, minHeight: 40, alignItems: "center", justifyContent: "center" },
  retryBtnTxt:   { fontSize: 13, fontWeight: "700", color: palette.primary600 },
  emptyIconBox:  { width: 72, height: 72, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary600 },
  emptyTitle:    { fontSize: 15, fontWeight: "700", color: palette.gray700, textAlign: "center" },
  emptyBody:     { ...typography.bodySm, color: palette.gray400, textAlign: "center", lineHeight: 19 },

  // Summary strip
  summaryRow:     { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, flexWrap: "wrap" },
  summaryChip:    { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#fff", borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: palette.gray200 },
  summaryChipTxt: { ...typography.bodyMedium, color: palette.gray700 },

  // List
  list: { padding: spacing.lg, gap: spacing.md },

  // Question review card
  qCard:            { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1.5, ...cardShadow },
  qCardCorrect:      { borderColor: palette.success100 },
  qCardWrong:        { borderColor: palette.danger100 },
  qCardHeader:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  qNumBadge:         { backgroundColor: palette.primary50, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  qNumTxt:           { fontSize: 12, fontWeight: "700", color: palette.primary600 },
  resultBadge:       { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  resultBadgeCorrect:{ backgroundColor: semantic.success.bg },
  resultBadgeWrong:  { backgroundColor: semantic.danger.bg },
  resultBadgeTxt:    { fontSize: 11, fontWeight: "700" },
  qText:             { fontSize: 15, fontWeight: "700", color: palette.gray900, lineHeight: 22, marginBottom: spacing.md },

  // Answer rows
  answerRow:        { marginBottom: spacing.sm },
  answerLabel:       { fontSize: 11, fontWeight: "600", color: palette.gray400, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
  answerPill:        { alignSelf: "flex-start", borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1.5, maxWidth: "100%" },
  answerPillCorrect: { backgroundColor: semantic.success.bg, borderColor: palette.success100 },
  answerPillWrong:   { backgroundColor: semantic.danger.bg, borderColor: palette.danger100 },
  answerPillEmpty:   { backgroundColor: palette.gray50, borderColor: palette.gray200 },
  answerPillTxt:     { fontSize: 13, fontWeight: "600" },

  // Points
  pointsRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  pointsTxt: { fontSize: 12, fontWeight: "600", color: palette.warning700 },

  // Explanation — neutral surface with an indigo accent (no violet/decorative
  // accent per design system; matches "left border / icon" pattern instead
  // of a colored tint block).
  explCard:  { backgroundColor: palette.gray50, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, borderWidth: 1, borderColor: palette.gray200, borderLeftWidth: 3, borderLeftColor: palette.primary600 },
  explLabel: { fontSize: 10, fontWeight: "700", color: palette.primary700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  explText:  { ...typography.bodySm, color: palette.gray600, lineHeight: 19 },
});
