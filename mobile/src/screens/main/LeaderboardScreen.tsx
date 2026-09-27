import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import { getFriendsLeaderboard, getLeaderboard, getRankUnlock, getRankRewards } from "@/api/gamification";
import { quizApi } from "@/api/quiz";
import { contentApi } from "@/api/content";
import client from "@/api/client";
import UserAvatar from "@/components/UserAvatar";
import ChallengeFriendModal, { ChallengeTarget } from "@/components/ChallengeFriendModal";
import { palette, semantic } from "@/theme/colors";
import { EmptyState } from "@/components/ui";

const AVATAR_COLORS = [
  "#F59E0B", "#4F46E5", "#0891B2", "#059669", "#DC2626",
  "#7C3AED", "#F97316", "#0D9488", "#EC4899", "#6366F1",
];

function avatarColor(uid: string) {
  const sum = uid.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function shortId(uid: string) {
  return uid.slice(0, 4).toUpperCase();
}

const TOP3_HEIGHTS = [100, 130, 90];
const TOP3_ORDER = [1, 0, 2]; // silver, gold, bronze visual order

interface RankRewardTier {
  rank_from: number;
  rank_to: number;
  premium_months: number;
  label: string;
  icon: string;
}

// Perks/tint are presentation-only (not backend data) — the actual tier
// boundaries and reward months come live from /leaderboard/rank-rewards
// (fetched below), so an admin change to those numbers is reflected here
// automatically instead of silently drifting out of sync with a hardcoded copy.
const TIER_PRESENTATION: Record<string, { tint: string; perks: string[] }> = {
  "Top 10": { tint: semantic.warning.solid, perks: ["All premium content", "AI tutor unlimited", "Career explorer", "Priority support"] },
  "Top 20": { tint: palette.primary600,     perks: ["Premium content", "AI tutor 100 chats/mo", "Career explorer", "Battle arena VIP"] },
  "Top 30": { tint: "#DB2777",              perks: ["Premium content", "AI tutor 50 chats/mo", "Flashcards unlimited", "Battle arena"] },
};

export default function LeaderboardScreen() {
  const { t } = useLanguage();
  const navigation = useNavigation<any>();
  const userId = useAppSelector((s) => s.auth.user?.id ?? "");
  const [scope, setScope] = useState<"global" | "subject" | "friends">("global");
  const [selSubjectId, setSelSubjectId] = useState<string | null>(null);
  const [showUnlocks, setShowUnlocks] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState<ChallengeTarget | null>(null);

  const { data: leaders = [], isLoading, isError: leadersError } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => getLeaderboard(50).then((r) => r.data),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (leadersError) Toast.show({ type: "error", text1: "Could not load the leaderboard", text2: "Pull down to try again." });
  }, [leadersError]);

  const { data: rankData } = useQuery({
    queryKey: ["rank-unlock", userId],
    queryFn: () => getRankUnlock(userId).then((r) => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const { data: rankRewardsData } = useQuery({
    queryKey: ["rank-rewards"],
    queryFn: () => getRankRewards().then((r) => r.data),
    staleTime: 300_000,
  });
  const rankTiers: RankRewardTier[] = rankRewardsData?.tiers ?? [];

  const { data: friendsLb, isLoading: friendsLoading } = useQuery({
    queryKey: ["friends-leaderboard", userId],
    queryFn: () => getFriendsLeaderboard(userId).then((r) => r.data),
    enabled: !!userId && scope === "friends",
    staleTime: 45_000, // matches the server-side Redis TTL
  });

  // Real board/class from the student's own profile — never guessed or
  // client-overridable, so the subject leaderboard always scopes to the
  // caller's actual curriculum.
  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => client.get(`/v1/users/profile/${userId}`).then((r) => r.data),
    enabled: !!userId && scope === "subject",
  });
  const board = profile?.board as string | undefined;
  const classNum = Number(profile?.class_number) || undefined;

  const { data: catalog } = useQuery({
    queryKey: ["my-catalog-for-leaderboard", userId],
    queryFn: () => contentApi.myCatalog().then((r) => r.data),
    enabled: !!userId && scope === "subject",
  });
  const subjects: { id: string; name: string }[] = catalog?.subjects ?? [];

  useEffect(() => {
    if (!selSubjectId && subjects.length > 0) setSelSubjectId(subjects[0].id);
  }, [subjects, selSubjectId]);

  const { data: subjectLb, isLoading: subjectLbLoading } = useQuery({
    queryKey: ["subject-leaderboard", board, classNum, selSubjectId],
    queryFn: () => quizApi.subjectLeaderboard(board!, classNum!, selSubjectId!).then((r) => r.data),
    enabled: !!board && !!classNum && !!selSubjectId,
    staleTime: 60_000,
  });

  const myRank: number | null = rankData?.rank ?? null;
  // The caller only appears in `leaders` if ranked in the fetched top 50 —
  // for anyone else, fall back to rank-unlock's own total_xp/level so the
  // Unlock Progress / CTA math below always has real numbers instead of
  // silently rendering "+undefined XP".
  const myEntry = leaders.find((l: any) => l.user_id === userId)
    ?? (rankData?.total_xp != null ? { user_id: userId, total_xp: rankData.total_xp, level: rankData.level } : undefined);

  const top3 = leaders.slice(0, 3);
  const rest = leaders.slice(3);

  // XP still needed to reach a given rank threshold (e.g. 10, 20, 30).
  const xpToTop = (threshold: number): number | null => {
    const threshEntry = leaders[threshold - 1];
    if (!threshEntry || !myEntry) return null;
    return Math.max(0, threshEntry.total_xp - myEntry.total_xp);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: semantic.warning.solid }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Ionicons name="trophy" size={28} color="#fff" style={{ marginBottom: 4 }} />
            <Text style={styles.headerTitle}>{t("leaderboard")}</Text>
            <Text style={styles.headerSub}>Top students by XP</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowUnlocks((v) => !v)}
            style={styles.rewardsBtn}
          >
            <Ionicons name="gift" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Scope tabs */}
      <View style={styles.scopeRow}>
        {(["global", "subject", "friends"] as const).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setScope(s)}
            style={[styles.scopeTab, scope === s && styles.scopeTabActive]}
          >
            <Text style={[styles.scopeTabTxt, scope === s && styles.scopeTabTxtActive]} numberOfLines={1}>
              {s === "global" ? t("global") : s === "subject" ? "Subject" : "Friends"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* XP Rewards disclosure banner */}
      {showUnlocks && (
        <View style={styles.unlockBannerWrap}>
          <View style={[styles.unlockBannerHeader, { backgroundColor: semantic.warning.solid }]}>
            <View style={styles.rowCenter}>
              <Ionicons name="gift" size={16} color="#fff" />
              <Text style={styles.unlockBannerTitle}>Top Rankers Unlock FREE Premium!</Text>
            </View>
            <Text style={styles.unlockBannerSub}>
              Earn XP to climb ranks and unlock paid features for FREE every month
            </Text>
          </View>
          <View style={styles.unlockBannerBody}>
            {rankTiers.map((tier) => {
              const presentation = TIER_PRESENTATION[tier.label] ?? { tint: palette.primary600, perks: [] };
              return (
                <View key={tier.label} style={styles.unlockTierCard}>
                  <View style={[styles.unlockTierHead, { backgroundColor: presentation.tint }]}>
                    <Text style={styles.unlockTierHeadTxt}>{tier.icon} {tier.label} students</Text>
                    <View style={styles.unlockTierPill}>
                      <Text style={styles.unlockTierPillTxt}>{tier.premium_months} month{tier.premium_months > 1 ? "s" : ""} FREE</Text>
                    </View>
                  </View>
                  <View style={styles.unlockPerkWrap}>
                    {presentation.perks.map((p) => (
                      <View key={p} style={styles.unlockPerkPill}>
                        <Ionicons name="checkmark-circle" size={11} color={semantic.success.solid} />
                        <Text style={styles.unlockPerkTxt}>{p}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
            <Text style={styles.unlockFootnote}>
              *Rankings reset monthly. Rewards applied automatically on the 1st of the next month.
            </Text>
          </View>
        </View>
      )}

      {scope === "subject" ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {subjects.length > 0 && (
            <View style={styles.subjectPickerRow}>
              {subjects.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setSelSubjectId(s.id)}
                  style={[styles.subjectChip, selSubjectId === s.id && styles.subjectChipActive]}
                >
                  <Text style={[styles.subjectChipTxt, selSubjectId === s.id && styles.subjectChipTxtActive]}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {subjectLbLoading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={semantic.warning.solid} />
            </View>
          ) : !subjectLb || subjectLb.entries.length === 0 ? (
            <EmptyState
              icon="trophy-outline"
              title={subjects.length === 0 ? "Complete your profile to see subject rankings" : "No quiz attempts yet for this subject — be the first!"}
            />
          ) : (
            <View style={styles.listSection}>
              <Text style={styles.listTitle}>
                {subjects.find((s) => s.id === selSubjectId)?.name ?? "Subject"} Rankings
              </Text>
              {subjectLb.entries.map((e: any) => {
                const medal = e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : null;
                const isMe = e.student_id === userId;
                const label = isMe ? "You" : shortId(e.student_id);
                return (
                  <View key={e.student_id} style={[styles.rankRow, isMe && { borderWidth: 2, borderColor: palette.primary600 }]}>
                    <View style={[styles.rankNumBox, { backgroundColor: medal ? semantic.warning.bg : palette.gray100 }]}>
                      {medal ? <Text style={styles.rankNumEmoji}>{medal}</Text> : <Text style={[styles.rankNum, { color: palette.gray400 }]}>#{e.rank}</Text>}
                    </View>
                    <View style={[styles.rankAvatarWrap, { borderColor: avatarColor(e.student_id) }]}>
                      <UserAvatar userId={e.student_id} name={label} size={36} />
                    </View>
                    <View style={styles.rankInfo}>
                      <Text style={styles.rankName}>{label}</Text>
                      <Text style={styles.rankXP}>{e.score.toFixed(1)}% avg score</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      ) : scope === "friends" ? (
        friendsLoading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={semantic.warning.solid} />
          </View>
        ) : !friendsLb || friendsLb.friend_count === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Add friends to compete!"
            action={{ label: "Find Friends", onPress: () => navigation.navigate("Messages") }}
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.listSection}>
              <Text style={styles.listTitle}>Friends Rankings</Text>
              {friendsLb.entries.map((e: any) => {
                const medal = e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : null;
                const label = e.is_me ? "You" : e.full_name || "Student";
                return (
                  <View key={e.user_id} style={[styles.rankRow, e.is_me && { borderWidth: 2, borderColor: palette.primary600 }]}>
                    <View style={[styles.rankNumBox, { backgroundColor: medal ? semantic.warning.bg : palette.gray100 }]}>
                      {medal ? <Text style={styles.rankNumEmoji}>{medal}</Text> : <Text style={[styles.rankNum, { color: palette.gray400 }]}>#{e.rank}</Text>}
                    </View>
                    <View style={[styles.rankAvatarWrap, { borderColor: avatarColor(e.user_id) }]}>
                      <UserAvatar uri={e.avatar_url} userId={e.user_id} name={label} size={36} />
                    </View>
                    <View style={styles.rankInfo}>
                      <Text style={styles.rankName}>{label}</Text>
                      <Text style={styles.rankXP}>{(e.total_xp ?? 0).toLocaleString()} XP · Lv {e.level}</Text>
                    </View>
                    {!e.is_me && (
                      <TouchableOpacity
                        style={styles.challengeBtn}
                        onPress={() => setChallengeTarget({ user_id: e.user_id, full_name: e.full_name, avatar_url: e.avatar_url ?? null })}
                      >
                        <Text style={styles.challengeBtnTxt}>⚔️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )
      ) : isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={semantic.warning.solid} />
        </View>
      ) : leaders.length === 0 ? (
        <EmptyState icon="trophy-outline" title="No data yet — be the first!" />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>

          {/* Podium */}
          {top3.length >= 3 && (
            <View style={styles.podium}>
              {TOP3_ORDER.map((idx) => {
                const p = top3[idx];
                if (!p) return null;
                const isFirst = idx === 0;
                const height = TOP3_HEIGHTS[TOP3_ORDER.indexOf(idx)];
                // Bar/ring color follows the medal tier, not a per-user hash — a
                // hash-derived ring could clash with the gold/silver/bronze
                // bar right below it (e.g. a teal ring on the #1 gold spot).
                // Solid fill (no gradient) per the design system.
                const ringColor = isFirst ? semantic.warning.solid : idx === 1 ? palette.gray400 : semantic.warning.text;
                return (
                  <View key={p.user_id} style={styles.podiumSlot}>
                    {isFirst && <Ionicons name="trophy" size={16} color={semantic.warning.solid} style={styles.podiumCrown} />}
                    <Text style={styles.podiumBadge}>{["🥇","🥈","🥉"][idx]}</Text>
                    <View style={[styles.podiumAvatarWrap, { borderColor: ringColor }, isFirst && styles.podiumAvatarWrapFirst]}>
                      <UserAvatar userId={p.user_id} name={p.display_name ?? shortId(p.user_id)} size={isFirst ? 54 : 46} />
                    </View>
                    <Text style={styles.podiumName}>Lv {p.level}</Text>
                    <Text style={styles.podiumXP}>{(p.total_xp / 1000).toFixed(1)}k XP</Text>
                    <View style={[styles.podiumBar, { height, backgroundColor: ringColor }]}>
                      <Text style={styles.podiumRank}>#{p.rank}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Your rank */}
          {myEntry && myRank && (
            <View style={styles.myRankSection}>
              <View style={[styles.myRankCard, { backgroundColor: palette.primary50 }]}>
                <Text style={styles.myRankLabel}>Your Rank</Text>
                <View style={styles.myRankRow}>
                  <View style={[styles.rankBadgeBig, { backgroundColor: palette.primary600 }]}>
                    <Text style={styles.rankBadgeBigTxt}>#{myRank}</Text>
                  </View>
                  <View style={[styles.rankAvatar, { borderColor: palette.primary600 }]}>
                    <Text style={[styles.rankAvatarTxt, { color: palette.primary600 }]}>{shortId(userId)}</Text>
                  </View>
                  <View style={styles.rankInfo}>
                    <Text style={styles.rankName}>You · Level {myEntry.level}</Text>
                    <Text style={styles.rankXP}>{myEntry.total_xp.toLocaleString()} XP</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Unlock progress — shown for users ranked below #10 */}
          {myRank && myRank > 10 && (
            <View style={styles.unlockProgressSection}>
              <View style={styles.unlockProgressCard}>
                <View style={styles.rowBetween}>
                  <View style={styles.rowCenter}>
                    <Ionicons name="flash" size={16} color={palette.primary600} />
                    <Text style={styles.unlockProgressTitle}>Unlock Progress</Text>
                  </View>
                  <Text style={styles.unlockProgressRank}>Rank #{myRank}</Text>
                </View>
                <View style={{ marginTop: 12, gap: 12 }}>
                  {rankTiers.map((tier) => tier.rank_to).sort((a, b) => b - a).map((threshold) => {
                    const threshEntry = leaders[threshold - 1];
                    if (!threshEntry) return null;
                    const needed = xpToTop(threshold);
                    const myXp = myEntry?.total_xp ?? 0;
                    const progress = Math.min(100, (myXp / threshEntry.total_xp) * 100);
                    const unlocked = needed !== null && needed <= 0;
                    const matchedTier = rankTiers.find((t) => t.rank_to === threshold);
                    const presentation = matchedTier ? TIER_PRESENTATION[matchedTier.label] : undefined;
                    const barColor = presentation?.tint ?? palette.primary600;
                    const label = matchedTier ? `${matchedTier.label} (${matchedTier.premium_months}mo FREE)` : `Top ${threshold}`;
                    return (
                      <View key={threshold}>
                        <View style={styles.rowBetween}>
                          <View style={styles.rowCenter}>
                            {unlocked && <Ionicons name="checkmark-circle" size={12} color={semantic.success.solid} />}
                            <Text style={[styles.unlockTierLabel, unlocked && { color: semantic.success.solid }]}>{label}</Text>
                          </View>
                          <Text style={styles.unlockTierNeeded}>
                            {unlocked ? "Unlocked!" : `+${needed?.toLocaleString()} XP`}
                          </Text>
                        </View>
                        <View style={styles.unlockProgressTrack}>
                          <View style={[styles.unlockProgressFill, { width: `${progress}%` as any, backgroundColor: barColor }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {/* CTA — how much more XP to reach the next unlock tier */}
          {myRank && leaders[29] && (
            <View style={styles.ctaSection}>
              <View style={[styles.ctaCard, { backgroundColor: palette.primary600 }]}>
                <Text style={styles.ctaEmoji}>🏆</Text>
                <View style={styles.rowCenter}>
                  <Ionicons name="trending-up" size={16} color="#fff" />
                  <Text style={styles.ctaTitle}>Keep up your streak!</Text>
                </View>
                {xpToTop(30) !== null && xpToTop(30)! > 0 && (
                  <Text style={styles.ctaBody}>
                    You're #{myRank} — earn <Text style={styles.ctaBodyBold}>{xpToTop(30)!.toLocaleString()} more XP</Text> to reach Top 30 and unlock 1 month FREE Premium!
                  </Text>
                )}
                {xpToTop(30) !== null && xpToTop(30)! <= 0 && xpToTop(10) !== null && xpToTop(10)! > 0 && (
                  <Text style={styles.ctaBody}>
                    You're in Top 30! Earn <Text style={styles.ctaBodyBold}>{xpToTop(10)!.toLocaleString()} more XP</Text> to unlock 3 months FREE Premium!
                  </Text>
                )}
                <View style={styles.ctaProgressTrack}>
                  <View
                    style={[
                      styles.ctaProgressFill,
                      { width: `${Math.min(100, ((myEntry?.total_xp ?? 0) / leaders[29].total_xp) * 100)}%` as any },
                    ]}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Rank rewards strip */}
          <View style={styles.rewardStrip}>
            {rankTiers.map((tier) => {
              const color = TIER_PRESENTATION[tier.label]?.tint ?? palette.primary600;
              return (
                <View key={tier.label} style={[styles.rewardCard, { borderColor: color + "40" }]}>
                  <Text style={styles.rewardIcon}>{tier.icon}</Text>
                  <Text style={[styles.rewardTier, { color }]}>{tier.label}</Text>
                  <Text style={styles.rewardMonths}>{tier.premium_months}mo FREE</Text>
                </View>
              );
            })}
          </View>

          {/* Full list */}
          <View style={styles.listSection}>
            <Text style={styles.listTitle}>Full Rankings</Text>
            {rest.map((item: any) => {
              const color = avatarColor(item.user_id);
              const isMe = item.user_id === userId;
              return (
                <View
                  key={item.user_id}
                  style={[
                    styles.rankRow,
                    isMe && { borderWidth: 2, borderColor: palette.primary600 },
                  ]}
                >
                  <View style={[styles.rankNumBox, { backgroundColor: item.rank <= 10 ? palette.primary50 : palette.gray100 }]}>
                    <Text style={[styles.rankNum, { color: item.rank <= 10 ? palette.primary600 : palette.gray400 }]}>
                      #{item.rank}
                    </Text>
                  </View>
                  <View style={[styles.rankAvatarWrap, { borderColor: color }]}>
                    <UserAvatar userId={item.user_id} name={item.display_name ?? shortId(item.user_id)} size={30} />
                  </View>
                  <View style={styles.rankInfo}>
                    <Text style={styles.rankName}>{isMe ? "You" : `Level ${item.level}`}</Text>
                    <Text style={styles.rankXP}>{item.total_xp.toLocaleString()} XP</Text>
                  </View>
                  {item.rank <= 30 && (
                    <View style={styles.tierBadge}>
                      <Text style={styles.tierBadgeTxt}>
                        {item.rank <= 10 ? "🏆" : item.rank <= 20 ? "💎" : "⭐"}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      <ChallengeFriendModal target={challengeTarget} onClose={() => setChallengeTarget(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: palette.gray50 },
  header:          { alignItems: "center", paddingTop: 16, paddingBottom: 24, paddingHorizontal: 20 },
  headerTopRow:    { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", width: "100%" },
  headerTitle:     { color: "#fff", fontSize: 18, fontWeight: "800" },
  headerSub:       { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2 },
  rewardsBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  backBtn:         { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },

  scopeRow:        { flexDirection: "row", margin: 12, marginBottom: 4, backgroundColor: palette.gray100, borderRadius: 12, padding: 3 },
  scopeTab:        { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  scopeTabActive:  { backgroundColor: "#fff", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  scopeTabTxt:     { fontSize: 13, fontWeight: "600", color: palette.gray400 },
  scopeTabTxtActive: { color: palette.primary600 },

  rowCenter:       { flexDirection: "row", alignItems: "center", gap: 6 },
  rowBetween:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  loader:          { flex: 1, alignItems: "center", justifyContent: "center" },
  subjectPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  subjectChip:      { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#fff", borderWidth: 1, borderColor: palette.gray200 },
  subjectChipActive: { backgroundColor: palette.primary600, borderColor: palette.primary600 },
  subjectChipTxt:   { fontSize: 12, fontWeight: "700", color: palette.gray500 },
  subjectChipTxtActive: { color: "#fff" },
  comingSoon:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 48 },
  comingSoonTxt:   { fontSize: 14, color: palette.gray400, fontWeight: "600" },
  findFriendsBtn:  { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.primary600, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  findFriendsBtnTxt: { color: "#fff", fontSize: 12.5, fontWeight: "800" },
  rankNumEmoji:    { fontSize: 16 },
  challengeBtn:    { backgroundColor: palette.primary50, borderRadius: 999, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  challengeBtnTxt: { fontSize: 14 },

  // XP Rewards disclosure banner
  unlockBannerWrap:    { marginHorizontal: 12, marginTop: 10, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: semantic.warning.border, backgroundColor: semantic.warning.bg },
  unlockBannerHeader:  { paddingHorizontal: 14, paddingVertical: 12 },
  unlockBannerTitle:   { color: "#fff", fontSize: 13, fontWeight: "800" },
  unlockBannerSub:     { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 3 },
  unlockBannerBody:    { padding: 12, gap: 10 },
  unlockTierCard:      { borderRadius: 12, overflow: "hidden", backgroundColor: "#fff", borderWidth: 1, borderColor: palette.gray100 },
  unlockTierHead:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  unlockTierHeadTxt:   { color: "#fff", fontSize: 12, fontWeight: "800" },
  unlockTierPill:      { backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  unlockTierPillTxt:   { color: "#fff", fontSize: 10, fontWeight: "800" },
  unlockPerkWrap:      { flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 10 },
  unlockPerkPill:      { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.gray50, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  unlockPerkTxt:       { fontSize: 10, color: palette.gray600, fontWeight: "600" },
  unlockFootnote:      { fontSize: 10, color: palette.gray400, textAlign: "center" },

  podium:          { flexDirection: "row", justifyContent: "center", alignItems: "flex-end", paddingHorizontal: 20, gap: 8, marginTop: 12 },
  podiumSlot:      { flex: 1, alignItems: "center" },
  podiumCrown:     { marginBottom: 2 },
  podiumBadge:     { fontSize: 20, marginBottom: 4 },
  podiumAvatar:    { width: 52, height: 52, borderRadius: 26, borderWidth: 3, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 4, elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  podiumAvatarTxt: { fontSize: 12, fontWeight: "800" },
  podiumName:      { fontSize: 11, fontWeight: "700", color: palette.gray900, marginBottom: 1 },
  podiumXP:        { fontSize: 10, color: palette.gray500, marginBottom: 2 },
  podiumBar:       { width: "100%", borderTopLeftRadius: 12, borderTopRightRadius: 12, alignItems: "center", justifyContent: "flex-start", paddingTop: 10 },
  podiumRank:      { color: "#fff", fontWeight: "800", fontSize: 16 },

  myRankSection:   { paddingHorizontal: 16, marginTop: 16 },
  myRankCard:      { borderRadius: 20, padding: 16, borderWidth: 2, borderColor: palette.primary600 },
  myRankLabel:     { fontSize: 11, fontWeight: "700", color: palette.primary600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  myRankRow:       { flexDirection: "row", alignItems: "center", gap: 10 },
  rankBadgeBig:    { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rankBadgeBigTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },

  // Unlock progress card
  unlockProgressSection: { paddingHorizontal: 16, marginTop: 16 },
  unlockProgressCard:    { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 2, borderColor: palette.primary100, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  unlockProgressTitle:   { fontSize: 14, fontWeight: "800", color: palette.gray800 },
  unlockProgressRank:    { fontSize: 12, fontWeight: "700", color: palette.gray500 },
  unlockTierLabel:       { fontSize: 12, fontWeight: "600", color: palette.gray600 },
  unlockTierNeeded:      { fontSize: 11, color: palette.gray400, fontWeight: "600" },
  unlockProgressTrack:   { height: 8, backgroundColor: palette.gray100, borderRadius: 4, overflow: "hidden", marginTop: 5 },
  unlockProgressFill:    { height: "100%", borderRadius: 4 },

  // CTA banner
  ctaSection:      { paddingHorizontal: 16, marginTop: 16 },
  ctaCard:         { borderRadius: 20, padding: 18, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 },
  ctaEmoji:        { position: "absolute", right: 4, top: -6, fontSize: 84, opacity: 0.12 },
  ctaTitle:        { color: "#fff", fontSize: 14, fontWeight: "800" },
  ctaBody:         { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 8, lineHeight: 18 },
  ctaBodyBold:     { color: "#fff", fontWeight: "800" },
  ctaProgressTrack:{ height: 8, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 4, overflow: "hidden", marginTop: 12 },
  ctaProgressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 4 },

  rewardStrip:     { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 16 },
  rewardCard:      { flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1.5, elevation: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  rewardIcon:      { fontSize: 18, marginBottom: 2 },
  rewardTier:      { fontSize: 10, fontWeight: "800" },
  rewardMonths:    { fontSize: 9, color: palette.gray500, marginTop: 1 },

  listSection:     { paddingHorizontal: 16, marginTop: 20, paddingBottom: 32 },
  listTitle:       { fontSize: 14, fontWeight: "700", color: palette.gray900, marginBottom: 12 },
  rankRow:         { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 8, elevation: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, gap: 10 },
  rankNumBox:      { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rankNum:         { fontSize: 13, fontWeight: "700" },
  rankAvatar:      { width: 42, height: 42, borderRadius: 21, borderWidth: 2, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  rankAvatarWrap:  { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  podiumAvatarWrap:{ width: 54, height: 54, borderRadius: 27, borderWidth: 3, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#fff", marginBottom: 4 },
  podiumAvatarWrapFirst: { width: 62, height: 62, borderRadius: 31, borderWidth: 4, elevation: 4, shadowColor: semantic.warning.solid, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6 },
  rankAvatarTxt:   { fontSize: 13, fontWeight: "800" },
  rankInfo:        { flex: 1, minWidth: 0 },
  rankName:        { fontSize: 13, fontWeight: "600", color: palette.gray900 },
  rankXP:          { fontSize: 11, color: palette.gray500, marginTop: 1 },
  tierBadge:       { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  tierBadgeTxt:    { fontSize: 16 },
});
