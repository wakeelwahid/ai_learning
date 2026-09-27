import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { challengeApi } from "@/api/challenges";
import { contentApi } from "@/api/content";
import { useAppSelector } from "@/store";
import { palette, semantic, radius, spacing, typography, cardShadow } from "@/theme/colors";

type TaskType = "video" | "quiz" | "practice" | "battle" | "study_session";

interface TaskProgress {
  id: string;
  task_type: TaskType;
  content_ref: string;
  title: string;
  is_required: boolean;
  xp_reward: number;
  ep_reward: number;
  is_completed: boolean;
}

interface DayProgress {
  id: string;
  day_number: number;
  title: string | null;
  tasks: TaskProgress[];
}

interface EnrollmentProgress {
  program_id: string;
  program_title: string;
  status: "active" | "completed" | "abandoned";
  current_day: number;
  completion_xp: number;
  completion_ep: number;
  badge_type: string | null;
  days: DayProgress[];
}

const TASK_ICON: Record<TaskType, keyof typeof Ionicons.glyphMap> = {
  video: "play-circle-outline",
  quiz: "help-circle-outline",
  practice: "barbell-outline",
  battle: "flash-outline",
  study_session: "book-outline",
};

export default function ChallengeDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { programId } = route.params ?? {};
  const user = useAppSelector((s) => s.auth.user);

  const [enrollment, setEnrollment] = useState<EnrollmentProgress | null>(null);
  const [programInfo, setProgramInfo] = useState<{ title: string; description: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [notEnrolled, setNotEnrolled] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id || !programId) return;
    try {
      const res = await challengeApi.getEnrollment(user.id, programId);
      setEnrollment(res.data);
      setNotEnrolled(false);
    } catch {
      setNotEnrolled(true);
      try {
        const progRes = await challengeApi.getById(programId);
        setProgramInfo(progRes.data);
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [user?.id, programId]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const handleJoin = async () => {
    setJoining(true);
    try {
      await challengeApi.join(programId);
      Toast.show({ type: "success", text1: "You're in!", text2: "Let's start Day 1." });
      fetchData();
    } catch {
      Toast.show({ type: "error", text1: "Could not join this challenge" });
    } finally {
      setJoining(false);
    }
  };

  const handleTaskPress = async (task: TaskProgress) => {
    switch (task.task_type) {
      case "video":
        try {
          const res = await contentApi.getVideoById(task.content_ref);
          navigation.navigate("VideoPlayer", { video: res.data });
        } catch {
          Toast.show({ type: "error", text1: "Could not load this video" });
        }
        break;
      case "quiz":
      case "practice":
        navigation.navigate("Quiz", { quizId: task.content_ref, title: task.title });
        break;
      case "battle":
        navigation.navigate("Battle");
        break;
      case "study_session":
        navigation.navigate("Revision");
        break;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={palette.primary600} style={{ marginTop: spacing["3xl"] }} />
      </SafeAreaView>
    );
  }

  if (notEnrolled) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Ionicons name="flag" size={22} color="#fff" />
            <Text style={styles.headerTitle}>{programInfo?.title ?? "Challenge"}</Text>
          </View>
        </View>
        <View style={styles.joinWrap}>
          {programInfo?.description && <Text style={styles.joinDesc}>{programInfo.description}</Text>}
          <TouchableOpacity onPress={handleJoin} disabled={joining} activeOpacity={0.85}>
            <View style={styles.joinBtn}>
              {joining ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.joinBtnTxt}>Join Challenge</Text>}
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!enrollment) return null;
  const sortedDays = [...enrollment.days].sort((a, b) => a.day_number - b.day_number);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="flag" size={22} color="#fff" />
          <Text style={styles.headerTitle}>{enrollment.program_title}</Text>
        </View>
        <View style={styles.headerRewardRow}>
          <Text style={styles.headerReward}>🏆 +{enrollment.completion_xp} XP</Text>
          <Text style={styles.headerReward}>🎖 +{enrollment.completion_ep} EP</Text>
          {enrollment.badge_type && <Text style={styles.headerReward}>🏅 {enrollment.badge_type}</Text>}
        </View>
        {enrollment.status === "completed" && (
          <View style={styles.completedBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={styles.completedBannerTxt}>Challenge Completed!</Text>
          </View>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        {sortedDays.map((day, i) => {
          const isLast = i === sortedDays.length - 1;
          const locked = day.day_number > enrollment.current_day;
          const dayComplete = day.tasks.filter((t) => t.is_required).every((t) => t.is_completed);

          return (
            <View key={day.id} style={styles.dayRow}>
              <View style={styles.dayLeft}>
                <View style={[
                  styles.dayBadge,
                  dayComplete ? styles.dayBadgeDone : locked ? styles.dayBadgeLocked : styles.dayBadgeActive,
                ]}>
                  {dayComplete ? (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  ) : locked ? (
                    <Ionicons name="lock-closed" size={14} color={palette.gray400} />
                  ) : (
                    <Text style={styles.dayBadgeNum}>{day.day_number}</Text>
                  )}
                </View>
                {!isLast && <View style={styles.dayConnector} />}
              </View>

              <View style={[styles.dayCard, locked && styles.dayCardLocked]}>
                <Text style={styles.dayTitle}>
                  Day {day.day_number}{day.title ? ` — ${day.title}` : ""}
                </Text>
                {day.tasks.map((task) => {
                  const clickable = !locked && !task.is_completed;
                  return (
                    <TouchableOpacity
                      key={task.id}
                      disabled={!clickable}
                      activeOpacity={0.7}
                      onPress={() => handleTaskPress(task)}
                    >
                      <View style={[styles.taskRow, task.is_completed && styles.taskRowDone]}>
                        <Ionicons
                          name={TASK_ICON[task.task_type]}
                          size={16}
                          color={task.is_completed ? semantic.success.text : palette.primary600}
                        />
                        <Text style={[styles.taskTxt, task.is_completed && styles.taskTxtDone]} numberOfLines={1}>
                          {task.title}
                        </Text>
                        {task.is_required && !task.is_completed && (
                          <View style={styles.requiredTag}>
                            <Text style={styles.requiredTagTxt}>required</Text>
                          </View>
                        )}
                        {task.is_completed ? (
                          <Ionicons name="checkmark-circle" size={16} color={semantic.success.text} />
                        ) : locked ? (
                          <Ionicons name="lock-closed" size={13} color={palette.gray300} />
                        ) : (
                          <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}

        <Text style={styles.footerNote}>
          Task completion updates automatically once you finish the real activity — there's no manual "mark complete" button.
        </Text>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: palette.gray50 },
  header:            { paddingTop: spacing.lg, paddingHorizontal: spacing["2xl"], paddingBottom: spacing.xl, backgroundColor: palette.primary600 },
  backBtn:           { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  headerCenter:      { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  headerTitle:       { color: "#fff", ...typography.h1, flexShrink: 1 },
  headerRewardRow:   { flexDirection: "row", gap: spacing.md },
  headerReward:      { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
  completedBanner:   { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, marginTop: spacing.sm, alignSelf: "flex-start" },
  completedBannerTxt:{ color: "#fff", fontSize: 12, fontWeight: "700" },

  joinWrap:          { padding: spacing["2xl"], alignItems: "center", gap: spacing.lg, marginTop: spacing["2xl"] },
  joinDesc:          { fontSize: 14, color: palette.gray500, textAlign: "center" },
  joinBtn:           { backgroundColor: palette.primary600, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing["3xl"], minHeight: 44, alignItems: "center", justifyContent: "center" },
  joinBtnTxt:        { color: "#fff", fontSize: 15, fontWeight: "700" },

  body:              { padding: spacing.lg },
  dayRow:            { flexDirection: "row" },
  dayLeft:           { alignItems: "center", marginRight: spacing.md, width: 32 },
  dayBadge:          { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  dayBadgeDone:      { backgroundColor: semantic.success.solid },
  dayBadgeLocked:    { backgroundColor: palette.gray100 },
  dayBadgeActive:    { backgroundColor: palette.primary100 },
  dayBadgeNum:       { fontSize: 13, fontWeight: "800", color: palette.primary600 },
  dayConnector:      { width: 2, flex: 1, minHeight: 24, backgroundColor: palette.gray200, marginVertical: spacing.xs },

  dayCard:           { flex: 1, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  dayCardLocked:     { opacity: 0.55 },
  dayTitle:          { fontSize: 14, fontWeight: "700", color: palette.gray900, marginBottom: spacing.sm },

  taskRow:           { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: palette.gray50, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, marginBottom: spacing.xs, minHeight: 40 },
  taskRowDone:       { backgroundColor: semantic.success.bg },
  taskTxt:           { flex: 1, fontSize: 13, color: palette.gray700, fontWeight: "500" },
  taskTxtDone:       { color: palette.gray400, textDecorationLine: "line-through" },
  requiredTag:       { backgroundColor: palette.primary50, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  requiredTagTxt:    { fontSize: 9, fontWeight: "700", color: palette.primary600 },

  footerNote:        { fontSize: 11, color: palette.gray400, textAlign: "center", marginTop: spacing.md, lineHeight: 16 },

});
