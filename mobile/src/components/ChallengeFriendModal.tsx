import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import Toast from "react-native-toast-message";

import { battleApi } from "@/api/battle";
import { useAppSelector } from "@/store";
import { cardShadowElevated, palette, radius } from "@/theme/colors";

// ─────────────────────────────────────────────────────────────────────────────
// Challenge Friend — shared by GrowthDashboard (friends leaderboard) and
// MessagesScreen (per-friend Challenge button). Creates a private 1v1 stake
// battle via POST /battles/challenge: both players need ≥50 XP, the winner
// gets +100 XP and +50 EduPoints, the loser forfeits 50 XP. The friend is
// notified in-app + push automatically; sharing the code is optional.
// ─────────────────────────────────────────────────────────────────────────────

const SUBJECTS = ["Physics", "Chemistry", "Maths", "Biology"];
const TIME_OPTIONS_MIN = [10, 20, 30];
const STAKE_OPTIONS = [50, 100, 200, 500]; // min 50 — both players must hold the stake
// Mirrors the server's time→questions mapping (enforced backend-side)
const questionsForTime = (min: number) => (min >= 25 ? 20 : min >= 15 ? 15 : 7);
// Web origin for tap-to-join share links (/battle/<CODE> auto-joins)
const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3002";

export interface ChallengeTarget {
  user_id: string;
  full_name: string | null;
  avatar_url?: string | null;
}

/** One face of the You-VS-Friend face-off: photo when uploaded, else initial. */
function FaceOffAvatar({ name, uri, ringColor }: { name: string; uri?: string | null; ringColor: string }) {
  const [broken, setBroken] = useState(false);
  return uri && !broken ? (
    <Image source={{ uri }} style={[faceOff.img, { borderColor: ringColor }]} onError={() => setBroken(true)} />
  ) : (
    <View style={[faceOff.img, faceOff.fallback, { borderColor: ringColor }]}>
      <Text style={faceOff.fallbackTxt}>{(name || "?").charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function FaceOff({ myName, myAvatar, friendName, friendAvatar }: {
  myName: string; myAvatar?: string | null; friendName: string; friendAvatar?: string | null;
}) {
  return (
    <View style={faceOff.row}>
      <View style={faceOff.side}>
        <FaceOffAvatar name={myName} uri={myAvatar} ringColor="#C7D2FE" />
        <Text style={faceOff.label}>You</Text>
      </View>
      <Text style={faceOff.vs}>VS</Text>
      <View style={faceOff.side}>
        <FaceOffAvatar name={friendName} uri={friendAvatar} ringColor="#FDE68A" />
        <Text style={faceOff.label} numberOfLines={1}>{friendName}</Text>
      </View>
    </View>
  );
}

const faceOff = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 12, marginTop: 2 },
  side: { alignItems: "center", gap: 4, maxWidth: 96 },
  img: { width: 60, height: 60, borderRadius: 30, borderWidth: 3 },
  fallback: { backgroundColor: palette.primary600, alignItems: "center", justifyContent: "center" },
  fallbackTxt: { color: "#fff", fontSize: 22, fontWeight: "900" },
  label: { fontSize: 12, fontWeight: "800", color: palette.gray700 },
  vs: { fontSize: 18, fontWeight: "900", color: palette.danger500, letterSpacing: 1 },
});

interface Reward {
  win_xp: number;
  win_edupoints?: number;
  loss_xp?: number;
  min_xp_required?: number;
}

