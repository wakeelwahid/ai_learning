import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { getFriendActivityOf } from "@/api/gamification";
import { palette, radius, cardShadow, cardShadowElevated } from "@/theme/colors";

// ─── Types (gamification_service ActivityFeedEntry) ───────────────────────────

interface ActivityEntry {
  id: string;
  user_id: string;
  activity_type: "quiz_completed" | "battle_won" | "level_up" | "badge_earned" | "daily_goal_completed";
  title: string;
  subject?: string | null;
  score_pct?: number | null;
  xp_earned?: number | null;
  created_at: string;
  user_name?: string | null;
  user_avatar?: string | null;
}

const TYPE_CFG: Record<ActivityEntry["activity_type"], { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  quiz_completed:       { icon: "checkmark-circle", color: "#10B981" },
  battle_won:           { icon: "trophy",           color: "#F59E0B" },
  level_up:             { icon: "trending-up",      color: "#6366F1" },
  badge_earned:         { icon: "ribbon",           color: "#8B5CF6" },
  daily_goal_completed: { icon: "flag",             color: "#0D9488" },
};

function activityText(item: ActivityEntry): string {
  switch (item.activity_type) {
    case "quiz_completed":
      return item.score_pct != null
        ? `Scored ${item.score_pct}% in ${item.title}`
        : `Completed ${item.title}`;
    case "battle_won":
      return `Won a ${item.subject ? item.subject + " " : ""}Battle`;
    case "level_up":
      return `Reached ${item.title}`;
    case "badge_earned":
      return `Earned the ${item.title} badge`;
    case "daily_goal_completed":
      return `Completed today's goal: ${item.title}`;
    default:
      return item.title;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Yesterday" : `${d}d ago`;
}

interface Props {
  visible: boolean;
  friendId: string;
  friendName: string;
  onClose: () => void;
}

// A friend's recent activity timeline — opened by tapping their name in a
// 1:1 chat. Data comes from the friendship-gated backend endpoint; a 403
// (not friends) is surfaced with the server's own message.
export default function FriendActivityModal({ visible, friendId, friendName, onClose }: Props) {
  const { data, isLoading, isError, error, refetch } = useQuery<ActivityEntry[]>({
    queryKey: ["friend-activity-of", friendId],
    queryFn: () => getFriendActivityOf(friendId, 30).then((r) => r.data ?? []),
    enabled: visible && !!friendId,
    staleTime: 30_000,
  });

  const errDetail =
    (error as any)?.response?.data?.detail ?? "Couldn't load this friend's activity.";
  const avatar = data?.[0]?.user_avatar ?? null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{(friendName || "?").charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.headerName} numberOfLines={1}>{friendName}</Text>
              <Text style={styles.headerSub}>Recent activity</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={palette.gray500} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={palette.primary600} />
            </View>
          ) : isError ? (
            <View style={styles.centered}>
              <Ionicons name="lock-closed-outline" size={36} color={palette.gray400} />
              <Text style={styles.stateTxt}>{errDetail}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
                <Text style={styles.retryBtnTxt}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (data ?? []).length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="pulse-outline" size={36} color={palette.gray400} />
              <Text style={styles.stateTxt}>No recent activity yet.</Text>
            </View>
          ) : (
            <FlatList
              data={data}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const cfg = TYPE_CFG[item.activity_type] ?? TYPE_CFG.quiz_completed;
                return (
                  <View style={styles.row}>
                    <View style={[styles.rowIcon, { backgroundColor: cfg.color + "18" }]}>
                      <Ionicons name={cfg.icon} size={18} color={cfg.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{activityText(item)}</Text>
                      <View style={styles.rowMeta}>
                        {item.xp_earned != null && item.xp_earned > 0 && (
                          <View style={styles.xpPill}>
                            <Text style={styles.xpPillTxt}>+{item.xp_earned} XP</Text>
                          </View>
                        )}
                        <Text style={styles.rowTime}>{timeAgo(item.created_at)}</Text>
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "75%",
    minHeight: 320,
    ...cardShadowElevated,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 17, fontWeight: "800", color: palette.primary600 },
  headerName: { fontSize: 15, fontWeight: "800", color: palette.gray900 },
  headerSub: { fontSize: 12, color: palette.gray400, marginTop: 1 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: palette.gray100,
    alignItems: "center", justifyContent: "center",
  },

  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32, minHeight: 200 },
  stateTxt: { fontSize: 13, color: palette.gray500, textAlign: "center", lineHeight: 19 },
  retryBtn: { backgroundColor: palette.primary50, borderRadius: radius.md, paddingHorizontal: 22, paddingVertical: 9 },
  retryBtnTxt: { fontSize: 13, fontWeight: "700", color: palette.primary600 },

  listContent: { padding: 14, gap: 10, paddingBottom: 30 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: palette.gray100,
    borderRadius: radius.lg,
    padding: 12,
    ...cardShadow,
  },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 13, fontWeight: "700", color: palette.gray900, lineHeight: 18 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  xpPill: { backgroundColor: palette.primary50, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  xpPillTxt: { fontSize: 10, fontWeight: "800", color: palette.primary600 },
  rowTime: { fontSize: 11, color: palette.gray400 },
});
