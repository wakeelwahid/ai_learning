import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { challengeApi } from "@/api/challenges";
import { useAppSelector } from "@/store";
import { palette, semantic, radius, spacing, typography, cardShadow } from "@/theme/colors";

interface ChallengeProgram {
  id: string;
  title: string;
  description: string | null;
  duration_days: number;
  badge_type: string | null;
  completion_xp: number;
  completion_ep: number;
  participant_count: number;
}

interface Enrollment {
  program_id: string;
  status: "active" | "completed" | "abandoned";
}

export default function ChallengesScreen() {
  const navigation = useNavigation<any>();
  const user = useAppSelector((s) => s.auth.user);

  const [programs, setPrograms] = useState<ChallengeProgram[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [progRes, enrollRes] = await Promise.allSettled([
        challengeApi.listPublished(),
        user?.id ? challengeApi.getMyEnrollments(user.id) : Promise.resolve(null),
      ]);
      if (progRes.status === "fulfilled") {
        const d = progRes.value.data;
        setPrograms(Array.isArray(d) ? d : []);
      }
      if (enrollRes.status === "fulfilled" && enrollRes.value) {
        const d = enrollRes.value.data;
        setEnrollments(Array.isArray(d) ? d : []);
      }
    } catch {
      Toast.show({ type: "error", text1: "Could not load challenges" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const enrollmentByProgram = new Map(enrollments.map((e) => [e.program_id, e]));

  const handleJoin = async (programId: string) => {
    setJoiningId(programId);
    try {
      await challengeApi.join(programId);
      Toast.show({ type: "success", text1: "You're in!", text2: "Let's start Day 1." });
      navigation.navigate("ChallengeDetail", { programId });
      fetchData();
    } catch {
      Toast.show({ type: "error", text1: "Could not join this challenge" });
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="flag" size={22} color="#fff" />
          <Text style={styles.headerTitle}>Challenges</Text>
        </View>
        <Text style={styles.headerSub}>Multi-day learning programs — earn XP, EduPoints & badges</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
      >
        {loading ? (
          <ActivityIndicator color={palette.primary600} style={{ marginTop: spacing["3xl"] }} />
        ) : programs.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="flag-outline" size={40} color={palette.gray300} />
            <Text style={styles.emptyTxt}>No challenges are live right now — check back soon!</Text>
          </View>
        ) : (
          programs.map((p) => {
            const enrollment = enrollmentByProgram.get(p.id);
            return (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.durationChip}>
                    <Ionicons name="calendar-outline" size={13} color={palette.primary600} />
                    <Text style={styles.durationChipTxt}>{p.duration_days} days</Text>
                  </View>
                  {enrollment?.status === "completed" && (
                    <View style={styles.completedChip}>
                      <Ionicons name="checkmark-circle" size={13} color={semantic.success.text} />
                      <Text style={styles.completedChipTxt}>Completed</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardTitle}>{p.title}</Text>
                {p.description && <Text style={styles.cardDesc} numberOfLines={2}>{p.description}</Text>}
                <View style={styles.rewardRow}>
                  <View style={styles.rewardItem}>
                    <Ionicons name="trophy-outline" size={14} color={palette.gray400} />
                    <Text style={styles.rewardTxt}>+{p.completion_xp} XP</Text>
                  </View>
                  <View style={styles.rewardItem}>
                    <Ionicons name="ribbon-outline" size={14} color={palette.gray400} />
                    <Text style={styles.rewardTxt}>+{p.completion_ep} EP</Text>
                  </View>
                  <View style={styles.rewardItem}>
                    <Ionicons name="people-outline" size={14} color={palette.gray400} />
                    <Text style={styles.rewardTxt}>{p.participant_count}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  disabled={joiningId === p.id}
                  onPress={() => enrollment ? navigation.navigate("ChallengeDetail", { programId: p.id }) : handleJoin(p.id)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.actionBtn, enrollment && styles.actionBtnSecondary]}>
                    {joiningId === p.id ? (
                      <ActivityIndicator color={enrollment ? palette.primary600 : "#fff"} size="small" />
                    ) : (
                      <Text style={[styles.actionBtnTxt, enrollment && styles.actionBtnTxtSecondary]}>
                        {enrollment ? (enrollment.status === "completed" ? "View Completed" : "Continue") : "Join Challenge"}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: palette.gray50 },
  header:            { paddingTop: spacing.lg, paddingHorizontal: spacing["2xl"], paddingBottom: spacing["3xl"], backgroundColor: palette.primary600 },
  backBtn:           { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  headerCenter:      { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  headerTitle:       { color: "#fff", ...typography.h1 },
  headerSub:         { color: "rgba(255,255,255,0.75)", fontSize: 13 },

  body:              { padding: spacing.lg },
  emptyWrap:         { alignItems: "center", marginTop: spacing["3xl"], gap: spacing.md },
  emptyTxt:          { fontSize: 13, color: palette.gray400, textAlign: "center" },

  card:              { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  cardTop:           { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  durationChip:      { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.primary50, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  durationChipTxt:   { fontSize: 11, fontWeight: "700", color: palette.primary600 },
  completedChip:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: semantic.success.bg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  completedChipTxt:  { fontSize: 11, fontWeight: "700", color: semantic.success.text },
  cardTitle:         { fontSize: 16, fontWeight: "800", color: palette.gray900, marginBottom: 4 },
  cardDesc:          { fontSize: 13, color: palette.gray500, marginBottom: spacing.md, lineHeight: 18 },
  rewardRow:         { flexDirection: "row", gap: spacing.lg, marginBottom: spacing.md },
  rewardItem:        { flexDirection: "row", alignItems: "center", gap: 4 },
  rewardTxt:         { fontSize: 12, color: palette.gray500, fontWeight: "600" },
  actionBtn:         { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary600, minHeight: 44 },
  actionBtnSecondary:{ backgroundColor: palette.primary50 },
  actionBtnTxt:      { color: "#fff", fontSize: 14, fontWeight: "700" },
  actionBtnTxtSecondary: { color: palette.primary600 },
});
