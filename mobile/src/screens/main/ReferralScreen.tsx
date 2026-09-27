import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator, Share, Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { referralApi } from "@/api/referral";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import { palette, semantic, radius, spacing, typography, cardShadow } from "@/theme/colors";

const { width } = Dimensions.get("window");

// ── Milestone reward data ─────────────────────────────────────────────────────
const MILESTONES = [
  { count: 1,  reward: "XP + EduPoints Bonus",     icon: "flash"         as const },
  { count: 2,  reward: "XP + EduPoints Bonus",     icon: "flash"         as const },
  { count: 3,  reward: "XP + EduPoints Bonus",     icon: "flash"         as const },
  { count: 5,  reward: "XP + EduPoints Bonus",     icon: "flash"         as const },
  { count: 7,  reward: "7 Days Premium",           icon: "star"          as const },
  { count: 10, reward: "30 Days Premium",          icon: "trophy"        as const },
];

// Milestone accent tints — a single indigo brand color would make every
// milestone card visually identical, so each keeps one distinct semantic-
// family tint (no indigo/violet pairing, no gradients) purely to
// differentiate list items at a glance.
const MILESTONE_COLORS = [palette.primary600, palette.info600, palette.warning600, palette.success600, "#F97316", palette.warning700];

// ── How it works steps ────────────────────────────────────────────────────────
const HOW_STEPS = [
  { icon: "person-add-outline" as const, label: "Sign Up",       desc: "Friend registers with your code" },
  { icon: "mail-outline"       as const, label: "Verify Email",  desc: "They verify their email address" },
  { icon: "play-circle-outline"as const, label: "Watch Video",   desc: "They watch their first study video" },
  { icon: "checkmark-done-outline" as const, label: "Complete Quiz", desc: "They complete their first quiz" },
  { icon: "gift-outline"       as const, label: "Both Get Rewarded", desc: "Your friend gets a welcome XP bonus — you unlock a milestone reward" },
];

// ── Reward shape (GET /v1/referrals/rewards/{userId}) ─────────────────────────
interface ReferralReward {
  milestone:   number;
  reward_type: string;
  is_claimed:  boolean;
  awarded_at?: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  onBack: () => void;
}

