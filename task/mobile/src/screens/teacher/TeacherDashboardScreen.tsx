import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  SafeAreaView, StatusBar, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { analyticsApi } from "@/api/analytics";
import { contentApi } from "@/api/content";
import { errorDetail } from "@/api/errorDetail";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonBlock, SkeletonCard } from "@/components/ui/LoadingState";
import { palette, semantic, accentSolid, radius, spacing, typography, cardShadow } from "@/theme/colors";
import LiveClassSection from "./LiveClassSection";
import MyClassroomSection from "./MyClassroomSection";
import AssignmentsSection from "./AssignmentsSection";
import AnnouncementsSection from "./AnnouncementsSection";
import AttendanceSection from "./AttendanceSection";
import StudentSupportSection from "./StudentSupportSection";
import ParentConnectSection from "./ParentConnectSection";
import AITeachingAssistantSection from "./AITeachingAssistantSection";

const TABS = [
  { key: "students", label: "My Students" },
  { key: "assignments", label: "Assignments" },
  { key: "live", label: "Live Classes" },
  { key: "attendance", label: "Attendance" },
  { key: "analytics", label: "Analytics" },
  { key: "announcements", label: "Announcements" },
  { key: "support", label: "Student Support" },
  { key: "parent", label: "Parent Connect" },
  { key: "ai", label: "AI Assistant" },
] as const;
type TabKey = typeof TABS[number]["key"];

// Mirrors the shape returned by GET /v1/analytics/teacher/cohort
// (services/analytics_service/app/schemas/dashboard.py::TeacherCohortResponse).
// There is no teacher-student roster on this platform — "cohort" means every
// student profile set to this exact board + class_number.

interface CohortSubjectScoreItem {
  subject_id: string;
  avg_score: number;
  quizzes_completed: number;
  students_attempted: number;
}

interface CohortWeakTopicItem {
  topic_id: string;
  students_struggling: number;
  avg_accuracy: number;
}

interface TeacherCohortResponse {
  board: string;
  class_number: number;
  cohort_size: number;
  active_students: number;
  total_videos_watched: number;
  total_quizzes_completed: number;
  avg_quiz_score: number;
  subjects: CohortSubjectScoreItem[];
  weak_topics: CohortWeakTopicItem[];
}

interface ContentBoard { id: string; name: string; code: string }
interface ContentClass { id: string; name: string; number: number }
interface ContentSubject { id: string; name: string; code?: string }
interface ContentChapter { id: string; title: string }
interface ContentTopic { id: string; title: string }

const CLASS_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1);

// ─── Small building blocks (mirrors ParentDashboardScreen's conventions) ────

