import React, { useMemo, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  SafeAreaView, StatusBar, ActivityIndicator, Modal, RefreshControl, Alert, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { useAppSelector } from "@/store";
import { parentApi, type ApprovalRequest } from "@/api/parent";
import { errorDetail } from "@/api/errorDetail";
import { contentApi } from "@/api/content";
import { paymentApi } from "@/api/payment";
import { useLinkedChild, type StudentLink } from "@/hooks/useLinkedChild";
import { useLinkBadges } from "@/hooks/useLinkBadges";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import type { TranslationKey } from "@/i18n/translations";
import { formatDayMonYear } from "@/utils/dates";
import { PendingApprovalState, PendingBadge } from "@/components/parent/PendingApproval";
import ApprovalModeSwitch from "@/components/parent/ApprovalModeSwitch";
import CashfreeCheckout, { CashfreeMode } from "@/components/CashfreeCheckout";
import PaymentMethodSheet from "@/components/PaymentMethodSheet";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import { palette, semantic, accentSolid, radius, spacing, typography, cardShadow } from "@/theme/colors";

// Mirrors frontend/src/pages/parent/ParentDashboardPage.tsx

// ─── Types ──────────────────────────────────────────────────────────────────

interface Plan {
  plan_key: string;
  name: string;
  price: number;
  duration_days: number;
  badge: string | null;
  description: string | null;
  is_popular: boolean;
}

interface SubjectScoreItem {
  subject_id: string;
  avg_score: number;
  quizzes_completed: number;
}

interface WeakTopicItem {
  topic_id: string;
  accuracy: number;
  attempts: number;
}

// See services/analytics_service/app/schemas/dashboard.py —
// ParentStudentSummaryResponse. Fields stay null only when truly
// uncomputable, with the reason in `insufficient_data_fields`.
interface StudentSummary {
  total_videos_watched: number;
  total_quizzes_completed: number;
  avg_quiz_score: number;
  subjects: SubjectScoreItem[];
  weak_topics: WeakTopicItem[];

  overall_performance: number | null;
  attendance: number | null;
  study_hours_week: number | null;
  rank_percentile: number | null;
  activity_week: { day: string; minutes: number }[] | null;
  activity_today: { videos_watched: number; quizzes_completed: number; study_minutes: number } | null;
  weekly_report: { study_hours: number; videos_watched: number; notes_read: number; quiz_score_avg: number; rank_percentile: number | null } | null;
  monthly_trends: { study_hours: number[]; quiz_scores: number[]; months?: string[] } | null;
  ai_insights: string[] | null;
  exam_readiness: Record<string, number> | null;

  insufficient_data_fields: Record<string, string>;
}

const EMPTY_SUMMARY: StudentSummary = {
  total_videos_watched: 0, total_quizzes_completed: 0, avg_quiz_score: 0,
  subjects: [], weak_topics: [],
  overall_performance: null, attendance: null, study_hours_week: null, rank_percentile: null,
  activity_week: null, activity_today: null, weekly_report: null, monthly_trends: null,
  ai_insights: null, exam_readiness: null,
  insufficient_data_fields: {},
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DAYS_FILTER_OPTIONS: { value: 1 | 7 | 30 | 90 | 365; label: string }[] = [
  { value: 1,   label: "Today" },
  { value: 7,   label: "7d" },
  { value: 30,  label: "30d" },
  { value: 90,  label: "90d" },
  { value: 365, label: "1Y" },
];

const PAGE_SIZE = 10;

type TabKey = "overview" | "activity" | "reports" | "readiness";

const TABS: { key: TabKey; labelKey: TranslationKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "overview",  labelKey: "overview", icon: "bar-chart-outline" },
  { key: "activity",  labelKey: "activity", icon: "pulse-outline" },
  { key: "reports",   labelKey: "report",   icon: "calendar-outline" },
  { key: "readiness", labelKey: "ready",    icon: "school-outline" },
];

interface QuickAction {
  labelKey: TranslationKey;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  tab?: string;
  screen?: string;
}

// Only actions NOT already reachable elsewhere belong here — Monitor/AI
// Chat/Messages/Profile(Settings) are real PARENT_TABS entries in
// MainNavigator.tsx; Link Student has several entry points already
// (ParentSettingsScreen, this Dashboard's own linking banners); Communication
// moved to ParentSettingsScreen's Preferences section as its one entry point.
const QUICK_ACTIONS: QuickAction[] = [
  { labelKey: "bookMeeting",   icon: "calendar",          screen: "ParentMeetings",        color: accentSolid.teal },
  { labelKey: "studyLimits",   icon: "time",              screen: "StudyLimits",           color: semantic.warning.solid },
];

// ─── Small components ───────────────────────────────────────────────────────

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

const SUBJECT_COLORS = [accentSolid.indigo, semantic.success.solid, semantic.warning.solid, semantic.danger.solid, accentSolid.teal, accentSolid.cyan];

function SubjectBar({ name, score, color }: { name: string; score: number; color: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={s.rowBetween}>
        <Text style={s.subjName} numberOfLines={1}>{name}</Text>
        <Text style={s.subjScore}>{Math.round(score)}%</Text>
      </View>
      <ProgressBar value={score} max={100} color={color} />
    </View>
  );
}

const BAR_MAX_HEIGHT = 84;

function BarChart({ items, color, unit }: { items: { label: string; value: number }[]; color: string; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  // A 90-day filter can return up to 31 points — squeezing all of them into
  // equal `flex: 1` columns on a narrow phone (down to the 270px minimum
  // this screen supports) makes every bar/label illegible. Past 14 items,
  // give each column a fixed minimum width and let the row scroll
  // horizontally instead.
  const scrollable = items.length > 14;
  const row = (
    <View style={[s.chartRow, scrollable && { justifyContent: "flex-start" }]}>
      {items.map((it, i) => (
        <View
          key={`${it.label}-${i}`}
          style={scrollable ? s.chartColFixed : s.chartCol}
        >
          <Text style={s.chartValue} numberOfLines={1}>{Math.round(it.value)}{unit ?? ""}</Text>
          <View style={s.chartTrack}>
            <View style={[s.chartBar, { height: Math.max(3, (it.value / max) * BAR_MAX_HEIGHT), backgroundColor: color }]} />
          </View>
          <Text style={s.chartLabel} numberOfLines={1}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
  if (!scrollable) return row;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
      {row}
    </ScrollView>
  );
}

function GroupedBarChart({ labels, a, b, colorA, colorB }: { labels: string[]; a: number[]; b: number[]; colorA: string; colorB: string }) {
  const maxA = Math.max(1, ...a);
  const maxB = Math.max(1, ...b);
  return (
    <View style={s.chartRow}>
      {labels.map((label, i) => (
        <View key={`${label}-${i}`} style={s.chartCol}>
          <View style={[s.chartTrack, { flexDirection: "row", alignItems: "flex-end", gap: 2 }]}>
            <View style={[s.chartBar, { flex: 1, height: Math.max(3, ((a[i] ?? 0) / maxA) * BAR_MAX_HEIGHT), backgroundColor: colorA }]} />
            <View style={[s.chartBar, { flex: 1, height: Math.max(3, ((b[i] ?? 0) / maxB) * BAR_MAX_HEIGHT), backgroundColor: colorB }]} />
          </View>
          <Text style={s.chartLabel} numberOfLines={1}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function readinessMeta(score: number, t: (k: TranslationKey) => string): { label: string; color: string } {
  if (score >= 80) return { label: t("readyLabel"), color: semantic.success.solid };
  if (score >= 60) return { label: t("almostReady"), color: semantic.warning.solid };
  return { label: t("needsPrep"), color: semantic.danger.solid };
}

interface ChildSummaryItem {
  student_id: string;
  total_videos_watched: number;
  total_quizzes_completed: number;
  avg_quiz_score: number;
  attendance: number;
  weak_topic_count: number;
}

/** Side-by-side comparison across every linked child — mirrors web's
 * AllChildrenSummaryCard in frontend/src/pages/parent/ParentDashboardPage.tsx.
 * Only rendered when a parent has more than one child, so a single-child
 * parent's screen is unchanged. */
function AllChildrenSummaryCard({ studentIds, students }: { studentIds: string[]; students: StudentLink[] }) {
  const { t } = useLanguage();
  const { data } = useQuery({
    queryKey: ["parent-children-summary", studentIds],
    queryFn: () => parentApi.childrenSummary(studentIds, 30).then((r) => r.data.children as ChildSummaryItem[]),
    enabled: studentIds.length > 1,
  });

  const nameFor = (id: string) => students.find((c) => c.student_user_id === id)?.student_name ?? t("student");
  const rows = data ?? [];

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{t("allChildrenLast30")}</Text>
      {rows.length === 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          {studentIds.map((id) => (
            <View key={id} style={s.childSummarySkeleton} />
          ))}
        </ScrollView>
      ) : (
        <View style={{ marginTop: 12, gap: 8 }}>
          {rows.map((row) => (
            <View key={row.student_id} style={s.childSummaryRow}>
              <Text style={s.childSummaryName} numberOfLines={1}>{nameFor(row.student_id)}</Text>
              <View style={s.childSummaryStats}>
                <Text style={s.childSummaryStat}>
                  <Text style={s.childSummaryStatValue}>{Math.round(row.avg_quiz_score)}%</Text> {t("avgQuizScoreShort")}
                </Text>
                <Text style={s.childSummaryStat}>
                  <Text style={s.childSummaryStatValue}>{row.attendance}%</Text> {t("attendance")}
                </Text>
                {row.weak_topic_count > 0 && (
                  <Text style={[s.childSummaryStat, { color: semantic.danger.solid }]}>
                    <Text style={[s.childSummaryStatValue, { color: semantic.danger.solid }]}>{row.weak_topic_count}</Text> {t("weakTopicsShort")}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function ParentDashboardScreen() {
  const navigation = useNavigation<any>();
  const { t } = useLanguage();
  const user = useAppSelector((st) => st.auth.user);
  const parentId = user?.id ?? "";
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [payingPlan, setPayingPlan] = useState<string | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<{ paymentSessionId: string; mode: CashfreeMode } | null>(null);
  const [checkoutOrderId, setCheckoutOrderId] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [methodSheetOrder, setMethodSheetOrder] = useState<{ planKey: string; orderId: string } | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<ApprovalRequest | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["plans"],
    queryFn: () => paymentApi.plans().then((r) => r.data),
  });

  const {
    children: students, child: selChild, selectedChildId, selectChild,
    isLoading: studentsLoading, refetch: refetchStudents,
  } = useLinkedChild();
  const isApproved = selChild?.is_approved === true;
  const isRealParent = UUID_RE.test(parentId);
  const approvedChildIds = useMemo(
    () => students.filter((c) => c.is_approved && UUID_RE.test(c.student_user_id)).map((c) => c.student_user_id),
    [students],
  );
  const { pendingOutgoing, pendingApprovals } = useLinkBadges();

  const { data: pendingRequests = [], refetch: refetchPending } = useQuery<ApprovalRequest[]>({
    queryKey: ["parent-approvals-pending", parentId],
    queryFn: () => parentApi.pendingApprovals().then((r) => (Array.isArray(r.data) ? r.data : [])),
    enabled: isRealParent,
    refetchInterval: 60_000,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const childId = selChild?.student_user_id;
      await Promise.all([
        refetchStudents(),
        refetchPending(),
        qc.invalidateQueries({ queryKey: ["link-badges", parentId] }),
        ...(childId && isApproved
          ? [
              qc.invalidateQueries({ queryKey: ["parent-summary", childId] }),
              qc.invalidateQueries({ queryKey: ["student-assignments", childId] }),
              qc.invalidateQueries({ queryKey: ["study-limit", childId, parentId] }),
              qc.invalidateQueries({ queryKey: ["student-sub", childId] }),
            ]
          : []),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const [summaryDays, setSummaryDays] = useState<1 | 7 | 30 | 90 | 365>(7);
  const [weakTopicsPage, setWeakTopicsPage] = useState(0);

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["parent-summary", selChild?.student_user_id, summaryDays],
    queryFn: () => parentApi.studentSummary(selChild!.student_user_id, summaryDays).then((r) => r.data),
    enabled: isApproved,
  });
  const summary: StudentSummary = summaryData ?? EMPTY_SUMMARY;
  const weakTopicsTotalPages = Math.max(1, Math.ceil(summary.weak_topics.length / PAGE_SIZE));
  const clampedWeakTopicsPage = Math.min(weakTopicsPage, weakTopicsTotalPages - 1);
  const reasons = summary.insufficient_data_fields ?? {};

  const { data: boardsData } = useQuery({
    queryKey: ["content-boards"],
    queryFn: () => contentApi.getBoards().then((r) => r.data as { id: string; name: string; code: string }[]),
    staleTime: 10 * 60_000,
  });
  const childBoard = boardsData?.find(
    (b) => b.code?.toLowerCase() === (selChild?.student_board ?? "").toLowerCase()
      || b.name?.toLowerCase() === (selChild?.student_board ?? "").toLowerCase()
  );
  const { data: classesData } = useQuery({
    queryKey: ["content-classes", childBoard?.id],
    queryFn: () => contentApi.getClasses(childBoard!.id).then((r) => r.data as { id: string; name: string; number: number }[]),
    enabled: !!childBoard?.id,
    staleTime: 10 * 60_000,
  });
  const childClass = classesData?.find((c) => c.number === selChild?.student_class);
  const { data: subjectsData } = useQuery({
    queryKey: ["content-subjects", childClass?.id],
    queryFn: () => contentApi.getSubjects(childClass!.id).then((r) => r.data as { id: string; name: string }[]),
    enabled: !!childClass?.id,
    staleTime: 10 * 60_000,
  });
  const subjectNameById: Record<string, string> = {};
  for (const subj of subjectsData ?? []) subjectNameById[subj.id] = subj.name;

  const resolvedSubjects = summary.subjects.filter((subj) => subjectNameById[subj.subject_id]);

  const { data: assignmentsData } = useQuery({
    queryKey: ["student-assignments", selChild?.student_user_id],
    queryFn: () => contentApi.studentAssignments(selChild!.student_user_id).then((r) => r.data),
    enabled: isApproved,
  });
  const assignmentsDoneCount: number | undefined = assignmentsData
    ? assignmentsData.completed
    : undefined;

  const { data: studyLimitData } = useQuery({
    queryKey: ["study-limit", selChild?.student_user_id, parentId],
    queryFn: () =>
      parentApi.getStudyLimits(selChild!.student_user_id, parentId)
        .then((r) => r.data as { daily_limit_minutes: number | null; is_enabled: boolean; used_today_minutes?: number | null }),
    enabled: isApproved && isRealParent,
    refetchInterval: 60_000,
  });
  const limitMinutes = studyLimitData?.daily_limit_minutes ?? null;
  const limitEnabled = studyLimitData?.is_enabled ?? false;
  const usedToday = typeof studyLimitData?.used_today_minutes === "number" ? studyLimitData.used_today_minutes : null;

  const { data: studentSub } = useQuery({
    queryKey: ["student-sub", selChild?.student_user_id],
    queryFn: () => paymentApi.parentStudentSubscription(selChild!.student_user_id).then((r) => r.data),
    enabled: isApproved,
    staleTime: 60000,
  });
  const subPlan: string = studentSub?.plan ?? "free";
  const subActive: boolean = studentSub?.is_active ?? false;
  const daysLeft: number | null = studentSub?.days_until_expiry ?? null;
  const expiryWarn: boolean = studentSub?.expiry_warning ?? false;

  const childFirstName = selChild?.student_name?.split(" ")[0] ?? t("yourChild");
  const planTitle = subPlan.charAt(0).toUpperCase() + subPlan.slice(1);
  const linkedSince = isApproved ? formatDayMonYear(selChild?.approved_at) : "";

  // ── Purchase approval decisions ─────────────────────────────────────────
  const decide = async (req: ApprovalRequest, status: "approved" | "rejected", note?: string) => {
    if (decidingId) return;
    setDecidingId(req.id);
    try {
      await parentApi.decideApproval(req.id, note?.trim() ? { status, note: note.trim() } : { status });
      Toast.show({ type: "success", text1: status === "approved" ? t("requestApproved") : t("requestDeclined") });
      await Promise.all([
        refetchPending(),
        qc.invalidateQueries({ queryKey: ["link-badges", parentId] }),
      ]);
    } catch (err: any) {
      Toast.show({ type: "error", text1: t("couldNotUpdateRequest"), text2: errorDetail(err, t("pleaseTryAgain")) });
    } finally {
      setDecidingId(null);
      setDeclineTarget(null);
      setDeclineNote("");
    }
  };

  const startDecline = (req: ApprovalRequest) => {
    const body = fmt(t("declineNoteBody"), { name: req.student_name ?? t("yourChild") });
    if (Platform.OS === "ios" && typeof (Alert as any).prompt === "function") {
      Alert.prompt(
        t("declineNoteTitle"),
        body,
        [
          { text: t("cancel"), style: "cancel" },
          { text: t("decline"), style: "destructive", onPress: (note?: string) => decide(req, "rejected", note) },
        ],
        "plain-text",
      );
      return;
    }
    setDeclineNote("");
    setDeclineTarget(req);
  };

  // ── Parent-pays subscription handler ────────────────────────────────────
  const handleParentSubscribe = async (plan: string) => {
    if (!selChild?.student_user_id || !isApproved) return;
    setPayingPlan(plan);
    try {
      const { data } = await paymentApi.parentCreateOrder(selChild.student_user_id, plan);

      if (data.key === "test_mode") {
        setMethodSheetOrder({ planKey: plan, orderId: data.order_id });
        setPayingPlan(null);
        return;
      }

      setCheckoutPlan(plan);
      setCheckoutOrderId(data.order_id);
      setCheckoutSession({ paymentSessionId: data.payment_session_id, mode: data.key as CashfreeMode });
    } catch (err: any) {
      Toast.show({ type: "error", text1: t("couldNotStartCheckout"), text2: errorDetail(err, t("pleaseTryAgain")) });
    } finally {
      setPayingPlan(null);
    }
  };

  const handleMethodSelected = async (method: string) => {
    const order = methodSheetOrder;
    setMethodSheetOrder(null);
    if (!selChild?.student_user_id || !order) return;
    try {
      const { data: verifyData } = await paymentApi.parentVerifyPayment({
        order_id: order.orderId,
        student_id: selChild.student_user_id,
        plan: order.planKey,
      });
      const expiresAt: string | null = verifyData?.expires_at ?? null;
      Toast.show({
        type: "success",
        text1: fmt(t("paidVia"), { method }),
        text2: `${fmt(t("planActivatedTest"), { name: childFirstName })}${expiresAt ? ` ${fmt(t("expiresOn"), { date: formatDayMonYear(expiresAt) })}` : ""}`,
      });
      setShowSubModal(false);
      qc.invalidateQueries({ queryKey: ["student-sub", selChild.student_user_id] });
    } catch {
      Toast.show({ type: "error", text1: t("paymentVerificationFailed"), text2: t("pleaseTryAgain") });
    }
  };

  const handleCheckoutComplete = async () => {
    const orderId = checkoutOrderId;
    const plan = checkoutPlan;
    setCheckoutSession(null);
    setCheckoutOrderId(null);
    setCheckoutPlan(null);
    if (!selChild?.student_user_id || !orderId || !plan) return;
    try {
      const { data: verifyData } = await paymentApi.parentVerifyPayment({
        order_id: orderId,
        student_id: selChild.student_user_id,
        plan,
      });
      const carryOver: number = verifyData?.carry_over_days ?? 0;
      const expiresAt: string | null = verifyData?.expires_at ?? null;
      const expiryStr = expiresAt ? fmt(t("expiresOn"), { date: formatDayMonYear(expiresAt) }) : "";
      Toast.show({
        type: "success",
        text1: fmt(t("subscriptionActivatedFor"), { name: childFirstName }),
        text2: carryOver > 0
          ? `${fmt(t("carryOverAdded"), { n: carryOver })}${expiryStr ? ` ${expiryStr}` : ""}`
          : (expiryStr || undefined),
      });
      setShowSubModal(false);
      qc.invalidateQueries({ queryKey: ["student-sub", selChild.student_user_id] });
    } catch {
      Toast.show({ type: "error", text1: t("paymentReceivedVerifyFailed"), text2: t("contactSupportPaymentId") });
    }
  };

  const handleCheckoutDismiss = () => {
    setCheckoutSession(null);
    setCheckoutOrderId(null);
    setCheckoutPlan(null);
  };

  const handleCheckoutError = (message: string) => {
    setCheckoutSession(null);
    setCheckoutOrderId(null);
    setCheckoutPlan(null);
    Toast.show({ type: "error", text1: t("paymentFailed"), text2: message });
  };

  const loading = studentsLoading || (isApproved && summaryLoading);

  const expiryWhen = daysLeft === 0
    ? t("lessThanADay")
    : daysLeft === 1 ? t("dayOne") : fmt(t("daysN"), { n: daysLeft ?? 0 });

  const rankLabel = summary.rank_percentile !== null && summary.rank_percentile !== undefined
    ? fmt(t("topPct"), { n: Math.round(summary.rank_percentile) })
    : null;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      <View style={s.header}>
        <View style={s.headerTopRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.headerTitle} numberOfLines={1}>{t("parentDashboard")}</Text>
            <Text style={s.headerSub} numberOfLines={2}>{t("parentDashboardSub")}</Text>
          </View>
        </View>

        {/* Quick Actions — moved up from the bottom of the scroll view so
            they're immediately visible without scrolling; replaces the old
            "AI Insights" pill (AI Chat is already one tap away on the tab bar).
            Frosted-glass card floating on the header, each action its own
            cell with a hairline divider between them for a cleaner,
            more deliberate look than plain icons floating on the purple. */}
        <View style={s.headerQaCard}>
          {QUICK_ACTIONS.map(({ labelKey, icon, tab, screen, color }, i) => (
            <TouchableOpacity
              key={labelKey}
              onPress={() => (tab ? navigation.navigate("Tabs", { screen: tab }) : navigation.navigate(screen))}
              activeOpacity={0.7}
              style={[s.headerQaItem, i > 0 && s.headerQaDivider]}
            >
              <View style={[s.headerQaIcon, { backgroundColor: color }]}>
                <Ionicons name={icon} size={14} color="#fff" />
              </View>
              <Text style={s.headerQaLabel} numberOfLines={1}>{t(labelKey)}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setShowSubModal(true)} activeOpacity={0.7} style={[s.headerQaItem, s.headerQaDivider]}>
            <View style={[s.headerQaIcon, { backgroundColor: expiryWarn ? semantic.danger.solid : accentSolid.violet }]}>
              <Ionicons name="card" size={14} color="#fff" />
            </View>
            <Text style={s.headerQaLabel} numberOfLines={1}>{subActive ? t("subscription") : t("subscribe")}</Text>
          </TouchableOpacity>
        </View>
      </View>

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
        {studentsLoading && (
          <View style={s.centeredState}>
            <ActivityIndicator size="large" color={palette.primary600} />
          </View>
        )}

        {!studentsLoading && students.length === 0 && (
          <View style={s.card}>
            <View style={s.centeredState}>
              <Ionicons name="link-outline" size={40} color={palette.gray400} />
              <Text style={s.emptyTitle}>{t("noStudentsLinked")}</Text>
              <Text style={s.emptyBody}>{t("linkChildToSee")}</Text>
              <TouchableOpacity style={s.linkBtn} onPress={() => navigation.navigate("LinkStudent")} activeOpacity={0.85}>
                <Ionicons name="person-add" size={16} color="#fff" />
                <Text style={s.linkBtnTxt}>{t("linkStudent")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!studentsLoading && students.length > 0 && (
          <>
            {pendingOutgoing > 0 && (
              <TouchableOpacity style={[s.warnBanner, s.warnBannerAmber, s.rowCenter]} onPress={() => navigation.navigate("LinkStudent")} activeOpacity={0.85}>
                <Ionicons name="hourglass-outline" size={16} color={semantic.warning.text} />
                <Text style={[s.warnTxt, { color: semantic.warning.text, flex: 1, marginLeft: 8 }]}>
                  {fmt(t("linkRequestsAwaiting"), { n: pendingOutgoing })}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={semantic.warning.text} />
              </TouchableOpacity>
            )}

            {pendingApprovals > 0 && (
              <View style={[s.warnBanner, s.warnBannerBlue, s.rowCenter]}>
                <Ionicons name="card-outline" size={16} color={semantic.info.text} />
                <Text style={[s.warnTxt, { color: semantic.info.text, flex: 1, marginLeft: 8 }]}>
                  {fmt(t("purchaseApprovalsPending"), { n: pendingApprovals })}
                </Text>
              </View>
            )}

            {isApproved && limitEnabled && limitMinutes !== null && (
              <View style={[s.warnBanner, s.warnBannerBlue]}>
                <Ionicons name="time-outline" size={16} color={semantic.info.text} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.warnTxt, { color: semantic.info.text }]}>
                    {fmt(t("studyLimitUsage"), { name: childFirstName, used: usedToday ?? 0, limit: limitMinutes })}
                  </Text>
                  <View style={[s.barTrack, { marginTop: 6, backgroundColor: "rgba(255,255,255,0.7)" }]}>
                    <View style={[s.barFill, {
                      width: `${Math.min(100, limitMinutes > 0 ? ((usedToday ?? 0) / limitMinutes) * 100 : 0)}%` as any,
                      backgroundColor: (usedToday ?? 0) >= limitMinutes ? semantic.danger.solid : semantic.info.solid,
                    }]} />
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate("StudyLimits")}>
                    <Text style={[s.warnLink, { color: semantic.info.text }]}>{t("manageLimits")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {isApproved && expiryWarn && (
              <View style={[s.warnBanner, s.warnBannerOrange, s.rowBetween]}>
                <View style={[s.rowCenter, { flex: 1 }]}>
                  <Ionicons name="card-outline" size={16} color={semantic.warning.text} />
                  <Text style={[s.warnTxt, { color: semantic.warning.text, marginLeft: 8, flex: 1 }]}>
                    {fmt(t("planExpiresIn"), { name: childFirstName, when: expiryWhen })}
                  </Text>
                </View>
                <TouchableOpacity style={s.warnActionBtn} onPress={() => setShowSubModal(true)}>
                  <Text style={s.warnActionBtnTxt} numberOfLines={1}>{t("renewNow")}</Text>
                </TouchableOpacity>
              </View>
            )}
            {isApproved && !subActive && !expiryWarn && studentSub && (
              <View style={[s.warnBanner, s.warnBannerRed, s.rowBetween]}>
                <View style={[s.rowCenter, { flex: 1 }]}>
                  <Ionicons name="card-outline" size={16} color={semantic.danger.text} />
                  <Text style={[s.warnTxt, { color: semantic.danger.text, marginLeft: 8, flex: 1 }]}>
                    {fmt(t("noActiveSubscription"), { name: childFirstName })}
                  </Text>
                </View>
                <TouchableOpacity style={[s.warnActionBtn, { backgroundColor: semantic.danger.solid }]} onPress={() => setShowSubModal(true)}>
                  <Text style={s.warnActionBtnTxt} numberOfLines={1}>{t("subscribe")}</Text>
                </TouchableOpacity>
              </View>
            )}

            {approvedChildIds.length > 1 && <AllChildrenSummaryCard studentIds={approvedChildIds} students={students} />}

            <View style={s.card}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.childTabRow}>
                {students.map((child, i) => {
                  const active = child.student_user_id === selectedChildId;
                  return (
                    <TouchableOpacity
                      key={child.id}
                      style={[s.childTab, active && s.childTabActive]}
                      onPress={() => selectChild(child.student_user_id)}
                      activeOpacity={0.8}
                    >
                      <View style={s.childAvatar}>
                        <Text style={s.childAvatarTxt}>{(child.student_name ?? "S")[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ minWidth: 0 }}>
                        <Text style={[s.childTabName, active && s.childTabNameActive]} numberOfLines={1}>
                          {child.student_name ?? `${t("student")} ${i + 1}`}
                        </Text>
                        <Text style={s.childTabMeta} numberOfLines={1}>
                          {fmt(t("classLabel"), { n: child.student_class ?? "–" })} · {child.student_board ?? "–"}
                        </Text>
                      </View>
                      {!child.is_approved && <PendingBadge />}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity style={s.addChildTab} onPress={() => navigation.navigate("LinkStudent")} activeOpacity={0.8}>
                  <Ionicons name="add" size={14} color={palette.primary600} />
                  <Text style={s.addChildTxt}>{t("addChild")}</Text>
                </TouchableOpacity>
              </ScrollView>

              <View style={s.childSummary}>
                <View style={s.rowCenter}>
                  <Text style={s.childName} numberOfLines={1}>{selChild?.student_name ?? t("student")}</Text>
                  {selChild && !isApproved && <PendingBadge style={{ marginLeft: 8 }} />}
                </View>
                <Text style={s.childMeta} numberOfLines={2}>
                  {fmt(t("classLabel"), { n: selChild?.student_class ?? "–" })} · {selChild?.student_board ?? "–"} · {selChild?.relationship ?? "–"}
                </Text>
                {!!linkedSince && (
                  <Text style={s.linkedSince} numberOfLines={1}>{fmt(t("linkedSince"), { date: linkedSince })}</Text>
                )}

                {selChild && !isApproved && <PendingApprovalState child={selChild} />}

                {isApproved && selChild && (
                <>
                <View style={s.overviewRow}>
                  <View style={s.overviewItem}>
                    <Text style={[s.overviewVal, { color: palette.primary600 }]}>{Math.round(summary.avg_quiz_score)}%</Text>
                    <Text style={s.overviewLbl} numberOfLines={1}>{t("avgQuizScore")}</Text>
                  </View>
                  <View style={s.overviewDivider} />
                  <View style={s.overviewItem}>
                    <Text style={[s.overviewVal, { color: summary.attendance !== null ? semantic.success.solid : palette.gray300 }]} numberOfLines={1} adjustsFontSizeToFit>
                      {summary.attendance !== null ? `${Math.round(summary.attendance)}%` : t("na")}
                    </Text>
                    <Text style={s.overviewLbl} numberOfLines={1}>{t("attendance")}</Text>
                  </View>
                  <View style={s.overviewDivider} />
                  <View style={s.overviewItem}>
                    <Text style={[s.overviewVal, { color: rankLabel ? accentSolid.amber : palette.gray300 }]} numberOfLines={1} adjustsFontSizeToFit>
                      {rankLabel ?? t("na")}
                    </Text>
                    <Text style={s.overviewLbl} numberOfLines={1}>{t("rank")}</Text>
                  </View>
                </View>

                <View style={s.statsGrid}>
                  <StatCard label={t("videosWatched")}   value={summary.total_videos_watched}    icon="play-circle-outline" color={palette.primary500} />
                  <StatCard label={t("quizzesDone")}     value={summary.total_quizzes_completed} icon="trophy-outline"      color={semantic.warning.solid} />
                  <StatCard label={t("avgQuizScoreShort")} value={`${Math.round(summary.avg_quiz_score)}%`} icon="checkmark-circle-outline" color={semantic.success.solid} />
                  {summary.study_hours_week !== null ? (
                    <StatCard label={t("studyHoursWeek")} value={`${summary.study_hours_week}h`} icon="time-outline" color={accentSolid.teal} />
                  ) : (
                    <StatCard label={t("subjectsTracked")} value={resolvedSubjects.length} icon="book-outline" color={accentSolid.rose} />
                  )}
                </View>

                <ApprovalModeSwitch link={selChild} style={s.approvalSwitch} />

                {studentSub && (
                  <View style={s.subRow}>
                    <View style={[s.rowCenter, { flex: 1, minWidth: 0 }]}>
                      <View style={[s.subIcon, { backgroundColor: subActive ? palette.primary50 : palette.gray100 }]}>
                        <Ionicons
                          name={subPlan === "premium" ? "diamond" : "card"}
                          size={16}
                          color={subActive ? palette.primary600 : palette.gray400}
                        />
                      </View>
                      <View style={{ marginLeft: 8, flex: 1, minWidth: 0 }}>
                        <Text style={s.subPlanTxt} numberOfLines={2}>
                          {fmt(t("planLabel"), { plan: planTitle })}
                          {subActive && daysLeft !== null ? (
                            <Text style={{ color: daysLeft <= 7 ? semantic.warning.solid : palette.gray400, fontWeight: "600" }}>
                              {"  · "}{daysLeft === 0 ? t("expiresToday") : fmt(t("daysLeftShort"), { n: daysLeft })}
                            </Text>
                          ) : !subActive ? (
                            <Text style={{ color: semantic.danger.solid, fontWeight: "600" }}>{"  · "}{t("expired")}</Text>
                          ) : null}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setShowSubModal(true)}>
                      <Text style={s.subManageTxt}>{subActive ? t("manage") : t("subscribe")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                </>
                )}
              </View>
            </View>

            {isRealParent && (
              <View style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.cardTitle}>🛡️ {t("approvalRequests")}</Text>
                  {pendingRequests.length > 0 && (
                    <View style={s.countPill}><Text style={s.countPillTxt}>{pendingRequests.length}</Text></View>
                  )}
                </View>
                {pendingRequests.length === 0 ? (
                  <Text style={[s.emptyInline, { textAlign: "center", paddingVertical: 12 }]}>{t("noPendingApprovals")}</Text>
                ) : (
                  <View style={{ marginTop: 10, gap: 10 }}>
                    {pendingRequests.map((req) => {
                      const busy = decidingId === req.id;
                      return (
                        <View key={req.id} style={s.approvalRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={s.approvalTitle} numberOfLines={2}>{req.title}</Text>
                            <Text style={s.approvalMeta} numberOfLines={2}>
                              {req.student_name ?? t("student")}
                              {req.amount !== null && req.amount !== undefined ? ` · ₹${req.amount}` : ""}
                              {req.created_at ? ` · ${fmt(t("requestedOn"), { date: formatDayMonYear(req.created_at) })}` : ""}
                            </Text>
                          </View>
                          <View style={s.approvalActions}>
                            <TouchableOpacity
                              style={[s.approvalBtn, s.approvalDecline]}
                              onPress={() => startDecline(req)}
                              disabled={!!decidingId}
                              activeOpacity={0.8}
                            >
                              <Text style={s.approvalDeclineTxt} numberOfLines={1}>{t("decline")}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.approvalBtn, s.approvalApprove]}
                              onPress={() => decide(req, "approved")}
                              disabled={!!decidingId}
                              activeOpacity={0.8}
                            >
                              {busy
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Text style={s.approvalApproveTxt} numberOfLines={1}>{t("approve")}</Text>}
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {isApproved && (
            <>
            <View style={s.tabBar}>
              {TABS.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[s.tabBtn, activeTab === tab.key && s.tabBtnActive]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={tab.icon} size={14} color={activeTab === tab.key ? palette.gray900 : palette.gray400} />
                  <Text style={[s.tabLabel, activeTab === tab.key && s.tabLabelActive]} numberOfLines={1}>{t(tab.labelKey)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 4, flexWrap: "wrap", gap: 6 }}>
              <Text style={s.cardTitle}>{t("activityWindow")}</Text>
              <View style={[s.daysFilterWrap, { flexWrap: "wrap" }]}>
                {DAYS_FILTER_OPTIONS.map(({ value, label }) => (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setSummaryDays(value)}
                    style={[s.daysFilterChip, summaryDays === value && s.daysFilterChipOn]}
                  >
                    <Text style={[s.daysFilterTxt, summaryDays === value && s.daysFilterTxtOn]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {loading && !summaryData ? (
              <ActivityIndicator style={{ marginTop: 24 }} color={palette.primary600} />
            ) : (
              <>
                {activeTab === "overview" && (
                  <View style={{ gap: 12 }}>
                    <View style={s.card}>
                      <Text style={s.cardTitle}>📊 {t("subjectPerformance")}</Text>
                      <View style={{ marginTop: 12 }}>
                        {resolvedSubjects.length === 0 ? (
                          <EmptyState
                            icon="book-outline"
                            title={t("noSubjectData")}
                            description={reasons.subjects ?? t("completeQuizzesToSee")}
                          />
                        ) : (
                          resolvedSubjects.map((subj, i) => (
                            <SubjectBar
                              key={subj.subject_id}
                              name={subjectNameById[subj.subject_id]}
                              score={subj.avg_score}
                              color={SUBJECT_COLORS[i % SUBJECT_COLORS.length]}
                            />
                          ))
                        )}
                      </View>
                    </View>

                    <View style={s.card}>
                      <Text style={s.cardTitle}>⚠️ {t("weakAreas")}</Text>
                      {summary.weak_topics.length === 0 ? (
                        <Text style={[s.emptyInline, { textAlign: "center", paddingVertical: 12 }]}>{t("noWeakTopics")}</Text>
                      ) : (
                        <>
                          <View style={{ marginTop: 10, gap: 10 }}>
                            {summary.weak_topics
                              .slice(clampedWeakTopicsPage * PAGE_SIZE, clampedWeakTopicsPage * PAGE_SIZE + PAGE_SIZE)
                              .map((wt) => (
                                <View key={wt.topic_id} style={s.rowCenter}>
                                  <View style={s.weakBadge}>
                                    <Text style={s.weakBadgeTxt}>{Math.round(wt.accuracy)}%</Text>
                                  </View>
                                  <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                                    <Text style={s.weakTopicName} numberOfLines={1}>{fmt(t("topicShort"), { id: wt.topic_id.slice(0, 8) })}</Text>
                                    <ProgressBar value={wt.accuracy} max={100} color={semantic.danger.solid} />
                                  </View>
                                  <Text style={s.weakNeedsWork} numberOfLines={1}>{fmt(t("attemptsN"), { n: wt.attempts })}</Text>
                                </View>
                              ))}
                          </View>
                          <Pagination
                            page={clampedWeakTopicsPage}
                            totalPages={weakTopicsTotalPages}
                            onPageChange={setWeakTopicsPage}
                            summary={`${clampedWeakTopicsPage * PAGE_SIZE + 1}–${Math.min(summary.weak_topics.length, (clampedWeakTopicsPage + 1) * PAGE_SIZE)} of ${summary.weak_topics.length}`}
                          />
                        </>
                      )}
                    </View>
                  </View>
                )}

                {activeTab === "activity" && (
                  <View style={{ gap: 12 }}>
                    <View style={s.card}>
                      <Text style={s.cardTitle}>⚡ {t("todaysActivity")}</Text>
                      {summary.activity_today ? (
                        <View style={s.statsGrid}>
                          <StatCard label={t("videosWatched")} value={summary.activity_today.videos_watched} icon="play-circle-outline" color={palette.primary500} />
                          <StatCard label={t("quizzesCompleted")} value={summary.activity_today.quizzes_completed} icon="trophy-outline" color={semantic.warning.solid} />
                          <StatCard label={t("studyMinutes")} value={summary.activity_today.study_minutes} icon="time-outline" color={accentSolid.teal} />
                        </View>
                      ) : (
                        <EmptyState
                          icon="pulse-outline"
                          title={t("notAvailableYet")}
                          description={reasons.activity_today ?? t("todayNotTracked")}
                        />
                      )}
                    </View>

                    <View style={s.card}>
                      <Text style={s.cardTitle}>🕒 {t("studyTimeThisWeek")}</Text>
                      {summary.activity_week && summary.activity_week.length > 0 ? (
                        <View style={{ marginTop: 12 }}>
                          <BarChart
                            items={summary.activity_week.map((d) => ({ label: d.day, value: d.minutes }))}
                            color={palette.primary600}
                          />
                          <Text style={s.chartCaption}>{t("minutesShort")}</Text>
                        </View>
                      ) : (
                        <EmptyState
                          icon="time-outline"
                          title={t("notAvailableYet")}
                          description={reasons.activity_week ?? t("weekNotTracked")}
                        />
                      )}
                    </View>

                    <View style={s.card}>
                      <Text style={s.cardTitle}>📈 {t("monthlyTrends")}</Text>
                      {summary.monthly_trends && summary.monthly_trends.quiz_scores.length > 0 ? (
                        <View style={{ marginTop: 12 }}>
                          <GroupedBarChart
                            labels={summary.monthly_trends.months ?? summary.monthly_trends.quiz_scores.map((_, i) => `M${i + 1}`)}
                            a={summary.monthly_trends.study_hours}
                            b={summary.monthly_trends.quiz_scores}
                            colorA={palette.primary600}
                            colorB={semantic.success.solid}
                          />
                          <View style={s.legendRow}>
                            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: palette.primary600 }]} /><Text style={s.legendTxt}>{t("studyHours")}</Text></View>
                            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: semantic.success.solid }]} /><Text style={s.legendTxt}>{t("quizScore")} %</Text></View>
                          </View>
                        </View>
                      ) : (
                        <EmptyState
                          icon="bar-chart-outline"
                          title={t("notAvailableYet")}
                          description={reasons.monthly_trends ?? t("monthlyNotTracked")}
                        />
                      )}
                    </View>
                  </View>
                )}

                {activeTab === "reports" && (
                  <View style={{ gap: 12 }}>
                    <View style={s.reportCard}>
                      <View style={s.rowCenter}>
                        <Ionicons name="calendar" size={18} color="rgba(255,255,255,0.85)" />
                        <Text style={s.reportTitle}>{t("weekSummary")}</Text>
                      </View>
                      {summary.weekly_report ? (
                        <>
                          <Text style={s.reportSub}>{t("weekSummarySub")}</Text>
                          <View style={s.reportStatsGrid}>
                            {[
                              { label: t("studyHours"),     value: `${summary.weekly_report.study_hours}h` },
                              { label: t("videosWatched"),  value: summary.weekly_report.videos_watched },
                              { label: t("avgQuizScoreShort"), value: `${Math.round(summary.weekly_report.quiz_score_avg)}%` },
                              { label: t("rank"), value: summary.weekly_report.rank_percentile !== null && summary.weekly_report.rank_percentile !== undefined ? fmt(t("topPct"), { n: Math.round(summary.weekly_report.rank_percentile) }) : t("na") },
                            ].map((m) => (
                              <View key={m.label} style={s.reportStatBox}>
                                <Text style={s.reportStatVal} numberOfLines={1} adjustsFontSizeToFit>{m.value}</Text>
                                <Text style={s.reportStatLbl} numberOfLines={1}>{m.label}</Text>
                              </View>
                            ))}
                          </View>
                        </>
                      ) : (
                        <>
                          <Text style={s.reportSub}>{reasons.weekly_report ?? t("weekSummaryUnavailable")}</Text>
                          <View style={s.reportStatsGrid}>
                            {[
                              { label: t("videosWatched"), value: summary.total_videos_watched },
                              { label: t("quizzesDone"),   value: summary.total_quizzes_completed },
                              { label: t("avgQuizScoreShort"), value: `${Math.round(summary.avg_quiz_score)}%` },
                            ].map((m) => (
                              <View key={m.label} style={s.reportStatBox}>
                                <Text style={s.reportStatVal}>{m.value}</Text>
                                <Text style={s.reportStatLbl} numberOfLines={1}>{m.label}</Text>
                              </View>
                            ))}
                          </View>
                        </>
                      )}
                      {rankLabel === null && (
                        <View style={s.reportRankBox}>
                          <Ionicons name="help-circle-outline" size={14} color="rgba(255,255,255,0.85)" />
                          <Text style={s.reportRankTxt}>
                            {reasons.rank_percentile ?? t("rankPercentileUnavailable")}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={s.card}>
                      <Text style={s.cardTitle}>⚡ {t("goalProgress")}</Text>
                      <EmptyState
                        icon="flag-outline"
                        title={t("notAvailableYet")}
                        description={t("goalNotWired")}
                      />
                    </View>

                    <View style={s.card}>
                      <Text style={s.cardTitle}>📚 {t("notesResources")}</Text>
                      <View style={{ marginTop: 6 }}>
                        {[
                          { label: t("videosCompleted"), value: summary.total_videos_watched, icon: "▶️" },
                          { label: t("assignmentsDone"), value: assignmentsDoneCount ?? "—", icon: "✅" },
                          ...(summary.weekly_report ? [{ label: t("notesRead"), value: summary.weekly_report.notes_read, icon: "📝" }] : []),
                        ].map((item, i, arr) => (
                          <View key={item.label} style={[s.resourceRow, i < arr.length - 1 && s.resourceDivider]}>
                            <Text style={s.resourceLabel} numberOfLines={1}>{item.icon} {item.label}</Text>
                            <Text style={s.resourceValue}>{item.value}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}

                {activeTab === "readiness" && (
                  <View style={{ gap: 12 }}>
                    <View style={s.card}>
                      <View style={s.rowCenter}>
                        <Ionicons name="school" size={18} color={palette.primary600} />
                        <Text style={[s.cardTitle, { marginLeft: 6 }]}>{t("examReadinessScore")}</Text>
                      </View>
                      {summary.exam_readiness && Object.keys(summary.exam_readiness).length > 0 ? (
                        <View style={{ marginTop: 12 }}>
                          <Text style={s.cardSub}>{t("examReadinessSub")}</Text>
                          {Object.entries(summary.exam_readiness).map(([subject, score]) => {
                            const meta = readinessMeta(score, t);
                            return (
                              <View key={subject} style={{ marginTop: 14 }}>
                                <View style={s.rowBetween}>
                                  <Text style={s.readySubject} numberOfLines={1}>{subjectNameById[subject] ?? subject}</Text>
                                  <View style={s.rowCenter}>
                                    <Text style={[s.readyLabel, { color: meta.color }]} numberOfLines={1}>{meta.label}</Text>
                                    <Text style={s.readyScore}>{Math.round(score)}</Text>
                                  </View>
                                </View>
                                <View style={{ marginTop: 6 }}>
                                  <ProgressBar value={score} max={100} color={meta.color} />
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <EmptyState
                          icon="school-outline"
                          title={t("notAvailableYet")}
                          description={reasons.exam_readiness ?? t("examReadinessUnavailable")}
                        />
                      )}
                    </View>

                    <View style={s.card}>
                      <Text style={s.cardTitle}>🧠 {t("aiRiskPrediction")}</Text>
                      <EmptyState
                        icon="sparkles-outline"
                        title={t("notAvailableYet")}
                        description={t("riskNotComputed")}
                      />
                    </View>
                  </View>
                )}
              </>
            )}
            </>
            )}
          </>
        )}

      </ScrollView>

      <Modal visible={!!declineTarget} animationType="fade" transparent onRequestClose={() => setDeclineTarget(null)}>
        <View style={s.declineOverlay}>
          <View style={s.declineCard}>
            <Text style={s.declineTitle}>{t("declineNoteTitle")}</Text>
            <Text style={s.declineBody}>{fmt(t("declineNoteBody"), { name: declineTarget?.student_name ?? t("yourChild") })}</Text>
            <TextInput
              style={s.declineInput}
              value={declineNote}
              onChangeText={setDeclineNote}
              placeholder={t("declineNotePlaceholder")}
              placeholderTextColor={palette.gray400}
              multiline
              textAlignVertical="top"
            />
            <View style={s.declineBtnRow}>
              <TouchableOpacity style={s.declineCancelBtn} onPress={() => setDeclineTarget(null)} activeOpacity={0.8}>
                <Text style={s.declineCancelTxt}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.declineConfirmBtn}
                onPress={() => declineTarget && decide(declineTarget, "rejected", declineNote)}
                disabled={!!decidingId}
                activeOpacity={0.85}
              >
                {decidingId ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.declineConfirmTxt}>{t("decline")}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSubModal} animationType="slide" transparent onRequestClose={() => setShowSubModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.modalTitle} numberOfLines={2}>
                  {subActive ? t("renewChangePlan") : t("subscribe")} {fmt(t("forName"), { name: childFirstName })}
                </Text>
                {subActive && daysLeft !== null ? (
                  <Text style={[s.modalSubtitle, daysLeft <= 7 && { color: semantic.warning.solid, fontWeight: "700" }]}>
                    {fmt(t("currentPlanLine"), { plan: planTitle, when: daysLeft === 0 ? t("expiresToday") : fmt(t("daysRemaining"), { n: daysLeft }) })}
                  </Text>
                ) : !subActive ? (
                  <Text style={[s.modalSubtitle, { color: semantic.danger.solid }]}>{t("noActivePlan")}</Text>
                ) : null}
              </View>
              <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowSubModal(false)}>
                <Ionicons name="close" size={18} color={palette.gray500} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, gap: 10 }}>
              {plans.map((p) => (
                <TouchableOpacity
                  key={p.plan_key}
                  style={[s.planCard, p.is_popular && s.planCardPremium, payingPlan === p.plan_key && { opacity: 0.6 }]}
                  onPress={() => handleParentSubscribe(p.plan_key)}
                  disabled={!!payingPlan}
                  activeOpacity={0.85}
                >
                  {p.badge && (
                    <View style={s.planBadge}>
                      <Text style={s.planBadgeTxt}>{p.badge}</Text>
                    </View>
                  )}
                  <View style={s.rowCenter}>
                    <View style={s.planIconBox}>
                      <Ionicons name={p.is_popular ? "diamond-outline" : "flash-outline"} size={20} color={palette.primary600} />
                    </View>
                    <View style={{ marginLeft: 10, flex: 1, minWidth: 0 }}>
                      <Text style={s.planName} numberOfLines={1}>{p.name}</Text>
                      <Text style={s.planDesc} numberOfLines={2}>{p.description ?? fmt(t("daysFullAccess"), { n: p.duration_days })}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      {payingPlan === p.plan_key ? (
                        <ActivityIndicator size="small" color={palette.primary600} />
                      ) : (
                        <>
                          <Text style={s.planPrice}>₹{p.price}</Text>
                          <Text style={s.planPeriod}>/{p.duration_days}d</Text>
                        </>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}

              <Text style={s.modalFooterTxt}>
                {fmt(t("paymentFooter"), { name: selChild?.student_name ?? t("yourChild") })}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      <CashfreeCheckout
        visible={!!checkoutSession}
        paymentSessionId={checkoutSession?.paymentSessionId ?? null}
        mode={checkoutSession?.mode ?? "sandbox"}
        onComplete={handleCheckoutComplete}
        onDismiss={handleCheckoutDismiss}
        onError={handleCheckoutError}
      />

      <PaymentMethodSheet
        visible={!!methodSheetOrder}
        amountLabel={methodSheetOrder ? `₹${plans.find(p => p.plan_key === methodSheetOrder.planKey)?.price ?? ""}` : ""}
        planName={methodSheetOrder ? (plans.find(p => p.plan_key === methodSheetOrder.planKey)?.name ?? methodSheetOrder.planKey) : ""}
        onSelect={handleMethodSelected}
        onCancel={() => setMethodSheetOrder(null)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: palette.gray50 },
  container: { flex: 1 },

  header:       { backgroundColor: palette.primary600, paddingTop: spacing.sm, paddingBottom: spacing.lg, paddingHorizontal: spacing["2xl"] - 4 },
  headerTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm + 2 },
  headerTitle:  { color: "#fff", fontSize: typography.h1.fontSize, fontWeight: "800", letterSpacing: -0.5 },
  headerSub:    { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 3, maxWidth: 260 },
  headerQaCard:  {
    flexDirection: "row",
    marginTop: spacing.md,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingVertical: spacing.sm,
  },
  headerQaItem:    { flex: 1, alignItems: "center", gap: 4, paddingHorizontal: 2 },
  headerQaDivider: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.16)" },
  headerQaIcon:    {
    width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 1,
  },
  headerQaLabel:   { color: "rgba(255,255,255,0.95)", fontSize: 9.5, fontWeight: "700", textAlign: "center" },

  centeredState: { alignItems: "center", justifyContent: "center", paddingVertical: spacing["2xl"], gap: spacing.sm + 2 },
  emptyTitle:    { fontSize: 15, fontWeight: "700", color: palette.gray700, textAlign: "center" },
  emptyBody:     { fontSize: 12, color: palette.gray400, textAlign: "center", lineHeight: 18 },
  emptyInline:   { fontSize: 12, color: palette.gray400 },
  linkBtn:       { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.primary600, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, minHeight: 44, marginTop: 4 },
  linkBtnTxt:    { color: "#fff", fontSize: 13, fontWeight: "700" },

  card:      { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  cardTitle: { fontSize: 14, fontWeight: "700", color: palette.gray800, flexShrink: 1 },
  cardSub:   { fontSize: 11, color: palette.gray400, marginTop: 2 },

  childSummarySkeleton:  { width: 140, height: 64, borderRadius: radius.md, backgroundColor: palette.gray100, marginRight: 8 },
  childSummaryRow:       { backgroundColor: palette.gray50, borderRadius: radius.md, padding: spacing.md },
  childSummaryName:      { fontSize: 13, fontWeight: "700", color: palette.gray800, marginBottom: 4 },
  childSummaryStats:     { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  childSummaryStat:      { fontSize: 11.5, color: palette.gray500 },
  childSummaryStatValue: { fontSize: 12.5, fontWeight: "800", color: palette.gray800 },

  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  rowCenter:  { flexDirection: "row", alignItems: "center" },

  warnBanner:      { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, borderRadius: radius.md, padding: spacing.md, borderWidth: 1 },
  warnBannerAmber: { backgroundColor: semantic.warning.bg, borderColor: semantic.warning.border },
  warnBannerRed:   { backgroundColor: semantic.danger.bg, borderColor: semantic.danger.border },
  warnBannerOrange:{ backgroundColor: semantic.warning.bg, borderColor: semantic.warning.border },
  warnBannerGreen: { backgroundColor: semantic.success.bg, borderColor: semantic.success.border },
  warnBannerBlue:  { backgroundColor: semantic.info.bg, borderColor: semantic.info.border },
  warnTxt:         { fontSize: 12, fontWeight: "600", lineHeight: 17 },
  warnLink:        { fontSize: 12, fontWeight: "800", textDecorationLine: "underline", marginTop: 4 },
  warnActionBtn:      { backgroundColor: semantic.warning.solid, borderRadius: radius.sm, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm - 1, minHeight: 32, justifyContent: "center" },
  warnActionBtnTxt:   { color: "#fff", fontSize: 11, fontWeight: "800" },

  childTabRow:      { flexDirection: "row" },
  childTab:         { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm, minHeight: 44, borderRadius: radius.md, marginRight: spacing.sm, backgroundColor: palette.gray50, maxWidth: 160 },
  childTabActive:   { backgroundColor: palette.primary50 },
  childAvatar:      { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.primary500, alignItems: "center", justifyContent: "center" },
  childAvatarTxt:   { color: "#fff", fontSize: 11, fontWeight: "800" },
  childTabName:     { fontSize: 12, fontWeight: "600", color: palette.gray500, maxWidth: 90 },
  childTabNameActive: { color: palette.primary700, fontWeight: "800" },
  childTabMeta:     { fontSize: 9, color: palette.gray400 },
  addChildTab:      { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44, borderRadius: radius.md, backgroundColor: palette.primary50 },
  addChildTxt:      { fontSize: 11, fontWeight: "700", color: palette.primary600 },

  childSummary: { paddingTop: spacing.md + 2, marginTop: spacing.sm + 2, borderTopWidth: 1, borderTopColor: palette.gray100 },
  childName:    { fontSize: 16, fontWeight: "800", color: palette.gray900, flexShrink: 1 },
  childMeta:    { fontSize: 12, color: palette.gray500, marginTop: 2 },
  linkedSince:  { fontSize: 11, color: palette.success700, fontWeight: "600", marginTop: 2 },

  overviewRow:    { flexDirection: "row", alignItems: "center", marginTop: spacing.md + 2, backgroundColor: palette.gray50, borderRadius: radius.md, paddingVertical: spacing.md },
  overviewItem:   { flex: 1, alignItems: "center", minWidth: 0, paddingHorizontal: 2 },
  overviewVal:    { fontSize: 17, fontWeight: "900" },
  overviewLbl:    { fontSize: 9, fontWeight: "700", color: palette.gray400, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },
  overviewDivider:{ width: 1, height: 28, backgroundColor: palette.gray200 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  statCard:  { flexGrow: 1, flexBasis: "45%", minWidth: 100, backgroundColor: "#fff", borderRadius: radius.lg - 2, padding: spacing.md, alignItems: "center", gap: 5, borderWidth: 1, borderColor: palette.gray100 },
  statIcon:  { width: 36, height: 36, borderRadius: radius.sm + 3, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 15, fontWeight: "800", color: palette.gray800 },
  statLabel: { fontSize: 10, color: palette.gray500, fontWeight: "600" },

  approvalSwitch: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.gray100 },

  subRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md + 2, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.gray100, gap: spacing.sm },
  subIcon:  { width: 30, height: 30, borderRadius: radius.sm + 1, alignItems: "center", justifyContent: "center" },
  subPlanTxt:   { fontSize: 13, fontWeight: "700", color: palette.gray800 },
  subManageTxt: { fontSize: 12, fontWeight: "800", color: palette.primary600 },

  countPill:    { backgroundColor: semantic.warning.bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, minWidth: 24, alignItems: "center" },
  countPillTxt: { fontSize: 11, fontWeight: "800", color: semantic.warning.text },
  approvalRow:      { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm, backgroundColor: palette.gray50, borderRadius: radius.md, padding: spacing.md },
  approvalTitle:    { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  approvalMeta:     { fontSize: 11, color: palette.gray500, marginTop: 2 },
  approvalActions:  { flexDirection: "row", gap: spacing.sm, flexShrink: 0 },
  approvalBtn:      { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", minWidth: 70 },
  approvalApprove:  { backgroundColor: semantic.success.solid },
  approvalDecline:  { backgroundColor: semantic.danger.bg },
  approvalApproveTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  approvalDeclineTxt: { color: palette.danger600, fontSize: 12, fontWeight: "800" },

  barTrack: { height: 6, backgroundColor: palette.gray100, borderRadius: 3, overflow: "hidden" },
  barFill:  { height: "100%", borderRadius: 3 },

  subjName:  { fontSize: 12, fontWeight: "600", color: palette.gray700, flex: 1 },
  subjScore: { fontSize: 13, fontWeight: "800", color: palette.gray900, width: 36, textAlign: "right" },

  chartRow:     { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 4 },
  chartCol:     { flex: 1, alignItems: "center", minWidth: 0 },
  chartColFixed: { width: 30, alignItems: "center" },
  daysFilterWrap:    { flexDirection: "row", gap: 2, backgroundColor: palette.gray100, borderRadius: radius.sm, padding: 2 },
  daysFilterChip:    { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.sm - 2 },
  daysFilterChipOn:  { backgroundColor: "#fff", ...cardShadow },
  daysFilterTxt:     { fontSize: 11, fontWeight: "700", color: palette.gray500 },
  daysFilterTxtOn:   { color: palette.primary600 },
  chartTrack:   { height: BAR_MAX_HEIGHT, width: "100%", justifyContent: "flex-end", alignItems: "center" },
  chartBar:     { width: "70%", borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  chartValue:   { fontSize: 9, fontWeight: "700", color: palette.gray500, marginBottom: 2 },
  chartLabel:   { fontSize: 9, fontWeight: "700", color: palette.gray400, marginTop: 4, textTransform: "uppercase" },
  chartCaption: { fontSize: 10, color: palette.gray400, textAlign: "center", marginTop: 6 },
  legendRow:    { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.md, marginTop: spacing.sm },
  legendItem:   { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot:    { width: 8, height: 8, borderRadius: 4 },
  legendTxt:    { fontSize: 10, color: palette.gray500, fontWeight: "600" },


  weakBadge:    { width: 34, height: 34, borderRadius: radius.sm + 2, backgroundColor: semantic.danger.bg, alignItems: "center", justifyContent: "center" },
  weakBadgeTxt: { fontSize: 10, fontWeight: "800", color: semantic.danger.solid },
  weakTopicName:{ fontSize: 12, fontWeight: "600", color: palette.gray700, marginBottom: 4 },
  weakNeedsWork:{ fontSize: 10, fontWeight: "700", color: semantic.danger.solid, marginLeft: 8 },

  tabBar:      { flexDirection: "row", backgroundColor: palette.gray100, borderRadius: radius.md, padding: 4, gap: 4 },
  tabBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: spacing.sm + 1, minHeight: 40, borderRadius: radius.sm + 1, minWidth: 0 },
  tabBtnActive:{ backgroundColor: "#fff", ...cardShadow },
  tabLabel:    { fontSize: 11, fontWeight: "700", color: palette.gray400, flexShrink: 1 },
  tabLabelActive: { color: palette.gray900 },

  reportCard:       { backgroundColor: palette.primary600, borderRadius: radius.lg, padding: spacing.lg },
  reportTitle:      { color: "#fff", fontSize: 16, fontWeight: "800", marginLeft: 6 },
  reportSub:        { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 4, marginBottom: spacing.md },
  reportStatsGrid:  { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  reportStatBox:    { flexBasis: "47%", flexGrow: 1, minWidth: 100, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: radius.md, padding: spacing.sm + 2, alignItems: "center" },
  reportStatVal:    { color: "#fff", fontSize: 18, fontWeight: "900" },
  reportStatLbl:    { color: "rgba(255,255,255,0.65)", fontSize: 10, marginTop: 2 },
  reportRankBox:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: radius.md, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 2, marginTop: spacing.md },
  reportRankTxt:    { color: "#fff", fontSize: 12, fontWeight: "600", flex: 1 },

  resourceRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm + 1, gap: spacing.sm },
  resourceDivider:  { borderBottomWidth: 1, borderBottomColor: palette.gray50 },
  resourceLabel:    { fontSize: 12, color: palette.gray500, flex: 1 },
  resourceValue:    { fontSize: 13, fontWeight: "800", color: palette.gray900 },

  readySubject:   { fontSize: 13, fontWeight: "700", color: palette.gray800, flex: 1 },
  readyLabel:     { fontSize: 10, fontWeight: "800", marginRight: 8 },
  readyScore:     { fontSize: 16, fontWeight: "900", color: palette.gray900 },


  declineOverlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  declineCard:       { width: "100%", maxWidth: 360, backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing.xl },
  declineTitle:      { fontSize: 17, fontWeight: "800", color: palette.gray900 },
  declineBody:       { fontSize: 13, color: palette.gray500, marginTop: 6, lineHeight: 18 },
  declineInput:      { borderWidth: 1, borderColor: palette.gray200, borderRadius: radius.md, padding: spacing.md, minHeight: 72, fontSize: 14, color: palette.gray900, backgroundColor: palette.gray50, marginTop: spacing.md },
  declineBtnRow:     { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.lg },
  declineCancelBtn:  { flex: 1, minHeight: 44, borderRadius: radius.md, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
  declineCancelTxt:  { fontSize: 14, fontWeight: "700", color: palette.gray700 },
  declineConfirmBtn: { flex: 1, minHeight: 44, borderRadius: radius.md, backgroundColor: semantic.danger.solid, alignItems: "center", justifyContent: "center" },
  declineConfirmTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet:   { backgroundColor: "#fff", borderTopLeftRadius: radius.xl + 4, borderTopRightRadius: radius.xl + 4, maxHeight: "85%" },
  modalHeader:  { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: spacing.lg + 2, borderBottomWidth: 1, borderBottomColor: palette.gray100, gap: spacing.sm },
  modalTitle:   { fontSize: 16, fontWeight: "800", color: palette.gray900 },
  modalSubtitle:{ fontSize: 11, color: palette.gray400, marginTop: 3 },
  modalCloseBtn:{ width: 36, height: 36, borderRadius: 18, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },

  planCard:        { borderRadius: radius.lg - 2, borderWidth: 2, borderColor: palette.gray200, padding: spacing.md + 2 },
  planCardPremium: { borderColor: palette.primary300, backgroundColor: palette.primary50 },
  planBadge:       { position: "absolute", top: -10, right: 14, backgroundColor: palette.primary600, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  planBadgeTxt:    { color: "#fff", fontSize: 9, fontWeight: "800" },
  planIconBox:     { width: 36, height: 36, borderRadius: radius.md, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center" },
  planName:        { fontSize: 14, fontWeight: "800", color: palette.gray900 },
  planDesc:        { fontSize: 10, color: palette.gray500, marginTop: 2, lineHeight: 14 },
  planPrice:       { fontSize: 16, fontWeight: "900", color: palette.primary600 },
  planPeriod:      { fontSize: 9, color: palette.gray400 },
  modalFooterTxt:  { fontSize: 10, color: palette.gray400, textAlign: "center", marginTop: 4, lineHeight: 14 },
});
