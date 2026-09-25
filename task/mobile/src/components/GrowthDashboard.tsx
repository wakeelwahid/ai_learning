import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";

import { getFriendsLeaderboard, getTodaysGoal } from "@/api/gamification";
import ChallengeFriendModal, {
  ChallengeTarget,
} from "@/components/ChallengeFriendModal";
import { cardShadowElevated, palette, radius } from "@/theme/colors";

// ─────────────────────────────────────────────────────────────────────────────
// Growth Dashboard — Today's Mission + Friends Leaderboard.
// Entirely backend-driven: the mission card renders goals/today verbatim and
// AUTO-HIDES once the server marks it completed (a fresh goal reappears the
// next day server-side — no client timers). The daily-reward spin lives in
// components/DailySpinFab.tsx as a floating button, visible only while the
// backend says can_claim.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  userId: string;
  /** Continue Mission routing (goal_type quiz/questions) */
  onStartQuiz: () => void;
  /** Continue Mission routing (goal_type video/practice_minutes) */
  onOpenLearn: () => void;
  /** "View all" on the friends leaderboard */
  onViewLeaderboard: () => void;
  /**
   * Lets a parent screen (e.g. a small notification-badge button placed
   * elsewhere on the page) open this component's own Mission/Leaderboard
   * popups without duplicating its queries or challenge-modal state. Called
   * once on mount/update with the current open functions.
   */
  onRegisterTriggers?: (t: { openMission: () => void; openLeaderboard: () => void }) => void;
}