export default function ReferralScreen({ onBack }: Props) {
  const { t } = useLanguage();
  const user = useAppSelector(s => s.auth.user);

  const [code,        setCode]        = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(true);
  const [qualified,   setQualified]   = useState(0); // number of qualified referrals
  const [rewardsData, setRewardsData] = useState<ReferralReward[]>([]);
  const [sharing,     setSharing]     = useState(false);

  // ── Fetch referral code & rewards ──────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user?.id) { setCodeLoading(false); return; }
    setCodeLoading(true);
    try {
      const [codeRes, rewardsRes] = await Promise.allSettled([
        referralApi.getCode(user.id),
        referralApi.getRewards(user.id),
      ]);

      if (codeRes.status === "fulfilled") {
        const d = codeRes.value.data;
        setCode(d?.code ?? d?.referral_code ?? "EDUAI-" + user.id.slice(0, 6).toUpperCase());
        // qualified_referrals comes from the code endpoint
        setQualified(d?.qualified_referrals ?? d?.qualified_count ?? 0);
      } else {
        setCode("EDUAI-" + user.id.slice(0, 6).toUpperCase());
      }

      if (rewardsRes.status === "fulfilled") {
        const d = rewardsRes.value.data;
        setRewardsData(Array.isArray(d) ? d : Array.isArray(d?.rewards) ? d.rewards : []);
      }
    } catch {
      setCode("EDUAI-" + (user.id ?? "000000").slice(0, 6).toUpperCase());
    } finally {
      setCodeLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Share handler ──────────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!code) return;
    setSharing(true);
    try {
      await Share.share({
        message: `Hey! Join me on EduAI — the best study app for students. Use my referral code ${code} to unlock free rewards when you sign up!\n\nhttps://eduai.app/register?ref=${code}`,
        title: "Join EduAI with my referral code",
      });
    } catch {
      Toast.show({ type: "error", text1: "Share failed", text2: "Please try again." });
    } finally {
      setSharing(false);
    }
  };

  // ── Check if milestone is unlocked ────────────────────────────────────────
  const isUnlocked = (milestone: number) => qualified >= milestone;

  // ── Cross-reference rewardsData to know which milestones are actually claimed ──
  const claimedMilestones = new Set(
    rewardsData.filter((r) => r?.is_claimed).map((r) => r?.milestone)
  );
  const isClaimed = (milestone: number) => claimedMilestones.has(milestone);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="gift" size={22} color="#fff" />
          <Text style={styles.headerTitle}>Refer & Earn</Text>
        </View>
        <Text style={styles.headerSub}>Invite friends — unlock exclusive rewards</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>

        {/* Referral code card */}
        <View style={styles.codeCard}>
          <Text style={styles.codeCardLabel}>Your Referral Code</Text>
          {codeLoading ? (
            <ActivityIndicator color={palette.primary600} style={{ marginVertical: spacing.lg }} />
          ) : (
            <>
              <View style={styles.codeBox}>
                <Text style={styles.codeTxt} selectable numberOfLines={1} adjustsFontSizeToFit>{code ?? "—"}</Text>
              </View>
              <Text style={styles.qualifiedTxt}>
                {qualified} friend{qualified !== 1 ? "s" : ""} joined so far
              </Text>
            </>
          )}

          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing || codeLoading}
            activeOpacity={0.85}
          >
            <View style={[styles.shareBtn, { backgroundColor: (sharing || codeLoading) ? palette.primary300 : palette.primary600 }]}>
              {sharing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="share-social-outline" size={18} color="#fff" />
                  <Text style={styles.shareBtnTxt}>Share with Friends</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Progress summary */}
        <View style={styles.progressSummary}>
          <View style={styles.progressSummaryItem}>
            <Text style={styles.progressSummaryValue}>{qualified}</Text>
            <Text style={styles.progressSummaryLabel}>Referrals</Text>
          </View>
          <View style={styles.progressSummaryDivider} />
          <View style={styles.progressSummaryItem}>
            <Text style={styles.progressSummaryValue}>
              {MILESTONES.filter(m => qualified >= m.count).length}
            </Text>
            <Text style={styles.progressSummaryLabel}>Rewards unlocked</Text>
          </View>
          <View style={styles.progressSummaryDivider} />
          <View style={styles.progressSummaryItem}>
            <Text style={styles.progressSummaryValue}>
              {MILESTONES.find(m => qualified < m.count)?.count ?? "All!"}
            </Text>
            <Text style={styles.progressSummaryLabel}>Next milestone</Text>
          </View>
        </View>

        {/* Milestone rewards */}
        <Text style={styles.sectionTitle}>Milestone Rewards</Text>

        {MILESTONES.map((m, i) => {
          const unlocked = isUnlocked(m.count);
          const claimed = isClaimed(m.count);
          const accentColor = MILESTONE_COLORS[i % MILESTONE_COLORS.length];

          return (
            <View
              key={m.count}
              style={[styles.milestoneCard, unlocked && styles.milestoneCardUnlocked, unlocked && { borderColor: accentColor }]}
            >
              {/* Progress ring / checkmark */}
              <View style={[styles.milestoneBadge, { backgroundColor: unlocked ? accentColor : palette.gray100 }]}>
                {unlocked ? (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                ) : (
                  <Text style={[styles.milestoneBadgeNum, { color: accentColor }]}>{m.count}</Text>
                )}
              </View>

              {/* Icon */}
              <View style={[styles.milestoneIconWrap, { backgroundColor: accentColor + "15" }]}>
                <Ionicons name={m.icon} size={22} color={accentColor} />
              </View>

              {/* Info */}
              <View style={styles.milestoneInfo}>
                <Text style={[styles.milestoneReward, unlocked && { color: accentColor }]}>
                  {m.reward}
                </Text>
                <Text style={styles.milestoneRequirement}>
                  Invite {m.count} friend{m.count !== 1 ? "s" : ""}
                </Text>
              </View>

              {claimed && (
                <View style={styles.claimedTag}>
                  <Ionicons name="checkmark-circle" size={12} color={semantic.success.text} />
                  <Text style={styles.claimedTagTxt}>Claimed</Text>
                </View>
              )}
              {unlocked && !claimed && (
                <View style={styles.claimPulseTag}>
                  <Text style={styles.claimPulseTagTxt}>Claim!</Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Your Rewards */}
        {rewardsData.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Your Rewards</Text>
            <View style={styles.rewardsListWrap}>
              {rewardsData.map((r, i) => {
                const m = MILESTONES.find((ml) => ml.count === r?.milestone);
                const accentColor = m
                  ? MILESTONE_COLORS[MILESTONES.indexOf(m) % MILESTONE_COLORS.length]
                  : palette.success500;
                return (
                  <View key={r?.milestone ?? i} style={styles.rewardRow}>
                    <View style={[styles.rewardIconWrap, { backgroundColor: accentColor + "15" }]}>
                      <Ionicons name={m?.icon ?? "gift"} size={18} color={accentColor} />
                    </View>
                    <View style={styles.rewardInfo}>
                      <Text style={styles.rewardLabel}>{m?.reward ?? r?.reward_type}</Text>
                      <Text style={styles.rewardSub}>{r?.is_claimed ? "Activated" : "Ready to use"}</Text>
                    </View>
                    <View style={[styles.rewardStatusTag, r?.is_claimed ? styles.rewardStatusActive : styles.rewardStatusPending]}>
                      <Text style={[styles.rewardStatusTxt, r?.is_claimed ? styles.rewardStatusActiveTxt : styles.rewardStatusPendingTxt]}>
                        {r?.is_claimed ? "Active" : "Pending"}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* How it works */}
        <Text style={styles.sectionTitle}>How It Works</Text>

        <View style={styles.howCard}>
          {HOW_STEPS.map((step, i) => (
            <View key={i} style={styles.howStep}>
              <View style={styles.howStepLeft}>
                <View style={styles.howIconWrap}>
                  <Ionicons name={step.icon} size={20} color={palette.primary600} />
                </View>
                {i < HOW_STEPS.length - 1 && <View style={styles.howConnector} />}
              </View>
              <View style={styles.howStepContent}>
                <Text style={styles.howStepLabel}>{step.label}</Text>
                <Text style={styles.howStepDesc}>{step.desc}</Text>
              </View>
              <View style={styles.howStepNum}>
                <Text style={styles.howStepNumTxt}>{i + 1}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:                    { flex: 1, backgroundColor: palette.gray50 },

  // Header
  header:                  { paddingTop: spacing.lg, paddingHorizontal: spacing["2xl"], paddingBottom: spacing["3xl"], backgroundColor: palette.primary600 },
  backBtn:                 { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  headerCenter:            { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  headerTitle:             { color: "#fff", ...typography.h1 },
  headerSub:               { color: "rgba(255,255,255,0.75)", fontSize: 13 },

  body:                    { padding: spacing.lg },

  // Code card
  codeCard:                { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, alignItems: "center", borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  codeCardLabel:           { ...typography.caption, color: palette.gray400, marginBottom: spacing.md },
  codeBox:                 { backgroundColor: palette.primary50, borderRadius: radius.md, borderWidth: 2, borderColor: palette.primary600, borderStyle: "dashed", paddingHorizontal: spacing["2xl"], paddingVertical: spacing.md, marginBottom: spacing.sm },
  codeTxt:                 { fontSize: width < 300 ? 18 : 24, fontWeight: "900", color: palette.primary600, letterSpacing: width < 300 ? 1 : 2 },
  qualifiedTxt:            { fontSize: 12, color: palette.gray500, marginBottom: spacing.lg },
  shareBtn:                { borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing["3xl"], alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm, minHeight: 44 },
  shareBtnTxt:             { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Progress summary
  progressSummary:         { flexDirection: "row", backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing["2xl"], borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  progressSummaryItem:     { flex: 1, alignItems: "center" },
  progressSummaryValue:    { fontSize: 18, fontWeight: "800", color: palette.primary600 },
  progressSummaryLabel:    { fontSize: 10, color: palette.gray500, marginTop: 2, textAlign: "center" },
  progressSummaryDivider:  { width: 1, backgroundColor: palette.gray200 },

  // Section title
  sectionTitle:            { fontSize: 14, fontWeight: "700", color: palette.gray900, marginBottom: spacing.md },

  // Milestone cards
  milestoneCard:           { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 2, borderColor: palette.gray200, gap: spacing.md, ...cardShadow },
  milestoneCardUnlocked:   { backgroundColor: palette.gray50 },
  milestoneBadge:          { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  milestoneBadgeNum:       { fontSize: 14, fontWeight: "800" },
  milestoneIconWrap:       { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  milestoneInfo:           { flex: 1 },
  milestoneReward:         { fontSize: 14, fontWeight: "700", color: palette.gray900 },
  milestoneRequirement:    { fontSize: 11, color: palette.gray400, marginTop: 2 },
  claimedTag:              { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: semantic.success.bg },
  claimedTagTxt:           { fontSize: 11, fontWeight: "700", color: semantic.success.text },
  claimPulseTag:           { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: semantic.success.solid },
  claimPulseTagTxt:        { fontSize: 11, fontWeight: "800", color: "#fff" },

  // Your Rewards
  rewardsListWrap:         { backgroundColor: "#fff", borderRadius: radius.lg, padding: 6, marginBottom: spacing["2xl"], borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  rewardRow:               { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, minHeight: 44 },
  rewardIconWrap:          { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  rewardInfo:              { flex: 1 },
  rewardLabel:             { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  rewardSub:               { fontSize: 11, color: palette.gray400, marginTop: 1 },
  rewardStatusTag:         { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  rewardStatusActive:      { backgroundColor: semantic.success.bg },
  rewardStatusPending:     { backgroundColor: semantic.warning.bg },
  rewardStatusTxt:         { fontSize: 11, fontWeight: "700" },
  rewardStatusActiveTxt:   { color: semantic.success.text },
  rewardStatusPendingTxt:  { color: semantic.warning.text },

  // How it works
  howCard:                 { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.sm, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  howStep:                 { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.xs },
  howStepLeft:             { alignItems: "center", marginRight: spacing.lg, width: 40 },
  howIconWrap:             { width: 40, height: 40, borderRadius: radius.md, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center" },
  howConnector:            { width: 2, height: 24, backgroundColor: palette.gray200, marginTop: spacing.xs, marginBottom: spacing.xs },
  howStepContent:          { flex: 1, paddingTop: spacing.sm },
  howStepLabel:            { fontSize: 14, fontWeight: "700", color: palette.gray900 },
  howStepDesc:             { fontSize: 12, color: palette.gray500, marginTop: 2, marginBottom: spacing.md },
  howStepNum:              { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  howStepNumTxt:           { fontSize: 12, fontWeight: "700", color: palette.primary600 },
});
