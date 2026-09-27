import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { claimDailyReward, getDailyRewardStatus } from "@/api/gamification";
import { palette, solid, radius, cardShadowElevated } from "@/theme/colors";

// ─── Types (mirror gamification_service DailyRewardStatusResponse) ────────────
//
// The popup is entirely backend-driven: `should_show_popup` decides whether it
// opens (true only 24h+ after the last successful claim), `can_claim` gates
// the button, and `next_claim_in_seconds` seeds the countdown. The client
// never does its own eligibility/date math — it only renders these fields
// and, for display, ticks the server-provided countdown down once per second.

interface CalendarDay {
  day: number;
  xp: number;
  ep: number;
  label: string;
  claimed: boolean;
}

interface RewardStatus {
  claimed_today: boolean;
  current_day: number;
  reward: { xp: number; ep: number; label: string };
  calendar: CalendarDay[];
  can_claim: boolean;
  should_show_popup: boolean;
  current_streak: number;
  next_claim_in_seconds: number;
  next_reward: { day: number; xp: number; ep: number; label: string };
}

function fmtCountdown(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export default function DailyRewardPopup({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false); // once per app-open
  const [justClaimed, setJustClaimed] = useState<null | {
    xp: number;
    ep: number;
    label: string;
    streak: number;
  }>(null);
  const [countdown, setCountdown] = useState(0);
  const popAnim = useRef(new Animated.Value(0)).current;

  const { data: status } = useQuery<RewardStatus>({
    queryKey: ["daily-reward-status", userId],
    queryFn: () => getDailyRewardStatus(userId).then((r) => r.data),
    enabled: !!userId,
  });

  // Open exactly when the backend says so, once per app open.
  useEffect(() => {
    if (status?.should_show_popup && !dismissed && !visible) setVisible(true);
  }, [status, dismissed, visible]);

  // Display-only countdown, seeded from the server value.
  useEffect(() => {
    const initial = justClaimed ? 24 * 3600 : status?.next_claim_in_seconds ?? 0;
    setCountdown(initial);
    if (initial <= 0) return;
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [status?.next_claim_in_seconds, justClaimed]);

  const claimMutation = useMutation({
    mutationFn: () => claimDailyReward(userId).then((r) => r.data),
    onSuccess: (res) => {
      setJustClaimed({
        xp: res?.xp_awarded ?? 0,
        ep: res?.ep_awarded ?? 0,
        label: res?.reward_label ?? "",
        streak: res?.current_streak ?? 1,
      });
      popAnim.setValue(0);
      Animated.spring(popAnim, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
      queryClient.invalidateQueries({ queryKey: ["daily-reward-status", userId] });
      queryClient.invalidateQueries({ queryKey: ["edupoints-balance", userId] });
      queryClient.invalidateQueries({ queryKey: ["level-info", userId] });
    },
  });

  const close = () => {
    setVisible(false);
    setDismissed(true);
  };

  if (!status) return null;

  const claimedState = justClaimed !== null || (!status.can_claim && status.claimed_today);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={close}>
            <Ionicons name="close" size={20} color={palette.gray400} />
          </TouchableOpacity>

          {/* Hero */}
          <LinearGradient colors={solid.primary} style={styles.hero}>
            {justClaimed ? (
              <Animated.View
                style={{
                  alignItems: "center",
                  transform: [{ scale: popAnim }],
                  opacity: popAnim,
                }}
              >
                <Text style={styles.celebration}>🎉</Text>
                <Text style={styles.heroTitle}>Reward claimed!</Text>
                <Text style={styles.heroSub}>
                  You earned {justClaimed.label}
                  {justClaimed.ep > 0 ? ` + ${justClaimed.ep} EP` : ""} · 🔥 {justClaimed.streak}-day streak
                </Text>
              </Animated.View>
            ) : (
              <>
                <Ionicons name="gift" size={42} color="#fff" />
                <Text style={styles.heroTitle}>
                  {claimedState ? "You've already claimed today's reward." : "Daily Reward"}
                </Text>
                <Text style={styles.heroSub}>
                  {claimedState
                    ? "Come back tomorrow to keep your streak alive!"
                    : `Day ${status.current_day} — ${status.reward.label} is waiting for you`}
                </Text>
                {status.current_streak > 0 && (
                  <View style={styles.streakPill}>
                    <Ionicons name="flame" size={13} color="#FBBF24" />
                    <Text style={styles.streakPillTxt}>{status.current_streak}-day streak</Text>
                  </View>
                )}
              </>
            )}
          </LinearGradient>

          {/* Day 1 → 7 progression */}
          <View style={styles.strip}>
            {status.calendar.map((d) => {
              const isToday = d.day === status.current_day;
              const done = d.claimed || (justClaimed !== null && isToday);
              return (
                <View
                  key={d.day}
                  style={[
                    styles.dayChip,
                    done && styles.dayChipDone,
                    isToday && !done && styles.dayChipToday,
                    d.day === 7 && styles.dayChipSpecial,
                  ]}
                >
                  <Text style={styles.dayChipNum}>D{d.day}</Text>
                  {done ? (
                    <Ionicons name="checkmark-circle" size={16} color={palette.success500} />
                  ) : (
                    <Ionicons
                      name={d.day === 7 ? "gift" : "gift-outline"}
                      size={16}
                      color={d.day === 7 ? palette.purple600 : isToday ? palette.primary600 : palette.gray400}
                    />
                  )}
                  <Text style={styles.dayChipLabel} numberOfLines={1}>
                    {d.label}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Next reward preview */}
          <View style={styles.nextRow}>
            <Ionicons name="sparkles" size={13} color={palette.purple600} />
            <Text style={styles.nextTxt}>
              Next: Day {status.next_reward?.day} — {status.next_reward?.label}
            </Text>
          </View>

          {/* CTA / countdown */}
          {claimedState ? (
            <View style={styles.claimedBox}>
              <Text style={styles.claimedTxt}>✅ Claimed for today</Text>
              {countdown > 0 && (
                <Text style={styles.countdownTxt}>Next reward in {fmtCountdown(countdown)}</Text>
              )}
              <TouchableOpacity style={styles.secondaryBtn} onPress={close} activeOpacity={0.85}>
                <Text style={styles.secondaryBtnTxt}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.claimBtn}
              onPress={() => claimMutation.mutate()}
              disabled={claimMutation.isPending || !status.can_claim}
              activeOpacity={0.85}
            >
              {claimMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={styles.claimBtnTxt}>Claim Reward</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    overflow: "hidden",
    ...cardShadowElevated,
  },
  closeBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },

  hero: { alignItems: "center", paddingVertical: 26, paddingHorizontal: 20 },
  celebration: { fontSize: 40 },
  heroTitle: { fontSize: 17, fontWeight: "800", color: "#fff", marginTop: 8, textAlign: "center" },
  heroSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.9)",
    marginTop: 5,
    textAlign: "center",
    lineHeight: 18,
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 10,
  },
  streakPillTxt: { fontSize: 12, fontWeight: "800", color: "#fff" },

  strip: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  dayChip: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: palette.gray100,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 2,
    backgroundColor: "#fff",
  },
  dayChipDone: { backgroundColor: palette.primary50, borderColor: palette.primary200 },
  dayChipToday: { borderColor: palette.primary600, borderWidth: 2 },
  dayChipSpecial: { backgroundColor: "#FAF5FF" },
  dayChipNum: { fontSize: 9, fontWeight: "800", color: palette.gray400 },
  dayChipLabel: { fontSize: 8, fontWeight: "700", color: palette.gray500 },

  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 12,
  },
  nextTxt: { fontSize: 12, fontWeight: "700", color: palette.gray500 },

  claimBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: palette.primary600,
    borderRadius: radius.pill,
    paddingVertical: 13,
    margin: 16,
  },
  claimBtnTxt: { fontSize: 14, fontWeight: "800", color: "#fff" },

  claimedBox: { alignItems: "center", padding: 16, gap: 6 },
  claimedTxt: { fontSize: 14, fontWeight: "800", color: palette.success600 },
  countdownTxt: { fontSize: 12, color: palette.gray500, fontVariant: ["tabular-nums"] },
  secondaryBtn: {
    backgroundColor: palette.gray100,
    borderRadius: radius.pill,
    paddingHorizontal: 28,
    paddingVertical: 10,
    marginTop: 6,
  },
  secondaryBtnTxt: { fontSize: 13, fontWeight: "700", color: palette.gray700 },
});