export default function GrowthDashboard({
  userId,
  onStartQuiz,
  onOpenLearn,
  onViewLeaderboard,
  onRegisterTriggers,
}: Props) {
  // v2: up to 4 goals/day (one per slot: video/quiz/ai_doubt/streak)
  // instead of 1 random goal — see gamification_service's GoalService.
  const { data: goals } = useQuery<any[]>({
    queryKey: ["today-goal", userId],
    queryFn: () => getTodaysGoal(userId).then((r: any) => r.data ?? []),
    enabled: !!userId,
    staleTime: 60_000,
  });
  const { data: friendsLb } = useQuery({
    queryKey: ["friends-leaderboard", userId],
    queryFn: () => getFriendsLeaderboard(userId).then((r: any) => r.data),
    enabled: !!userId,
    staleTime: 45_000, // matches the server-side Redis TTL
  });

  const [challengeTarget, setChallengeTarget] =
    useState<ChallengeTarget | null>(null);
  const [showMissionModal, setShowMissionModal] = useState(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);

  useEffect(() => {
    onRegisterTriggers?.({
      openMission: () => setShowMissionModal(true),
      openLeaderboard: () => setShowLeaderboardModal(true),
    });
    // Re-register whenever the callback identity changes so the parent
    // always holds a live closure — setShowMissionModal/setShowLeaderboardModal
    // themselves are stable (useState setters), so this effectively only
    // re-runs if the parent passes a new onRegisterTriggers function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterTriggers]);

  // Wide screens (tablet / desktop web) get the same side-by-side layout as
  // the web dashboard's sidebar — Mission + Leaderboard sit next to each
  // other instead of stacking full-width, which wastes horizontal space and
  // reads as cluttered on a large viewport (phones stay single-column).
  const { width } = useWindowDimensions();
  const isWide = width >= 720;

  const entries: any[] = friendsLb?.entries ?? [];
  const topFive = entries.slice(0, 5);
  const me = entries.find((e) => e.is_me);

  const incompleteGoals = (goals ?? []).filter((g) => !g.completed);

  const startGoal = (g: any) => {
    if (g.slot === "video") onOpenLearn();
    else if (g.slot === "quiz") onStartQuiz();
    // ai_doubt has no dedicated nav callback wired through this component's
    // props — DashboardScreen's own round-button row (which shares this
    // same query) navigates to AITutor directly instead of via this path.
  };

  const SLOT_ICON: Record<string, any> = { video: "play-circle", quiz: "trophy", ai_doubt: "sparkles", streak: "flame" };
  const SLOT_LABEL: Record<string, string> = { video: "Watch", quiz: "Quiz", ai_doubt: "Ask AI", streak: "Streak" };

  const missionNode = incompleteGoals.length > 0 && (
    <LinearGradient
      colors={[palette.primary600, palette.primary800]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.missionCard, isWide && styles.missionCardWide]}
    >
      {/* Soft glow accents for depth, matching the web dashboard's mission card */}
      <View style={styles.missionGlowTop} pointerEvents="none" />
      <View style={styles.missionGlowBottom} pointerEvents="none" />

      <View style={styles.missionOverallTag}>
        <Ionicons name="flag" size={10} color="rgba(255,255,255,0.6)" />
        <Text style={styles.missionOverallTagTxt}>Today's Goals ({incompleteGoals.length})</Text>
      </View>

      {incompleteGoals.map((g, i) => {
        const pct = Math.min(100, Math.round(((g.progress ?? 0) / Math.max(1, g.target_count)) * 100));
        return (
          <View key={g.id} style={i > 0 ? styles.missionRowDivider : undefined}>
            <View style={styles.missionTop}>
              <View style={styles.missionTag}>
                <View style={styles.missionTagIcon}>
                  <Ionicons name={SLOT_ICON[g.slot] ?? "flag"} size={10} color="#fff" />
                </View>
                <Text style={styles.missionTagTxt}>{SLOT_LABEL[g.slot] ?? g.slot}</Text>
              </View>
              <View style={styles.xpChip}>
                <Ionicons name="flash" size={10} color="#FDE68A" />
                <Text style={styles.xpChipTxt}>
                  +{g.xp_reward} XP
                  {g.ep_reward > 0 ? ` · +${g.ep_reward} EP` : ""}
                </Text>
              </View>
            </View>
            <Text style={styles.missionTitle} numberOfLines={2}>
              {g.title}
            </Text>
            <View style={styles.missionProgressRow}>
              <Text style={styles.missionProgressLabel}>Progress</Text>
              <Text style={styles.missionProgress}>
                {g.progress}/{g.target_count}
              </Text>
            </View>
            <View style={styles.missionBarTrack}>
              <View style={[styles.missionBarFill, { width: `${pct}%` }]} />
            </View>
            <TouchableOpacity
              style={styles.missionBtn}
              onPress={() => startGoal(g)}
              activeOpacity={0.85}
            >
              <Text style={styles.missionBtnTxt}>Continue</Text>
              <Ionicons name="arrow-forward" size={14} color={palette.primary700} />
            </TouchableOpacity>
          </View>
        );
      })}
    </LinearGradient>
  );

  const leaderboardNode = friendsLb && (
    <View style={[styles.lbCard, isWide && styles.lbCardWide]}>
      <View style={styles.lbHeader}>
        <View style={styles.lbHeaderTitle}>
          <View style={styles.lbHeaderIcon}>
            <Ionicons name="trophy" size={13} color="#D97706" />
          </View>
          <Text style={styles.lbTitle}>Friends Leaderboard</Text>
        </View>
        <TouchableOpacity
          onPress={onViewLeaderboard}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.lbViewAll}>View all</Text>
        </TouchableOpacity>
      </View>

      {friendsLb.friend_count === 0 ? (
        <View style={styles.lbEmptyWrap}>
          <View style={styles.lbEmptyIcon}>
            <Ionicons name="people" size={20} color={palette.primary500} />
          </View>
          <Text style={styles.lbEmptyTitle}>Add friends to compete!</Text>
          <Text style={styles.lbEmpty}>
            Challenge them to battles and climb together
          </Text>
        </View>
      ) : (
        topFive.map((e) => (
          <View
            key={e.user_id}
            style={[styles.lbRow, e.is_me && styles.lbRowMe]}
          >
            <View style={styles.lbRankWrap}>
              {e.rank <= 3 ? (
                <Text style={styles.lbRankMedal}>
                  {e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : "🥉"}
                </Text>
              ) : (
                <Text style={styles.lbRank}>{e.rank}</Text>
              )}
            </View>
            {e.avatar_url ? (
              <Image source={{ uri: e.avatar_url }} style={styles.lbAvatar} />
            ) : (
              <View style={[styles.lbAvatar, styles.lbAvatarFallback]}>
                {/* `|| "S"` (not ??) — a friend's full_name can be an empty
                        string, and ""[0] is undefined → .toUpperCase() crash */}
                <Text style={styles.lbAvatarTxt}>
                  {(e.is_me
                    ? "Y"
                    : String(e.full_name || "S").charAt(0)
                  ).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.lbNameWrap}>
              <Text
                style={[
                  styles.lbName,
                  e.is_me && { color: palette.primary700, fontWeight: "800" },
                ]}
                numberOfLines={1}
              >
                {e.is_me ? "You" : e.full_name || "Student"}
              </Text>
              <Text style={styles.lbXp}>
                {(e.total_xp ?? 0).toLocaleString()} XP
              </Text>
            </View>
            {!e.is_me && (
              <TouchableOpacity
                style={styles.challengeBtn}
                onPress={() =>
                  setChallengeTarget({
                    user_id: e.user_id,
                    full_name: e.full_name,
                    avatar_url: e.avatar_url ?? null,
                  })
                }
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="flash" size={14} color={palette.primary600} />
              </TouchableOpacity>
            )}
          </View>
        ))
      )}

      {me && me.rank > 5 && (
        <View style={[styles.lbRow, styles.lbRowMe, styles.lbRowMeDivider]}>
          <View style={styles.lbRankWrap}>
            <Text style={styles.lbRank}>{me.rank}</Text>
          </View>
          <View style={[styles.lbAvatar, styles.lbAvatarFallback]}>
            <Text style={styles.lbAvatarTxt}>Y</Text>
          </View>
          <View style={styles.lbNameWrap}>
            <Text
              style={[
                styles.lbName,
                { color: palette.primary700, fontWeight: "800" },
              ]}
            >
              You
            </Text>
            <Text style={styles.lbXp}>
              {(me.total_xp ?? 0).toLocaleString()} XP
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.wrap}>
      {/* Wide screens (tablet / desktop web): Mission + Leaderboard sit
          side-by-side, same as the web dashboard's sidebar layout. On
          phones, this component renders nothing inline — the parent screen's
          own small notification-badge buttons (see onRegisterTriggers)
          open these same popups instead. */}
      {isWide && (
        <View style={styles.wideRow}>
          <View style={styles.wideRowLeft}>{missionNode}</View>
          <View style={styles.wideRowRight}>{leaderboardNode}</View>
        </View>
      )}

      {/* Popups — full card content, reused verbatim from the nodes above */}
      <Modal visible={showMissionModal} animationType="slide" transparent onRequestClose={() => setShowMissionModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Today's Mission</Text>
              <TouchableOpacity onPress={() => setShowMissionModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={palette.gray500} />
              </TouchableOpacity>
            </View>
            {missionNode}
          </View>
        </View>
      </Modal>
      <Modal visible={showLeaderboardModal} animationType="slide" transparent onRequestClose={() => setShowLeaderboardModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Friends Leaderboard</Text>
              <TouchableOpacity onPress={() => setShowLeaderboardModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={palette.gray500} />
              </TouchableOpacity>
            </View>
            {leaderboardNode}
          </View>
        </View>
      </Modal>

      <ChallengeFriendModal
        target={challengeTarget}
        onClose={() => setChallengeTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },

  // ── Wide-screen (tablet/web) side-by-side layout ────────────────────────
  wideRow: { flexDirection: "row", gap: 16, alignItems: "stretch" },
  wideRowLeft: { flex: 3, minWidth: 0 },
  wideRowRight: { flex: 2, minWidth: 0 },

  // ── Popup sheet shared by the mission/leaderboard modals ────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: palette.gray50,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  modalHeaderTitle: { fontSize: 16, fontWeight: "800", color: palette.gray900 },

  // ── Mission ──────────────────────────────────────────────────────────────
  missionCard: {
    borderRadius: radius.lg,
    padding: 16,
    overflow: "hidden",
    ...cardShadowElevated,
  },
  missionCardWide: { flex: 1 },
  missionGlowTop: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  missionGlowBottom: {
    position: "absolute",
    bottom: -30,
    left: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(253,230,138,0.10)",
  },
  missionOverallTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 12,
  },
  missionOverallTagTxt: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  missionRowDivider: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  missionTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  missionTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  missionTagIcon: {
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  missionTagTxt: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 10.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  xpChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(253,230,138,0.18)",
    borderWidth: 1,
    borderColor: "rgba(253,230,138,0.3)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  xpChipTxt: { color: "#FDE68A", fontSize: 10.5, fontWeight: "900" },
  missionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12,
    lineHeight: 24,
  },
  missionProgressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  missionProgressLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "700",
  },
  missionProgress: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 11.5,
    fontWeight: "800",
  },
  missionBarTrack: {
    height: 7,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: 999,
    marginTop: 6,
    overflow: "hidden",
  },
  missionBarFill: { height: 7, backgroundColor: "#FDE68A", borderRadius: 999 },
  missionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingVertical: 11,
    borderRadius: 999,
    marginTop: 14,
  },
  missionBtnTxt: { color: palette.primary700, fontSize: 13, fontWeight: "900" },

  // ── Leaderboard ──────────────────────────────────────────────────────────
  lbCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 14,
    ...cardShadowElevated,
  },
  lbCardWide: { flex: 1 },
  lbHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  lbHeaderTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  lbHeaderIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  lbTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: palette.gray900,
    flexShrink: 1,
  },
  lbViewAll: { fontSize: 12, fontWeight: "700", color: palette.primary600 },
  lbEmptyWrap: { alignItems: "center", paddingVertical: 18, gap: 3 },
  lbEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: palette.primary50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  lbEmptyTitle: { fontSize: 13, fontWeight: "800", color: palette.gray700 },
  lbEmpty: { fontSize: 11.5, color: palette.gray400, textAlign: "center" },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: radius.md,
  },
  lbRowMe: { backgroundColor: palette.primary50 },
  lbRowMeDivider: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: palette.gray100,
  },
  lbRankWrap: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  lbRank: { fontSize: 12, fontWeight: "800", color: palette.gray400 },
  lbRankMedal: { fontSize: 15 },
  lbAvatar: { width: 30, height: 30, borderRadius: 15, flexShrink: 0 },
  lbAvatarFallback: {
    backgroundColor: palette.primary100,
    alignItems: "center",
    justifyContent: "center",
  },
  lbAvatarTxt: { color: palette.primary700, fontWeight: "900", fontSize: 12 },
  lbNameWrap: { flex: 1, minWidth: 0 },
  lbName: { fontSize: 13, fontWeight: "700", color: palette.gray800 },
  lbXp: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.gray400,
    marginTop: 1,
  },
  challengeBtn: {
    backgroundColor: palette.primary50,
    borderRadius: 999,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
