import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";

import { claimDailyReward, getDailyRewardStatus } from "@/api/gamification";
import { cardShadowElevated, palette, radius, solid } from "@/theme/colors";

// ─────────────────────────────────────────────────────────────────────────────
// Daily Spin — floating button, bottom-right of the dashboard.
//
// Visibility is 100% server-owned: the FAB renders ONLY while
// /daily-reward/status says can_claim. After a successful spin the status
// query is invalidated, can_claim flips false, and the button auto-hides —
// it reappears when the backend flips can_claim back on (24h after the
// claim). No client-side timers or date math decide anything.
//
// The wheel is pure presentation: SPIN calls the claim endpoint FIRST, then
// animates to land exactly on the server-awarded day.
// ─────────────────────────────────────────────────────────────────────────────

const WHEEL_SIZE = 260;

export default function DailySpinFab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["daily-reward-status", userId], // shared with DailyRewardPopup — stays in sync
    queryFn: () => getDailyRewardStatus(userId).then((r: any) => r.data),
    enabled: !!userId,
  });

  // Gentle attention pulse while a spin is available.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!status?.can_claim) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status?.can_claim, pulse]);

  // Server says nothing to claim → no button at all (it comes back in 24h).
  if (!status?.can_claim) return null;

  return (
    <>
      <Animated.View style={[styles.fabWrap, { transform: [{ scale: pulse }] }]}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(true)}>
          <LinearGradient colors={solid.primary} style={styles.fab}>
            <Text style={{ fontSize: 24 }}>🎡</Text>
            <Text style={styles.fabTxt}>Spin</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      <SpinWheelModal
        visible={open}
        onClose={() => setOpen(false)}
        userId={userId}
        status={status}
        onClaimed={() => {
          // can_claim flips false server-side → this FAB auto-hides for 24h.
          queryClient.invalidateQueries({ queryKey: ["daily-reward-status", userId] });
          queryClient.invalidateQueries({ queryKey: ["edupoints-balance", userId] });
          queryClient.invalidateQueries({ queryKey: ["level-info", userId] });
          queryClient.invalidateQueries({ queryKey: ["streak", userId] });
        }}
      />
    </>
  );
}

function SpinWheelModal({
  visible, onClose, userId, status, onClaimed,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  status: any;
  onClaimed: () => void;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<null | { xp: number; ep: number; label: string; streak: number }>(null);

  const calendar: any[] = status?.calendar ?? [];
  const segmentCount = Math.max(1, calendar.length);
  const segmentDeg = 360 / segmentCount;

  const claimMutation = useMutation({
    mutationFn: () => claimDailyReward(userId).then((r: any) => r.data),
    onSuccess: (res) => {
      // Land the wheel on the server-awarded day: 4 full turns + offset that
      // brings segment (day-1) under the top pointer.
      const dayIdx = Math.max(0, (res?.day ?? 1) - 1);
      const finalDeg = 4 * 360 + (360 - dayIdx * segmentDeg);
      spin.setValue(0);
      setSpinning(true);
      Animated.timing(spin, {
        toValue: finalDeg,
        duration: 3000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setSpinning(false);
        setResult({
          xp: res?.xp_awarded ?? 0,
          ep: res?.ep_awarded ?? 0,
          label: res?.reward_label ?? "",
          streak: res?.current_streak ?? 1,
        });
        onClaimed();
      });
    },
    onError: () => {
      setSpinning(false);
      Toast.show({ type: "error", text1: "Couldn't spin", text2: "Please try again in a moment." });
    },
  });

  const close = () => {
    if (spinning) return;
    setResult(null);
    onClose();
  };

  const rotate = spin.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.wheelCard}>
          <TouchableOpacity style={styles.closeBtn} onPress={close}>
            <Ionicons name="close" size={20} color={palette.gray400} />
          </TouchableOpacity>

          <Text style={styles.wheelTitle}>{result ? "🎉 You won!" : "Daily Reward Wheel"}</Text>

          {result ? (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <Text style={{ fontSize: 44 }}>🎁</Text>
              <Text style={styles.resultBig}>{result.label}</Text>
              <Text style={styles.resultSub}>
                +{result.xp} XP{result.ep > 0 ? ` · +${result.ep} EP` : ""} · 🔥 {result.streak}-day streak
              </Text>
              <TouchableOpacity style={[styles.spinBtn, { marginTop: 18, paddingHorizontal: 32 }]} onPress={close}>
                <Text style={styles.spinBtnTxt}>Collect & Continue</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.pointer} />
              <Animated.View style={[styles.wheel, { transform: [{ rotate }] }]}>
                {calendar.map((c, i) => (
                  <View
                    key={i}
                    style={[
                      styles.wheelSeg,
                      { transform: [{ rotate: `${i * segmentDeg}deg` }, { translateY: -WHEEL_SIZE / 2 + 34 }] },
                    ]}
                  >
                    <Text style={[styles.wheelSegDay, c.claimed && { opacity: 0.35 }]}>D{c.day}</Text>
                    <Text style={[styles.wheelSegTxt, c.claimed && { opacity: 0.35 }]} numberOfLines={1}>
                      {c.xp > 0 ? `${c.xp}XP` : c.label}
                    </Text>
                  </View>
                ))}
                <View style={styles.wheelHub}>
                  <Text style={{ fontSize: 22 }}>🎯</Text>
                </View>
              </Animated.View>

              <TouchableOpacity
                style={[styles.spinBtn, { marginTop: 16, paddingHorizontal: 40, opacity: spinning ? 0.6 : 1 }]}
                disabled={spinning}
                onPress={() => claimMutation.mutate()}
              >
                {spinning ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.spinBtnTxt}>SPIN</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fabWrap: {
    position: "absolute",
    right: 18,
    bottom: 24,
    zIndex: 40,
    ...cardShadowElevated,
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
  },
  fabTxt: { color: "#fff", fontSize: 9.5, fontWeight: "900", marginTop: -2 },

  overlay: { flex: 1, backgroundColor: "rgba(17,24,39,0.62)", alignItems: "center", justifyContent: "center", padding: 24 },
  wheelCard: { width: "100%", maxWidth: 360, backgroundColor: "#fff", borderRadius: radius.xl, padding: 20, alignItems: "center", ...cardShadowElevated },
  closeBtn: { position: "absolute", top: 12, right: 12, zIndex: 5, padding: 4 },
  wheelTitle: { fontSize: 17, fontWeight: "900", color: palette.gray900, marginBottom: 10, textAlign: "center" },
  pointer: {
    width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 16,
    borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: palette.danger500,
    zIndex: 4, marginBottom: -6,
  },
  wheel: {
    width: WHEEL_SIZE, height: WHEEL_SIZE, borderRadius: WHEEL_SIZE / 2,
    backgroundColor: palette.primary50, borderWidth: 8, borderColor: palette.primary600,
    alignItems: "center", justifyContent: "center",
  },
  wheelSeg: { position: "absolute", alignItems: "center", width: 64 },
  wheelSegDay: { fontSize: 10, fontWeight: "900", color: palette.primary600 },
  wheelSegTxt: { fontSize: 11, fontWeight: "800", color: palette.gray700 },
  wheelHub: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: palette.primary600,
  },
  resultBig: { fontSize: 20, fontWeight: "900", color: palette.gray900, marginTop: 8 },
  resultSub: { fontSize: 13, color: palette.gray500, marginTop: 4, fontWeight: "700", textAlign: "center" },
  spinBtn: { backgroundColor: palette.primary600, paddingVertical: 11, borderRadius: 999, alignItems: "center" },
  spinBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 13 },
});