function ChipRow({ label, value, options, onSelect }: {
  label: string;
  value: string;
  options: (string | number)[];
  onSelect: (v: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <View style={s.chipBlock}>
      <Text style={s.chipLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {options.map((o) => {
          const val = String(o);
          const active = value === val;
          return (
            <TouchableOpacity
              key={val}
              style={[s.chip, active && s.chipActive]}
              activeOpacity={0.8}
              onPress={() => onSelect(val)}
            >
              <Text style={[s.chipTxt, active && s.chipTxtActive]}>{val}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <View style={s.barTrack}>
      <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}

const SUBJECT_COLORS = [accentSolid.indigo, semantic.success.solid, semantic.warning.solid, semantic.danger.solid, accentSolid.teal, accentSolid.cyan, accentSolid.rose, accentSolid.amber];

function SubjectRow({ name, item, color }: { name: string; item: CohortSubjectScoreItem; color: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={s.rowBetween}>
        <Text style={s.subjName} numberOfLines={1}>{name}</Text>
        <Text style={s.subjScore}>{Math.round(item.avg_score)}%</Text>
      </View>
      <ProgressBar value={item.avg_score} max={100} color={color} />
      <Text style={s.subjMeta} numberOfLines={1}>
        {item.quizzes_completed} {item.quizzes_completed === 1 ? "quiz" : "quizzes"} completed · {item.students_attempted} {item.students_attempted === 1 ? "student" : "students"} attempted
      </Text>
    </View>
  );
}

function accuracyColor(pct: number): string {
  if (pct < 35) return semantic.danger.solid;
  if (pct < 60) return semantic.warning.solid;
  return semantic.success.solid;
}

function WeakTopicRow({ name, item }: { name: string; item: CohortWeakTopicItem }) {
  return (
    <View style={s.rowCenter}>
      <View style={[s.weakBadge, { backgroundColor: accuracyColor(item.avg_accuracy) + "1a" }]}>
        <Text style={[s.weakBadgeTxt, { color: accuracyColor(item.avg_accuracy) }]}>{Math.round(item.avg_accuracy)}%</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
        <Text style={s.weakTopicName} numberOfLines={1}>{name}</Text>
        <ProgressBar value={item.avg_accuracy} max={100} color={accuracyColor(item.avg_accuracy)} />
      </View>
      <Text style={s.weakStruggling} numberOfLines={2}>
        {item.students_struggling} struggling
      </Text>
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <View style={s.tabBarWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[s.tabBtn, isActive && s.tabBtnActive]}
              activeOpacity={0.75}
              onPress={() => onChange(t.key)}
            >
              <Text style={[s.tabBtnTxt, isActive && s.tabBtnTxtActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function TeacherDashboardScreen() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("students");
  const [board, setBoard] = useState("");
  const [classNumber, setClassNumber] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data: boards = [] } = useQuery<ContentBoard[]>({
    queryKey: ["content-boards"],
    queryFn: () => contentApi.getBoards().then((r) => r.data),
    staleTime: 10 * 60_000,
  });
  const boardObj = boards.find((b) => b.name === board || b.code === board);

  // Default to the first board once boards load, so the teacher isn't
  // staring at an empty picker with no cohort to look at.
  React.useEffect(() => {
    if (!board && boards.length > 0) setBoard(boards[0].name);
  }, [board, boards]);

  const { data: classes = [] } = useQuery<ContentClass[]>({
    queryKey: ["content-classes", boardObj?.id],
    queryFn: () => contentApi.getClasses(boardObj!.id).then((r) => r.data),
    enabled: !!boardObj?.id,
    staleTime: 10 * 60_000,
  });
  const classObj = classes.find((c) => c.number === classNumber);

  const {
    data: cohort,
    isLoading: cohortLoading,
    isFetching: cohortFetching,
    error: cohortError,
    refetch: refetchCohort,
  } = useQuery<TeacherCohortResponse>({
    queryKey: ["teacher-cohort", board, classNumber],
    queryFn: () => analyticsApi.teacherCohort(board, classNumber!).then((r) => r.data),
    enabled: !!board && classNumber !== null,
  });

  // Subject-name resolution: same pattern as ParentDashboardScreen —
  // subjects for the picked board+class, keyed by id. A cohort subject_id
  // that doesn't match this class's current subject list (stale/other-class
  // history) is filtered out rather than shown as a raw UUID.
  const { data: subjectsData } = useQuery<ContentSubject[]>({
    queryKey: ["content-subjects", classObj?.id],
    queryFn: () => contentApi.getSubjects(classObj!.id).then((r) => r.data),
    enabled: !!classObj?.id,
    staleTime: 10 * 60_000,
  });
  const subjectNameById: Record<string, string> = {};
  for (const subj of subjectsData ?? []) subjectNameById[subj.id] = subj.name;

  const resolvedSubjects = (cohort?.subjects ?? []).filter((it) => subjectNameById[it.subject_id]);

  // Topic-name resolution: no board/class-wide topic lookup exists anywhere
  // in this platform's content API, so the only way to resolve a topic_id
  // to a display name is to walk subject -> chapters -> topics for the
  // subjects we already know belong to this board+class, and match ids.
  // Bounded to resolvedSubjects (not all 14 raw cohort subject_ids) to keep
  // the fan-out small — this mirrors how RevisionScreen already cascades
  // board->class->subject->chapter->topic client-side.
  const resolvedSubjectIds = resolvedSubjects.map((s) => s.subject_id);

  const { data: chapterLists = [] } = useQuery<ContentChapter[][]>({
    queryKey: ["teacher-chapters", resolvedSubjectIds.join(",")],
    queryFn: () => Promise.all(resolvedSubjectIds.map((id) => contentApi.getChapters(id).then((r) => r.data as ContentChapter[]))),
    enabled: resolvedSubjectIds.length > 0,
    staleTime: 10 * 60_000,
  });
  const chapterIds = chapterLists.flat().map((c) => c.id);

  const { data: topicLists = [] } = useQuery<ContentTopic[][]>({
    queryKey: ["teacher-topics", chapterIds.join(",")],
    queryFn: () => Promise.all(chapterIds.map((id) => contentApi.getTopics(id).then((r) => r.data as ContentTopic[]))),
    enabled: chapterIds.length > 0,
    staleTime: 10 * 60_000,
  });
  const topicNameById: Record<string, string> = {};
  for (const topic of topicLists.flat()) topicNameById[topic.id] = topic.title;

  const weakTopics = cohort?.weak_topics ?? [];
  const resolvedWeakTopics = [...weakTopics]
    .filter((t) => topicNameById[t.topic_id])
    .sort((a, b) => b.students_struggling - a.students_struggling);

  const loading = cohortLoading;
  const errorMessage = cohortError ? errorDetail(cohortError, "Couldn't reach the server. Please check your connection and try again.") : null;
  const noNetworkResponse = cohortError && !(cohortError as any)?.response;
  const cohortEmpty = !!cohort && cohort.cohort_size === 0;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchCohort(),
        qc.invalidateQueries({ queryKey: ["content-subjects", classObj?.id] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      <View style={s.header}>
        <Text style={s.headerTitle} numberOfLines={1}>My Classroom</Text>
        <Text style={s.headerSub} numberOfLines={2}>
          Everything about your students, in one place
        </Text>
      </View>

      <TabBar active={activeTab} onChange={setActiveTab} />

      <ScrollView
        style={s.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[palette.primary600]}
            tintColor={palette.primary600}
          />
        }
      >
        {activeTab === "students" && <MyClassroomSection />}
        {activeTab === "attendance" && <AttendanceSection />}
        {activeTab === "assignments" && <AssignmentsSection />}
        {activeTab === "live" && <LiveClassSection />}
        {activeTab === "announcements" && <AnnouncementsSection />}
        {activeTab === "support" && <StudentSupportSection />}
        {activeTab === "parent" && <ParentConnectSection />}
        {activeTab === "ai" && <AITeachingAssistantSection />}

        {activeTab === "analytics" && (
        <>
        <View style={s.card}>
          <Text style={s.cardTitle}>Pick a cohort</Text>
          <View style={{ marginTop: 8 }}>
            <ChipRow label="Board" value={board} options={boards.map((b) => b.name)} onSelect={(v) => { setBoard(v); setClassNumber(null); }} />
            <ChipRow label="Class" value={classNumber !== null ? String(classNumber) : ""} options={CLASS_NUMBERS} onSelect={(v) => setClassNumber(Number(v))} />
          </View>
        </View>

        {!board || classNumber === null ? (
          <View style={s.card}>
            <EmptyState
              icon="school-outline"
              title="Choose a board and class"
              description="Pick a board and class number above to see that cohort's analytics."
            />
          </View>
        ) : loading ? (
          <View style={{ gap: 12 }}>
            <View style={s.card}>
              <View style={s.statsGrid}>
                {[0, 1, 2, 3, 4].map((i) => <SkeletonBlock key={i} style={{ flexGrow: 1, flexBasis: "45%", minWidth: 100, height: 76, borderRadius: radius.lg - 2 }} />)}
              </View>
            </View>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : errorMessage ? (
          <View style={s.card}>
            <EmptyState
              icon={noNetworkResponse ? "cloud-offline-outline" : "alert-circle-outline"}
              title={noNetworkResponse ? "Can't reach the server" : "Something went wrong"}
              description={errorMessage}
              action={{ label: "Retry", onPress: () => refetchCohort() }}
            />
          </View>
        ) : cohortEmpty ? (
          <View style={s.card}>
            <EmptyState
              icon="people-outline"
              title="No students yet"
              description={`No student profiles are set to ${board} · Class ${classNumber} yet. Once students with this board and class enrol, their cohort analytics will show up here.`}
            />
          </View>
        ) : cohort ? (
          <>
            <View style={s.card}>
              <View style={s.rowBetween}>
                <Text style={s.cardTitle}>{cohort.board} · Class {cohort.class_number}</Text>
                {cohortFetching && !refreshing && <Ionicons name="sync" size={14} color={palette.gray400} />}
              </View>
              <View style={s.statsGrid}>
                <StatCard label="Cohort size" value={cohort.cohort_size} icon="people-outline" color={accentSolid.indigo} />
                <StatCard label="Active students" value={`${cohort.active_students}/${cohort.cohort_size}`} icon="pulse-outline" color={accentSolid.teal} />
                <StatCard label="Videos watched" value={cohort.total_videos_watched} icon="play-circle-outline" color={palette.primary500} />
                <StatCard label="Quizzes completed" value={cohort.total_quizzes_completed} icon="trophy-outline" color={semantic.warning.solid} />
                <StatCard label="Avg quiz score" value={`${Math.round(cohort.avg_quiz_score)}%`} icon="checkmark-circle-outline" color={semantic.success.solid} />
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>📊 Subject performance</Text>
              <View style={{ marginTop: 12 }}>
                {resolvedSubjects.length === 0 ? (
                  <EmptyState
                    icon="book-outline"
                    title="No subject data yet"
                    description="No quiz activity has been recorded for this cohort's current subjects yet."
                  />
                ) : (
                  resolvedSubjects
                    .slice()
                    .sort((a, b) => b.quizzes_completed - a.quizzes_completed)
                    .map((item, i) => (
                      <SubjectRow
                        key={item.subject_id}
                        name={subjectNameById[item.subject_id]}
                        item={item}
                        color={SUBJECT_COLORS[i % SUBJECT_COLORS.length]}
                      />
                    ))
                )}
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>⚠️ Weak topics</Text>
              <Text style={s.cardSub}>Ranked by how many students are struggling</Text>
              {weakTopics.length === 0 ? (
                <Text style={[s.emptyInline, { textAlign: "center", paddingVertical: 12 }]}>No weak topics identified for this cohort.</Text>
              ) : resolvedWeakTopics.length === 0 ? (
                <Text style={[s.emptyInline, { textAlign: "center", paddingVertical: 12 }]}>
                  {weakTopics.length} weak topic{weakTopics.length === 1 ? "" : "s"} found, but names couldn't be resolved from the current curriculum.
                </Text>
              ) : (
                <View style={{ marginTop: 10, gap: 12 }}>
                  {resolvedWeakTopics.map((item) => (
                    <WeakTopicRow key={item.topic_id} name={topicNameById[item.topic_id]} item={item} />
                  ))}
                </View>
              )}
            </View>
          </>
        ) : null}
        </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: palette.gray50 },
  container: { flex: 1 },

  header:       { backgroundColor: palette.primary600, paddingTop: spacing.sm, paddingBottom: spacing.lg, paddingHorizontal: spacing["2xl"] - 4 },
  headerTitle:  { color: "#fff", fontSize: typography.h1.fontSize, fontWeight: "800", letterSpacing: -0.5 },
  headerSub:    { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 4, lineHeight: 17 },

  tabBarWrap: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  tabBar:     { flexDirection: "row", gap: 6, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tabBtn:     { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: palette.gray50 },
  tabBtnActive: { backgroundColor: palette.primary600 },
  tabBtnTxt:  { fontSize: 12, fontWeight: "700", color: palette.gray600 },
  tabBtnTxtActive: { color: "#fff" },

  card:      { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  cardTitle: { fontSize: 14, fontWeight: "700", color: palette.gray800, flexShrink: 1 },
  cardSub:   { fontSize: 11, color: palette.gray400, marginTop: 2 },
  emptyInline: { fontSize: 12, color: palette.gray400 },

  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  rowCenter:  { flexDirection: "row", alignItems: "center" },

  chipBlock: { marginBottom: spacing.sm + 2 },
  chipLabel: { fontSize: 11, fontWeight: "700", color: palette.gray500, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  chipRow:   { flexDirection: "row", gap: 8 },
  chip:      { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 36, borderRadius: radius.pill, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
  chipActive:{ backgroundColor: palette.primary600 },
  chipTxt:      { fontSize: 12, fontWeight: "700", color: palette.gray600 },
  chipTxtActive:{ color: "#fff" },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  statCard:  { flexGrow: 1, flexBasis: "45%", minWidth: 100, backgroundColor: "#fff", borderRadius: radius.lg - 2, padding: spacing.md, alignItems: "center", gap: 5, borderWidth: 1, borderColor: palette.gray100 },
  statIcon:  { width: 36, height: 36, borderRadius: radius.sm + 3, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 15, fontWeight: "800", color: palette.gray800 },
  statLabel: { fontSize: 10, color: palette.gray500, fontWeight: "600" },

  barTrack: { height: 6, backgroundColor: palette.gray100, borderRadius: 3, overflow: "hidden" },
  barFill:  { height: "100%", borderRadius: 3 },

  subjName:  { fontSize: 12, fontWeight: "600", color: palette.gray700, flex: 1 },
  subjScore: { fontSize: 13, fontWeight: "800", color: palette.gray900, width: 40, textAlign: "right" },
  subjMeta:  { fontSize: 10, color: palette.gray400, marginTop: 4 },

  weakBadge:      { width: 42, height: 34, borderRadius: radius.sm + 2, alignItems: "center", justifyContent: "center" },
  weakBadgeTxt:   { fontSize: 11, fontWeight: "800" },
  weakTopicName:  { fontSize: 12, fontWeight: "600", color: palette.gray700, marginBottom: 4 },
  weakStruggling: { fontSize: 10, fontWeight: "700", color: palette.gray500, marginLeft: 8, width: 64, textAlign: "right" },
});