export default function ChallengeFriendModal({
  target, onClose,
}: {
  target: ChallengeTarget | null;
  onClose: () => void;
}) {
  const me = useAppSelector((s: any) => s.auth.user);
  const [subject, setSubject] = useState<string>("Physics");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [timeMin, setTimeMin] = useState<number>(10);
  const [stakeXp, setStakeXp] = useState<number>(50);
  const [sent, setSent] = useState<null | { invite_code: string; reward?: Reward }>(null);

  const sendMutation = useMutation({
    mutationFn: () =>
      battleApi
        .challengeFriend({
          friend_id: target!.user_id, subject, difficulty,
          time_limit_sec: timeMin * 60, stake_xp: stakeXp,
        })
        .then((r: any) => r.data),
    onSuccess: (res) => setSent({ invite_code: res?.invite_code ?? "", reward: res?.reward }),
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      Toast.show({
        type: "error",
        text1: "Challenge not sent",
        text2: typeof detail === "string" ? detail : "Please try again.",
      });
    },
  });

  const close = () => {
    setSent(null);
    onClose();
  };

  const shareMessage = () =>
    `⚔️ I challenged you to a ${subject} battle on EduLearn! Winner takes +${sent?.reward?.win_xp ?? stakeXp} XP.\n` +
    `Tap to join instantly: ${WEB_ORIGIN}/battle/${sent?.invite_code}\n(or use code ${sent?.invite_code})`;

  const shareWhatsApp = () => {
    if (!sent) return;
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage())}`;
    Linking.canOpenURL(url).then((ok) => {
      if (ok) Linking.openURL(url);
      else Share.share({ message: shareMessage() }).catch(() => {});
    });
  };

  const shareGeneric = () => {
    if (!sent) return;
    Share.share({ message: shareMessage() }).catch(() => {});
  };

  if (!target) return null;
  const name = target.full_name || "your friend";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.challengeCard}>
          <TouchableOpacity style={styles.closeBtn} onPress={close}>
            <Ionicons name="close" size={20} color={palette.gray400} />
          </TouchableOpacity>

          {sent ? (
            <View style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ fontSize: 40 }}>⚔️</Text>
              <Text style={styles.modalTitle}>Challenge sent!</Text>
              <FaceOff
                myName={me?.full_name ?? "You"} myAvatar={me?.avatar_url}
                friendName={name} friendAvatar={target.avatar_url}
              />
              <Text style={styles.modalSub}>{name} just got a notification. Battle code:</Text>
              <View style={styles.codeBox}>
                <Text style={styles.codeTxt}>{sent.invite_code}</Text>
              </View>
              <Text style={styles.shareHint}>Sharing is optional — your friend was already notified.</Text>
              <View style={styles.shareRow}>
                <TouchableOpacity style={[styles.shareBtn, styles.waBtn]} onPress={shareWhatsApp}>
                  <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                  <Text style={styles.shareBtnTxt}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.shareBtn, styles.genericShareBtn]} onPress={shareGeneric}>
                  <Ionicons name="share-social-outline" size={16} color={palette.primary700} />
                  <Text style={[styles.shareBtnTxt, { color: palette.primary700 }]}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.modalTitle}>Challenge {name}</Text>
              <FaceOff
                myName={me?.full_name ?? "You"} myAvatar={me?.avatar_url}
                friendName={name} friendAvatar={target.avatar_url}
              />

              <Text style={styles.pickerLabel}>Subject</Text>
              <View style={styles.chipWrap}>
                {SUBJECTS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.pickChip, subject === s && styles.pickChipOn]}
                    onPress={() => setSubject(s)}
                  >
                    <Text style={[styles.pickChipTxt, subject === s && styles.pickChipTxtOn]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.pickerLabel}>Difficulty</Text>
              <View style={styles.chipWrap}>
                {(["easy", "medium", "hard"] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.pickChip, difficulty === d && styles.pickChipOn]}
                    onPress={() => setDifficulty(d)}
                  >
                    <Text style={[styles.pickChipTxt, difficulty === d && styles.pickChipTxtOn]}>
                      {d[0].toUpperCase() + d.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.pickerLabel}>Time Limit</Text>
              <View style={styles.chipWrap}>
                {TIME_OPTIONS_MIN.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.pickChip, timeMin === m && styles.pickChipOn]}
                    onPress={() => setTimeMin(m)}
                  >
                    <Text style={[styles.pickChipTxt, timeMin === m && styles.pickChipTxtOn]}>{m} min · {questionsForTime(m)} Qs</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.pickerLabel}>XP Stake — winner takes it, loser pays it</Text>
              <View style={styles.chipWrap}>
                {STAKE_OPTIONS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.pickChip, stakeXp === s && styles.stakeChipOn]}
                    onPress={() => setStakeXp(s)}
                  >
                    <Text style={[styles.pickChipTxt, stakeXp === s && styles.pickChipTxtOn]}>{s} XP</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Stakes */}
              <View style={styles.stakeCard}>
                <View style={styles.stakeRow}>
                  <Ionicons name="trophy" size={14} color="#B45309" />
                  <Text style={styles.stakeWinTxt}>Win: +{stakeXp} XP · +50 EduPoints</Text>
                </View>
                <View style={styles.stakeRow}>
                  <Ionicons name="trending-down" size={14} color="#DC2626" />
                  <Text style={styles.stakeLossTxt}>Lose: −{stakeXp} XP</Text>
                </View>
                <Text style={styles.stakeMinTxt}>
                  {questionsForTime(timeMin)} Questions · {timeMin} Minutes · Both players need at least {stakeXp} XP
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.sendBtn, sendMutation.isPending && { opacity: 0.6 }]}
                disabled={sendMutation.isPending}
                onPress={() => sendMutation.mutate()}
              >
                {sendMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.sendBtnTxt}>⚔️ Send Challenge</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(17,24,39,0.62)", alignItems: "center", justifyContent: "center", padding: 24 },
  challengeCard: { width: "100%", maxWidth: 360, backgroundColor: "#fff", borderRadius: radius.xl, padding: 20, ...cardShadowElevated },
  closeBtn: { position: "absolute", top: 12, right: 12, zIndex: 5, padding: 4 },
  modalTitle: { fontSize: 17, fontWeight: "900", color: palette.gray900, marginBottom: 10, textAlign: "center" },
  modalSub: { fontSize: 13, color: palette.gray500, marginTop: 4, fontWeight: "700", textAlign: "center" },
  vsLine: { fontSize: 14, fontWeight: "800", color: palette.gray700, textAlign: "center", marginBottom: 10 },
  pickerLabel: { fontSize: 11.5, fontWeight: "900", color: palette.gray500, textTransform: "uppercase", marginTop: 10, marginBottom: 6 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pickChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: palette.gray100 },
  pickChipOn: { backgroundColor: palette.primary600 },
  stakeChipOn: { backgroundColor: "#F59E0B" },
  pickChipTxt: { fontSize: 12.5, fontWeight: "800", color: palette.gray600 },
  pickChipTxtOn: { color: "#fff" },
  stakeCard: { marginTop: 14, backgroundColor: "#FFFBEB", borderRadius: radius.md, padding: 12, gap: 6 },
  stakeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stakeWinTxt: { fontSize: 13, fontWeight: "800", color: "#92400E" },
  stakeLossTxt: { fontSize: 13, fontWeight: "800", color: "#DC2626" },
  stakeMinTxt: { fontSize: 11, fontWeight: "700", color: palette.gray500, marginTop: 2 },
  sendBtn: { backgroundColor: palette.primary600, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 14 },
  sendBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 14 },
  codeBox: { backgroundColor: palette.primary50, borderRadius: radius.md, paddingHorizontal: 22, paddingVertical: 10, marginTop: 12, borderWidth: 1, borderColor: palette.primary200, borderStyle: "dashed" },
  codeTxt: { fontSize: 22, fontWeight: "900", color: palette.primary700, letterSpacing: 4 },
  shareHint: { fontSize: 11.5, color: palette.gray500, fontWeight: "700", marginTop: 12, textAlign: "center" },
  shareRow: { flexDirection: "row", gap: 10, marginTop: 10, alignSelf: "stretch" },
  shareBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 999, paddingVertical: 11 },
  waBtn: { backgroundColor: "#22C55E" },
  genericShareBtn: { backgroundColor: palette.primary50, borderWidth: 1.5, borderColor: palette.primary200 },
  shareBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 13 },
});
