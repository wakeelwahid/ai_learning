import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppSelector } from "@/store";
import { shareApi } from "@/api/share";
import { palette } from "@/theme/colors";

export interface AchievementData {
  type: "streak" | "badge" | "quiz_perfect" | "battle_win" | "level_up";
  title: string;
  subtitle?: string;
  value?: number;
}

interface ShareAchievementSheetProps {
  achievement: AchievementData;
  referralCode?: string;
  onClose: () => void;
  visible: boolean;
}

// Ionicons name per backend icon-name (gamification_service's share.py
// SHARE_CARD_META) — gradient colors themselves come from the server
// response fetched below, so a tier/color change there needs no app update.
const ICON_NAME_MAP: Record<string, string> = {
  fire: "flame", star: "star", hundred: "checkmark-circle", trophy: "trophy", bolt: "flash",
};

// Fallback used only if the server call fails — keeps the sheet functional
// offline/on error rather than blocking the whole share flow.
const FALLBACK_COLORS: [string, string] = ["#3B82F6", "#4338CA"];
const FALLBACK_ICON = "star";

export default function ShareAchievementSheet({
  achievement,
  referralCode = "",
  onClose,
  visible,
}: ShareAchievementSheetProps) {
  const userId = useAppSelector((s) => s.auth.user?.id ?? "");
  const [cardMeta, setCardMeta] = useState<{ gradient_start: string; gradient_end: string; icon: string } | null>(null);

  useEffect(() => {
    if (!visible || !userId) return;
    let cancelled = false;
    shareApi.getShareCard(userId, achievement.type)
      .then((r: any) => { if (!cancelled) setCardMeta(r.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [visible, userId, achievement.type]);

  const colors: [string, string] = cardMeta ? [cardMeta.gradient_start, cardMeta.gradient_end] : FALLBACK_COLORS;
  const iconName = cardMeta ? (ICON_NAME_MAP[cardMeta.icon] ?? FALLBACK_ICON) : FALLBACK_ICON;

  const shareUrl = referralCode
    ? `https://edulearn.app/join?ref=${referralCode}`
    : "https://edulearn.app";

  const shareMessage = `I just earned ${achievement.title} on EduLearn! Join me at ${shareUrl}`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: shareMessage,
        url: shareUrl,
        title: "EduLearn Achievement",
      });
    } catch {
      // user cancelled — ignore
    }
  };

  const handleWhatsApp = async () => {
    const encoded = encodeURIComponent(shareMessage);
    const url = `whatsapp://send?text=${encoded}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      // Fallback: open wa.me in browser
      await Linking.openURL(`https://wa.me/?text=${encoded}`);
    }
  };

  const handleCopyLink = async () => {
    try {
      // @react-native-clipboard/clipboard is an optional peer dep; try to import dynamically
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Clipboard = require("@react-native-clipboard/clipboard").default;
      Clipboard.setString(shareUrl);
    } catch {
      // Fallback: use native Share as copy alternative
      await Share.share({ message: shareUrl });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Sheet — stop press from propagating to backdrop */}
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Ionicons name="close" size={20} color="#6B7280" />
          </TouchableOpacity>

          {/* Achievement card */}
          <View style={[styles.card, { backgroundColor: colors[0] }]}>
            {/* Accent strip */}
            <View style={[styles.cardAccent, { backgroundColor: colors[1] }]} />

            {/* Platform label */}
            <Text style={styles.platformLabel}>EduLearn</Text>

            {/* Icon */}
            <View style={[styles.iconCircle, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
              <Ionicons name={iconName as any} size={36} color="#fff" />
            </View>

            {/* Achievement title */}
            <Text style={styles.achievementTitle}>{achievement.title}</Text>

            {/* Subtitle */}
            {achievement.subtitle ? (
              <Text style={styles.achievementSubtitle}>{achievement.subtitle}</Text>
            ) : null}

            {/* Tagline */}
            <Text style={styles.tagline}>Join me on EduLearn!</Text>

            {/* Referral code */}
            {referralCode ? (
              <Text style={styles.referralCode}>Use code: {referralCode}</Text>
            ) : null}
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnShare]} onPress={handleShare} activeOpacity={0.85}>
              <Ionicons name="share-social" size={18} color="#fff" />
              <Text style={styles.btnText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.btnWhatsApp]} onPress={handleWhatsApp} activeOpacity={0.85}>
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={styles.btnText}>Open WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.btnCopy]} onPress={handleCopyLink} activeOpacity={0.85}>
              <Ionicons name="copy-outline" size={18} color="#374151" />
              <Text style={[styles.btnText, { color: "#374151" }]}>Copy Link</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },
  closeBtn: {
    alignSelf: "flex-end",
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 20,
  },
  cardAccent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    opacity: 0.5,
  },
  platformLabel: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  achievementTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 20,
    textAlign: "center",
    marginBottom: 4,
  },
  achievementSubtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 6,
  },
  tagline: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
  },
  referralCode: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    marginTop: 4,
  },
  actions: {
    gap: 10,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  btnShare: {
    backgroundColor: palette.primary600,
  },
  btnWhatsApp: {
    backgroundColor: "#22C55E",
  },
  btnCopy: {
    backgroundColor: "#F3F4F6",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
