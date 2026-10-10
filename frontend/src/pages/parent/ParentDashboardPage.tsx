import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useAppSelector } from "@/store";
import { parentApi, paymentApi, contentApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { interpolate } from "@/lib/interpolate";
import { formatDayMonYear, formatDateTime } from "@/lib/dates";
import { useLanguage } from "@/contexts/LanguageContext";
import { openCashfreeCheckout } from "@/lib/cashfree";
import PaymentMethodSheet from "@/components/payment/PaymentMethodSheet";
import { Button, EmptyState, Input } from "@/components/ui";
import Pagination from "@/components/ui/Pagination";
import { useSelectedChild, type StudentLink } from "@/hooks/useSelectedChild";
import { useLinkBadges } from "@/hooks/useLinkBadges";
import { ChildSelector, NoChildrenState, PendingChildState, firstNameOf } from "@/components/parent/ChildSelector";
import ApprovalModeToggle from "@/components/parent/ApprovalModeToggle";
import { UsageBar } from "@/pages/parent/ParentStudyLimitsPage";
import toast from "react-hot-toast";
import {
  Activity, AlertTriangle, BarChart2, Bell, BookOpen,
  Brain, Calendar, CheckCircle, ChevronRight, Clock, CreditCard,
  Crown, GraduationCap, HelpCircle, MessageSquare, Rocket, Settings,
  Shield, ShieldCheck, Star, Trophy, UserPlus, Video, X, Zap,
} from "lucide-react";

interface Plan {
  plan_key: string;
  name: string;
  price: number;
  duration_days: number;
  badge: string | null;
  description: string | null;
  is_popular: boolean;
}

const DAYS_FILTER_OPTIONS: { value: 1 | 7 | 30 | 90 | 365; label: string }[] = [
  { value: 1,   label: "Today" },
  { value: 7,   label: "7d" },
  { value: 30,  label: "30d" },
  { value: 90,  label: "90d" },
  { value: 365, label: "1Y" },
];

const PAGE_SIZE = 10;

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
  exam_readiness: Record<string, number> | { subject?: string; name?: string; subject_name?: string; score: number }[] | null;

  insufficient_data_fields: Record<string, string>;
}

interface ApprovalRow {
  id: string;
  student_user_id: string;
  student_name: string | null;
  kind: string;
  reference: string;
  title: string;
  amount: number | null;
  status: string;
  created_at: string;
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

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}

const SUBJECT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6", "#8b5cf6"];

function SubjectBar({ name, score, color, tag }: { name: string; score: number; color: string; tag?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate min-w-0">{name}</span>
        <span className="flex items-center gap-2 flex-shrink-0">
          {tag && <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 hidden xs:inline">{tag}</span>}
          <span className="text-sm font-bold text-gray-900 dark:text-white w-10 text-right">{Math.round(score)}%</span>
        </span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.max(0, Math.min(100, score))}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function BarChart({ data, unit, colorClass = "bg-primary-500" }: {
  data: { label: string; value: number }[]; unit: string; colorClass?: string;
}) {
  const max = Math.max(1, ...data.map(d => d.value));
  // Past ~14 bars a fixed-width flex row squeezes each bar to illegibility
  // (a 90-day filter returns up to 31 points) — beyond that, give bars a
  // fixed minimum width and let the row scroll horizontally instead of
  // shrinking every bar to a sliver.
  const scrollable = data.length > 14;
  return (
    <div className={scrollable ? "overflow-x-auto -mx-1 px-1" : ""}>
      <div
        className={`flex items-end gap-1.5 xs:gap-2 h-36 ${scrollable ? "" : "w-full"}`}
        style={scrollable ? { minWidth: `${data.length * 28}px` } : undefined}
      >
        {data.map((d, i) => {
          const pct = Math.max(2, Math.round((d.value / max) * 100));
          return (
            <div
              key={`${d.label}-${i}`}
              className={`${scrollable ? "w-6 flex-shrink-0" : "flex-1 min-w-0"} flex flex-col items-center justify-end h-full gap-1`}
              title={`${d.label}: ${d.value} ${unit}`}
            >
              <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 truncate max-w-full">{d.value}</span>
              <div className="w-full flex items-end" style={{ height: "calc(100% - 2.25rem)" }}>
                <div className={`w-full rounded-t ${colorClass} transition-all duration-700`} style={{ height: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-gray-400 truncate max-w-full">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center min-w-0">
      <p className="text-xl font-black text-gray-900 dark:text-white truncate">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
    </div>
  );
}

function ApprovalRequestsCard({ rows, cardRef }: { rows: ApprovalRow[]; cardRef: React.RefObject<HTMLDivElement> }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (row: ApprovalRow, status: "approved" | "rejected") => {
    setBusyId(row.id);
    try {
      await parentApi.decideApproval(row.id, { status, ...(status === "rejected" && note.trim() ? { note: note.trim() } : {}) });
      toast.success(status === "approved" ? t("parentApprovalApprovedToast") : t("parentApprovalDeclinedToast"));
      setDecliningId(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["parent-pending-approvals"] });
      qc.invalidateQueries({ queryKey: ["link-badges"] });
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div ref={cardRef} id="approval-requests" className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 scroll-mt-20">
      <h3 className="font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary-500" /> {t("parentApprovalRequestsTitle")}
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{t("parentApprovalRequestsDesc")}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">{t("parentNoApprovalRequests")}</p>
      ) : (
        <div className="space-y-3">
          {rows.map(row => (
            <div key={row.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{row.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {row.student_name?.trim() || t("parentStudentFallback")} · {formatDateTime(row.created_at)}
                  </p>
                </div>
                {row.amount !== null && (
                  <span className="text-sm font-bold text-primary-600 dark:text-primary-400 flex-shrink-0">₹{row.amount}</span>
                )}
              </div>
              {decliningId === row.id ? (
                <div className="space-y-2">
                  <Input
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder={t("parentDeclineNotePlaceholder")}
                    maxLength={300}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="danger" size="sm" onClick={() => decide(row, "rejected")} disabled={busyId === row.id} isLoading={busyId === row.id}>
                      {t("parentConfirmDecline")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setDecliningId(null); setNote(""); }} disabled={busyId === row.id}>
                      {t("parentMeetingCancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" onClick={() => decide(row, "approved")} disabled={busyId === row.id} isLoading={busyId === row.id}>
                    {t("parentApprove")}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => { setDecliningId(row.id); setNote(""); }} disabled={busyId === row.id}>
                    {t("parentDecline")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ChildSummaryItem {
  student_id: string;
  total_videos_watched: number;
  total_quizzes_completed: number;
  avg_quiz_score: number;
  attendance: number;
  weak_topic_count: number;
}

/** Side-by-side comparison across every linked child — only rendered when a
 * parent has more than one, so a single-child parent's dashboard is
 * unchanged. Deliberately lighter than the per-child summary below (no
 * trends/insights): this is a glance-level "who needs attention" view, and
 * clicking a row switches the detailed view below to that child. */
function AllChildrenSummaryCard({ studentIds, students }: { studentIds: string[]; students: StudentLink[] }) {
  const { t } = useLanguage();
  const { data } = useQuery({
    queryKey: ["parent-children-summary", studentIds],
    queryFn: () => parentApi.childrenSummary(studentIds, 30).then(r => r.data as { children: ChildSummaryItem[] }),
    enabled: studentIds.length > 1,
  });

  const nameFor = (id: string) => students.find(c => c.student_user_id === id)?.student_name ?? t("parentStudentFallback");
  const rows = data?.children ?? [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
      <h3 className="font-bold text-gray-900 dark:text-white mb-4">{t("parentAllChildren")}</h3>
      {rows.length === 0 ? (
        <div className="flex gap-3 overflow-x-auto">
          {studentIds.map(id => (
            <div key={id} className="flex-shrink-0 w-40 h-20 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(row => (
            <div key={row.student_id} className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3.5">
              <p className="font-semibold text-gray-900 dark:text-white text-sm truncate mb-2">{nameFor(row.student_id)}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <span className="text-gray-500 dark:text-gray-400">{t("parentAvgQuizScore")}</span>
                <span className="text-right font-bold text-primary-600 dark:text-primary-400">{Math.round(row.avg_quiz_score)}%</span>
                <span className="text-gray-500 dark:text-gray-400">{t("parentAttendance")}</span>
                <span className="text-right font-bold text-gray-900 dark:text-gray-100">{row.attendance}%</span>
                <span className="text-gray-500 dark:text-gray-400">{t("parentQuizzesDone")}</span>
                <span className="text-right font-bold text-gray-900 dark:text-gray-100">{row.total_quizzes_completed}</span>
                {row.weak_topic_count > 0 && (
                  <>
                    <span className="text-danger-500">{t("parentWeakTopics")}</span>
                    <span className="text-right font-bold text-danger-500">{row.weak_topic_count}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ParentDashboardPage() {
  const { t } = useLanguage();
  const user = useAppSelector(s => s.auth.user);
  const parentId = user?.id ?? "";

  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"overview" | "activity" | "reports" | "readiness">(
    initialTab === "activity" || initialTab === "reports" || initialTab === "readiness" ? initialTab : "overview"
  );
  const [showSubModal, setShowSubModal] = useState(false);
  const [payingPlan, setPayingPlan] = useState<string | null>(null);
  const [methodSheetOrder, setMethodSheetOrder] = useState<{ planKey: string; orderId: string } | null>(null);
  const approvalCardRef = useRef<HTMLDivElement>(null);

  const {
    children: students,
    selectedChild: selChild,
    selectedChildId,
    setSelectedChildId,
    isLoading: studentsLoading,
  } = useSelectedChild();

  const badges = useLinkBadges();

  const isRealStudent = selChild?.is_approved === true && UUID_RE.test(selChild?.student_user_id ?? "");
  const firstName = firstNameOf(selChild, t("parentYourChild"));

  const approvedChildIds = useMemo(
    () => students.filter(c => c.is_approved && UUID_RE.test(c.student_user_id)).map(c => c.student_user_id),
    [students],
  );

  const [summaryDays, setSummaryDays] = useState<1 | 7 | 30 | 90 | 365>(7);
  const [weakTopicsPage, setWeakTopicsPage] = useState(0);

  const { data: summaryData } = useQuery({
    queryKey: ["parent-summary", selChild?.student_user_id, summaryDays],
    queryFn: () => parentApi.studentSummary(selChild!.student_user_id, summaryDays).then(r => r.data),
    enabled: isRealStudent,
  });
  const s: StudentSummary = (summaryData as StudentSummary | undefined) ?? EMPTY_SUMMARY;
  const weakTopicsTotalPages = Math.max(1, Math.ceil(s.weak_topics.length / PAGE_SIZE));
  const clampedWeakTopicsPage = Math.min(weakTopicsPage, weakTopicsTotalPages - 1);

  const { data: pendingApprovals = [] } = useQuery({
    queryKey: ["parent-pending-approvals", parentId],
    queryFn: () => parentApi.pendingApprovals().then(r => (r.data ?? []) as ApprovalRow[]),
    enabled: !!parentId,
    refetchInterval: 60_000,
  });

  const { data: boardsData } = useQuery({
    queryKey: ["content-boards"],
    queryFn: () => contentApi.boards().then(r => r.data as { id: string; name: string; code: string }[]),
    staleTime: 10 * 60_000,
  });
  const childBoard = boardsData?.find(
    b => b.code?.toLowerCase() === (selChild?.student_board ?? "").toLowerCase()
      || b.name?.toLowerCase() === (selChild?.student_board ?? "").toLowerCase()
  );
  const { data: classesData } = useQuery({
    queryKey: ["content-classes", childBoard?.id],
    queryFn: () => contentApi.classes(childBoard!.id).then(r => r.data as { id: string; name: string; number: number }[]),
    enabled: isRealStudent && !!childBoard?.id,
    staleTime: 10 * 60_000,
  });
  const childClass = classesData?.find(c => c.number === selChild?.student_class);
  const { data: subjectsData } = useQuery({
    queryKey: ["content-subjects", childClass?.id],
    queryFn: () => contentApi.subjects(childClass!.id).then(r => r.data as { id: string; name: string }[]),
    enabled: isRealStudent && !!childClass?.id,
    staleTime: 10 * 60_000,
  });
  const subjectNameById: Record<string, string> = {};
  for (const subj of subjectsData ?? []) subjectNameById[subj.id] = subj.name;
  const resolvedSubjects = s.subjects.filter(subj => subjectNameById[subj.subject_id]);

  const isRealParent = UUID_RE.test(parentId);
  const { data: studyLimitData } = useQuery({
    queryKey: ["study-limit", selChild?.student_user_id],
    queryFn: () =>
      parentApi.getStudyLimits(selChild!.student_user_id, parentId).then(r => r.data as { daily_limit_minutes: number; is_enabled: boolean; used_today_minutes?: number }),
    enabled: isRealStudent && isRealParent,
    refetchInterval: 60_000,
  });
  const limitMinutes = studyLimitData?.daily_limit_minutes ?? null;
  const limitEnabled = studyLimitData?.is_enabled ?? false;
  const usedToday = studyLimitData?.used_today_minutes ?? 0;

  const { data: studentSub } = useQuery({
    queryKey: ["student-sub", selChild?.student_user_id],
    queryFn: () => paymentApi.parentStudentSubscription(selChild!.student_user_id).then(r => r.data),
    enabled: isRealStudent,
    staleTime: 60000,
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["plans"],
    queryFn: () => paymentApi.plans().then(r => r.data),
  });
  const subPlan: string = (studentSub as any)?.plan ?? "free";
  const subActive: boolean = (studentSub as any)?.is_active ?? false;
  const daysLeft: number | null = (studentSub as any)?.days_until_expiry ?? null;
  const expiryWarn: boolean = (studentSub as any)?.expiry_warning ?? false;

  const handleParentSubscribe = async (plan: string) => {
    if (!selChild?.student_user_id || !isRealStudent) return;
    setPayingPlan(plan);
    try {
      const { data } = await paymentApi.parentCreateOrder(selChild.student_user_id, plan);

      if (data.key === "test_mode") {
        setMethodSheetOrder({ planKey: plan, orderId: data.order_id });
        return;
      }

      await openCashfreeCheckout(data.payment_session_id, data.key);

      const { data: verifyData } = await paymentApi.parentVerifyPayment({
        order_id: data.order_id,
        student_id: selChild.student_user_id,
        plan,
      });
      const carryOver: number = verifyData?.carry_over_days ?? 0;
      const expiresAt: string | null = verifyData?.expires_at ?? null;
      const expiryStr = expiresAt ? formatDateTime(expiresAt) : "";
      if (carryOver > 0) {
        toast.success(interpolate(t("parentPlanActivatedCarry"), { name: firstName, days: carryOver, expires: expiryStr }), { duration: 6000 });
      } else {
        toast.success(
          expiryStr
            ? interpolate(t("parentPlanActivatedExpires"), { name: firstName, expires: expiryStr })
            : interpolate(t("parentPlanActivated"), { name: firstName })
        );
      }
      setShowSubModal(false);
      qc.invalidateQueries({ queryKey: ["student-sub", selChild.student_user_id] });
    } catch (err) {
      // A re-verify of an already-paid order comes back 409 — it's benign
      // (no double charge/extend), so show it as done, not a failure.
      if ((err as { response?: { status?: number } })?.response?.status === 409) {
        toast.success(interpolate(t("parentPlanActivated"), { name: firstName }));
        setShowSubModal(false);
        qc.invalidateQueries({ queryKey: ["student-sub", selChild.student_user_id] });
      } else {
        toast.error(t("parentPaymentFailed"));
      }
    } finally {
      setPayingPlan(null);
    }
  };

  const handleMethodSelected = async (method: string) => {
    const order = methodSheetOrder;
    setMethodSheetOrder(null);
    if (!order || !selChild?.student_user_id) return;
    try {
      const { data: verifyData } = await paymentApi.parentVerifyPayment({
        order_id: order.orderId,
        student_id: selChild.student_user_id,
        plan: order.planKey,
      });
      const expiresAt: string | null = verifyData?.expires_at ?? null;
      toast.success(
        interpolate(t("parentPaidViaTestMode"), { method, name: firstName })
        + (expiresAt ? ` ${interpolate(t("parentExpiresOn"), { date: formatDayMonYear(expiresAt) })}` : "")
      );
      setShowSubModal(false);
      qc.invalidateQueries({ queryKey: ["student-sub", selChild.student_user_id] });
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 409) {
        toast.success(interpolate(t("parentPlanActivated"), { name: firstName }));
        setShowSubModal(false);
        qc.invalidateQueries({ queryKey: ["student-sub", selChild.student_user_id] });
      } else {
        toast.error(t("parentPaymentVerifyFailed"));
      }
    }
  };

  const scrollToApprovals = () => approvalCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const header = (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("parentDashboard")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("parentDashboardSubtitle")}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/parent/ai-chat" className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors">
          <Brain className="w-4 h-4" /> {t("parentAiInsights")}
        </Link>
        <Link to="/parent/communication" className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          <MessageSquare className="w-4 h-4" /> {t("messages")}
        </Link>
      </div>
    </div>
  );

  const badgeBanners = (
    <>
      {badges.pending_outgoing > 0 && (
        <Link to="/parent/link-student" className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-xl text-sm font-medium bg-warning-50 dark:bg-warning-900/20 text-warning-700 dark:text-warning-300 border border-warning-100 dark:border-warning-800 hover:bg-warning-100 dark:hover:bg-warning-900/30 transition-colors">
          <span className="flex items-center gap-2 min-w-0">
            <UserPlus className="w-4 h-4 flex-shrink-0" />
            <span className="min-w-0">{interpolate(t("parentLinkRequestsAwaiting"), { n: badges.pending_outgoing })}</span>
          </span>
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        </Link>
      )}
      {badges.pending_approvals > 0 && (
        <button type="button" onClick={scrollToApprovals} className="w-full text-left flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-xl text-sm font-medium bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors">
          <span className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            <span className="min-w-0">{interpolate(t("parentPurchaseApprovalsPending"), { n: badges.pending_approvals })}</span>
          </span>
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        </button>
      )}
    </>
  );

  const approvalsCard = <ApprovalRequestsCard rows={pendingApprovals} cardRef={approvalCardRef} />;

  if (!studentsLoading && students.length === 0) {
    return (
      <div className="w-full space-y-5 animate-fade-in">
        {header}
        {badgeBanners}
        <NoChildrenState />
      </div>
    );
  }

  if (selChild && !selChild.is_approved) {
    return (
      <div className="w-full space-y-5 animate-fade-in">
        {header}
        {badgeBanners}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <ChildSelector children={students} selectedChildId={selectedChildId} onSelect={setSelectedChildId} />
          <PendingChildState child={selChild} className="!border-0 !rounded-none" />
        </div>
        {pendingApprovals.length > 0 && approvalsCard}
      </div>
    );
  }

  const readinessRows: { name: string; score: number }[] = Array.isArray(s.exam_readiness)
    ? s.exam_readiness.map(r => ({ name: r.subject ?? r.name ?? r.subject_name ?? "", score: r.score }))
    : Object.entries(s.exam_readiness ?? {}).map(([name, score]) => ({ name, score }));
  const readinessLabel = (score: number) =>
    score >= 80 ? t("parentReadinessReady") : score >= 60 ? t("parentReadinessAlmost") : t("parentReadinessNeedsPrep");

  const monthLabels = s.monthly_trends?.months ?? s.monthly_trends?.study_hours.map((_, i) => `M${i + 1}`) ?? [];
  const rankPct = s.rank_percentile ?? s.weekly_report?.rank_percentile ?? null;

  return (
    <div className="w-full space-y-5 animate-fade-in">

      {header}
      {badgeBanners}

      {isRealStudent && limitEnabled && limitMinutes !== null && (
        <div className="px-4 py-3 rounded-xl text-sm font-medium bg-info-50 dark:bg-info-900/20 text-info-700 dark:text-info-300 border border-info-100 dark:border-info-800 space-y-2">
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="min-w-0">
              {interpolate(t("parentStudyLimitBanner"), { name: firstName, limit: limitMinutes })}
              {" "}
              <Link to="/parent/study-limits" className="underline font-semibold">{t("parentManageLimits")}</Link>
            </span>
          </div>
          {limitMinutes > 0 && <UsageBar used={usedToday} limit={limitMinutes} className="pl-7" />}
        </div>
      )}

      {isRealStudent && expiryWarn && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-xl text-sm font-medium bg-warning-50 dark:bg-warning-900/20 text-warning-700 dark:text-warning-300 border border-warning-100 dark:border-warning-800">
          <div className="flex items-center gap-2 min-w-0">
            <CreditCard className="w-4 h-4 flex-shrink-0" />
            <span className="min-w-0">
              {interpolate(t("parentPlanExpiresIn"), {
                name: firstName,
                when: daysLeft === 0 ? t("parentLessThanADay") : interpolate(t("parentDaysCount"), { n: daysLeft ?? 0 }),
              })}
            </span>
          </div>
          <button
            onClick={() => setShowSubModal(true)}
            className="text-xs font-bold bg-warning-500 hover:bg-warning-600 text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            {t("parentRenewNow")}
          </button>
        </div>
      )}
      {isRealStudent && !subActive && !expiryWarn && (studentSub as any) && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-xl text-sm font-medium bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-300 border border-danger-100 dark:border-danger-800">
          <div className="flex items-center gap-2 min-w-0">
            <CreditCard className="w-4 h-4 flex-shrink-0" />
            <span className="min-w-0">{interpolate(t("parentNoActiveSubscription"), { name: firstName })}</span>
          </div>
          <button
            onClick={() => setShowSubModal(true)}
            className="text-xs font-bold bg-danger-500 hover:bg-danger-600 text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            {t("parentSubscribe")}
          </button>
        </div>
      )}

      {approvedChildIds.length > 1 && <AllChildrenSummaryCard studentIds={approvedChildIds} students={students} />}

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <ChildSelector children={students} selectedChildId={selectedChildId} onSelect={setSelectedChildId} />

        <div className="p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{selChild?.student_name ?? t("parentStudentFallback")}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {interpolate(t("parentClassBoard"), { cls: selChild?.student_class ?? "–", board: selChild?.student_board ?? "–" })}
                {selChild?.relationship ? ` · ${selChild.relationship}` : ""}
              </p>
              {selChild?.approved_at && (
                <p className="text-xs text-success-600 dark:text-success-400 truncate">
                  {interpolate(t("parentLinkedSince"), { date: formatDayMonYear(selChild.approved_at) })}
                </p>
              )}
            </div>
            <div className="flex items-center flex-wrap gap-3">
              <div className="text-center">
                <p className="text-2xl font-black text-primary-600 dark:text-primary-400">{Math.round(s.avg_quiz_score)}%</p>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{t("parentAvgQuizScore")}</p>
              </div>
              <div className="w-px h-10 bg-gray-200 dark:bg-gray-700 hidden xs:block" />
              <div className="text-center" title={s.attendance === null ? (s.insufficient_data_fields.attendance ?? undefined) : undefined}>
                <p className={`text-2xl font-black ${s.attendance === null ? "text-gray-300 dark:text-gray-600" : "text-gray-900 dark:text-white"}`}>
                  {s.attendance === null ? t("parentNA") : `${s.attendance}%`}
                </p>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{t("parentAttendance")}</p>
              </div>
              <div className="w-px h-10 bg-gray-200 dark:bg-gray-700 hidden xs:block" />
              <div className="text-center" title={rankPct === null ? (s.insufficient_data_fields.rank_percentile ?? undefined) : undefined}>
                <p className={`text-2xl font-black ${rankPct === null ? "text-gray-300 dark:text-gray-600" : "text-gray-900 dark:text-white"}`}>
                  {rankPct === null ? t("parentNA") : interpolate(t("parentTopPercent"), { n: Math.round(rankPct) })}
                </p>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{t("parentRank")}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Video}    label={t("parentVideosWatched")}  value={s.total_videos_watched}    color="bg-indigo-500" />
            <StatCard icon={Trophy}   label={t("parentQuizzesDone")}    value={s.total_quizzes_completed} color="bg-amber-500" />
            <StatCard icon={CheckCircle} label={t("parentAvgQuizScore")} value={`${Math.round(s.avg_quiz_score)}%`} color="bg-emerald-500" />
            <StatCard icon={BookOpen} label={t("parentSubjectsTracked")} value={resolvedSubjects.length}   color="bg-rose-500" />
          </div>

          {selChild && (
            <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-700">
              <ApprovalModeToggle link={selChild} />
            </div>
          )}

          {isRealStudent && (studentSub as any) && (
            <div className="flex items-center justify-between gap-2 flex-wrap pt-3 mt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${subActive ? "bg-primary-50 dark:bg-primary-900/30" : "bg-gray-100 dark:bg-gray-700"}`}>
                  {subPlan === "premium" ? (
                    <Crown className={`w-4 h-4 ${subActive ? "text-primary-500" : "text-gray-400"}`} />
                  ) : (
                    <CreditCard className={`w-4 h-4 ${subActive ? "text-primary-500" : "text-gray-400"}`} />
                  )}
                </div>
                <div className="min-w-0 truncate">
                  <span className="text-sm font-semibold capitalize text-gray-800 dark:text-gray-200">{interpolate(t("parentPlanLabel"), { plan: subPlan })}</span>
                  {subActive && daysLeft !== null ? (
                    <span className={`ml-2 text-xs font-medium ${daysLeft <= 7 ? "text-warning-500" : "text-gray-400"}`}>
                      · {daysLeft === 0 ? t("parentExpiresToday") : interpolate(t("parentDaysLeftShort"), { n: daysLeft })}
                    </span>
                  ) : !subActive ? (
                    <span className="ml-2 text-xs font-medium text-danger-500">· {t("parentExpired")}</span>
                  ) : null}
                </div>
              </div>
              <button
                onClick={() => setShowSubModal(true)}
                className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
              >
                {subActive ? t("parentManage") : t("parentSubscribe")}
              </button>
            </div>
          )}
        </div>
      </div>

      {approvalsCard}

      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {([
          { key: "overview",   label: t("overview"),       icon: BarChart2  },
          { key: "activity",   label: t("activity"),       icon: Activity   },
          { key: "reports",    label: t("parentWeeklyReport"), icon: Calendar   },
          { key: "readiness",  label: t("examReadiness"), icon: GraduationCap },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 flex-1 justify-center py-2 text-xs font-semibold rounded-lg transition-all min-w-0 ${
              activeTab === key
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" /> <span className="hidden sm:block truncate">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{t("activityWindow")}</span>
        <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {DAYS_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setSummaryDays(value); setWeakTopicsPage(0); }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                summaryDays === value
                  ? "bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-300 shadow-sm"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary-500" /> {t("subjectPerformance")}
            </h3>
            {resolvedSubjects.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title={t("parentNoSubjectData")}
                description={s.insufficient_data_fields.subjects ?? t("parentNoSubjectDataDesc")}
              />
            ) : (
              <div className="space-y-4">
                {resolvedSubjects.map((subj, i) => (
                  <SubjectBar
                    key={subj.subject_id}
                    name={subjectNameById[subj.subject_id]}
                    score={subj.avg_score}
                    color={SUBJECT_COLORS[i % SUBJECT_COLORS.length]}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning-500" /> {t("parentWeakAreas")}
            </h3>
            {s.weak_topics.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">{t("parentNoWeakTopics")}</p>
            ) : (
              <>
                <div className="space-y-3">
                  {s.weak_topics
                    .slice(clampedWeakTopicsPage * PAGE_SIZE, clampedWeakTopicsPage * PAGE_SIZE + PAGE_SIZE)
                    .map((wt) => (
                      <div key={wt.topic_id} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-danger-50 dark:bg-danger-900/30 flex items-center justify-center text-danger-500 text-xs font-bold flex-shrink-0">
                          {Math.round(wt.accuracy)}%
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                            {interpolate(t("parentTopicShort"), { id: wt.topic_id.slice(0, 8) })}
                          </p>
                          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-danger-400 rounded-full" style={{ width: `${wt.accuracy}%` }} />
                          </div>
                        </div>
                        <span className="text-xs font-medium text-gray-400 flex-shrink-0">{interpolate(t("parentAttemptsCount"), { n: wt.attempts })}</span>
                      </div>
                    ))}
                </div>
                <Pagination
                  page={clampedWeakTopicsPage}
                  totalPages={weakTopicsTotalPages}
                  onPageChange={setWeakTopicsPage}
                  summary={`${clampedWeakTopicsPage * PAGE_SIZE + 1}–${Math.min(s.weak_topics.length, (clampedWeakTopicsPage + 1) * PAGE_SIZE)} of ${s.weak_topics.length}`}
                />
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="space-y-5 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-success-500" /> {t("todayActivity")}
            </h3>
            {s.activity_today === null ? (
              <EmptyState
                icon={Activity}
                title={t("parentNotAvailableYet")}
                description={s.insufficient_data_fields.activity_today ?? t("parentTodayActivityUnavailable")}
              />
            ) : (
              <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
                <Tile label={t("minutesStudied")} value={s.activity_today.study_minutes} />
                <Tile label={t("parentVideosWatched")} value={s.activity_today.videos_watched} />
                <Tile label={t("parentQuizzesDone")} value={s.activity_today.quizzes_completed} />
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-primary-500" /> {t("studyTimeWeek")}
            </h3>
            {s.activity_week === null ? (
              <EmptyState
                icon={Clock}
                title={t("parentNotAvailableYet")}
                description={s.insufficient_data_fields.activity_week ?? t("parentWeekActivityUnavailable")}
              />
            ) : (
              <>
                <BarChart data={s.activity_week.map(d => ({ label: d.day, value: d.minutes }))} unit={t("parentMin")} />
                {s.study_hours_week !== null && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                    {interpolate(t("parentStudyHoursThisWeek"), { hours: s.study_hours_week })}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary-500" /> {t("parentMonthlyTrends")}
            </h3>
            {s.monthly_trends === null ? (
              <EmptyState
                icon={BarChart2}
                title={t("parentNotAvailableYet")}
                description={s.insufficient_data_fields.monthly_trends ?? t("parentMonthlyTrendsUnavailable")}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t("parentStudyHours")}</p>
                  <BarChart
                    data={s.monthly_trends.study_hours.map((v, i) => ({ label: monthLabels[i] ?? "", value: Math.round(v * 10) / 10 }))}
                    unit={t("parentHoursUnit")}
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t("parentQuizScores")}</p>
                  <BarChart
                    data={s.monthly_trends.quiz_scores.map((v, i) => ({ label: monthLabels[i] ?? "", value: Math.round(v) }))}
                    unit="%"
                    colorClass="bg-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "reports" && (
        <div className="space-y-5 animate-fade-in">
          <div className="bg-primary-600 text-white rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-white/70" />
              <h3 className="font-bold text-lg">{t("weekSummary")}</h3>
            </div>
            {s.weekly_report === null ? (
              <>
                <p className="text-white/70 text-sm mb-4">{s.insufficient_data_fields.weekly_report ?? t("parentWeeklyReportUnavailable")}</p>
                <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
                  {[
                    { label: t("parentVideosWatched"),  value: s.total_videos_watched     },
                    { label: t("parentQuizzesDone"),    value: s.total_quizzes_completed  },
                    { label: t("parentAvgQuizScore"),   value: `${Math.round(s.avg_quiz_score)}%` },
                  ].map(m => (
                    <div key={m.label} className="bg-white/10 backdrop-blur rounded-xl p-3 text-center min-w-0">
                      <p className="text-2xl font-black truncate">{m.value}</p>
                      <p className="text-white/60 text-xs truncate">{m.label}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: t("parentStudyHours"),     value: `${s.weekly_report.study_hours}h` },
                  { label: t("parentVideosWatched"),  value: s.weekly_report.videos_watched },
                  { label: t("parentAvgQuizScore"),   value: `${Math.round(s.weekly_report.quiz_score_avg)}%` },
                  { label: t("parentRank"),           value: s.weekly_report.rank_percentile === null ? t("parentNA") : interpolate(t("parentTopPercent"), { n: Math.round(s.weekly_report.rank_percentile) }) },
                ].map(m => (
                  <div key={m.label} className="bg-white/10 backdrop-blur rounded-xl p-3 text-center min-w-0">
                    <p className="text-2xl font-black truncate">{m.value}</p>
                    <p className="text-white/60 text-xs truncate">{m.label}</p>
                  </div>
                ))}
              </div>
            )}
            {rankPct === null && (
              <div className="mt-4 flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2.5">
                <HelpCircle className="w-4 h-4 text-white/70 flex-shrink-0" />
                <span className="text-sm font-medium min-w-0">
                  {s.insufficient_data_fields.rank_percentile ?? t("parentRankUnavailable")}
                </span>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-warning-500" /> {t("parentGoalProgress")}
            </h3>
            <EmptyState
              icon={Zap}
              title={t("parentNotAvailableYet")}
              description={t("parentGoalTrackingUnavailable")}
            />
          </div>
        </div>
      )}

      {activeTab === "readiness" && (
        <div className="space-y-5 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap className="w-5 h-5 text-primary-500" />
              <h3 className="font-bold text-gray-900 dark:text-white">{t("parentExamReadinessScore")}</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{t("parentExamReadinessDesc")}</p>
            {s.exam_readiness === null ? (
              <EmptyState
                icon={GraduationCap}
                title={t("parentNotAvailableYet")}
                description={s.insufficient_data_fields.exam_readiness ?? t("parentExamReadinessUnavailable")}
              />
            ) : readinessRows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">{t("parentNoSubjectData")}</p>
            ) : (
              <div className="space-y-4">
                {readinessRows.map((row, i) => (
                  <SubjectBar
                    key={`${row.name}-${i}`}
                    name={row.name}
                    score={row.score}
                    color={row.score >= 80 ? "#22c55e" : row.score >= 60 ? "#f59e0b" : "#ef4444"}
                    tag={readinessLabel(row.score)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary-500" /> {t("parentAiRiskPrediction")}
            </h3>
            <EmptyState
              icon={Brain}
              title={t("parentNotAvailableYet")}
              description={t("parentRiskPredictionUnavailable")}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { icon: Rocket,       label: t("upcoming"),               to: "/roadmap" },
          { icon: MessageSquare,label: t("parentCommunication"),    to: "/parent/communication" },
          { icon: Shield,       label: t("parentMonitorChats"),     to: `/parent/monitor/${selectedChildId ?? ""}`, disabled: !isRealStudent },
          { icon: Calendar,     label: t("bookMeeting"),            to: "/parent/meetings" },
          { icon: Clock,        label: t("studyLimits"),            to: "/parent/study-limits" },
          { icon: Bell,         label: t("notifPrefs"),             to: "/parent/notification-prefs" },
          { icon: Settings,     label: t("settings"),               to: "/parent/settings" },
        ].map(a => a.disabled ? (
          <div
            key={a.label}
            aria-disabled="true"
            title={t("parentAvailableOnceApproved")}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-400 dark:text-gray-600 opacity-60 cursor-not-allowed min-w-0"
          >
            <a.icon className="w-6 h-6" />
            <span className="text-xs font-semibold truncate max-w-full">{a.label}</span>
          </div>
        ) : (
          <Link
            key={a.label}
            to={a.to}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary-200 dark:hover:border-primary-700 hover:shadow-sm transition-all min-w-0"
          >
            <a.icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            <span className="text-xs font-semibold truncate max-w-full">{a.label}</span>
          </Link>
        ))}
        <button
          onClick={() => setShowSubModal(true)}
          className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all min-w-0 ${
            expiryWarn
              ? "bg-danger-50 dark:bg-danger-900/20 border-danger-200 dark:border-danger-800 text-danger-700 dark:text-danger-300 hover:shadow-sm"
              : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary-200 dark:hover:border-primary-700 hover:shadow-sm"
          }`}
        >
          <CreditCard className={`w-6 h-6 ${expiryWarn ? "text-danger-500" : "text-primary-600 dark:text-primary-400"}`} />
          <span className="text-xs font-semibold truncate max-w-full">{subActive ? t("subscription") : t("parentSubscribe")}</span>
        </button>
      </div>

      {showSubModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-md animate-fade-in">
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 dark:text-white text-lg truncate">
                  {interpolate(t(subActive ? "parentRenewPlanFor" : "parentSubscribeFor"), { name: firstName })}
                </h3>
                {subActive && daysLeft !== null && (
                  <p className={`text-xs mt-0.5 truncate ${daysLeft <= 7 ? "text-warning-500 font-semibold" : "text-gray-400"}`}>
                    {t("parentCurrentPlan")}: <span className="capitalize font-bold">{subPlan}</span> · {daysLeft === 0 ? t("parentExpiresToday") : interpolate(t("parentDaysRemaining"), { n: daysLeft })}
                  </p>
                )}
                {!subActive && <p className="text-xs font-medium text-danger-500 mt-0.5">{t("parentNoActivePlan")}</p>}
              </div>
              <button
                onClick={() => setShowSubModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {plans.map(p => (
                <button
                  key={p.plan_key}
                  onClick={() => handleParentSubscribe(p.plan_key)}
                  disabled={!!payingPlan}
                  className={`w-full relative flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${
                    p.is_popular
                      ? "border-primary-400 dark:border-primary-500 ring-1 ring-primary-400"
                      : "border-gray-200 dark:border-gray-700 hover:border-primary-400"
                  } ${payingPlan === p.plan_key ? "opacity-60" : "hover:bg-primary-50 dark:hover:bg-primary-900/20"}`}
                >
                  {p.badge && (
                    <span className="absolute -top-2.5 right-4 bg-primary-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {p.badge}
                    </span>
                  )}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                      {p.is_popular ? <Crown className="w-5 h-5 text-primary-600" /> : p.badge ? <Star className="w-5 h-5 text-primary-600" /> : <Zap className="w-5 h-5 text-gray-500" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white truncate">{p.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight truncate">{p.description ?? interpolate(t("parentDaysFullAccess"), { n: p.duration_days })}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="font-bold text-primary-600 dark:text-primary-400 text-lg leading-tight">₹{p.price}</p>
                    <p className="text-xs text-gray-400">/{p.duration_days}d</p>
                  </div>
                </button>
              ))}

              <p className="text-xs text-gray-400 text-center pt-1">
                {interpolate(t("parentPaymentFooter"), { name: selChild?.student_name ?? "" })}
              </p>
            </div>
          </div>
        </div>
      )}

      <PaymentMethodSheet
        visible={!!methodSheetOrder}
        amountLabel={methodSheetOrder ? `₹${plans.find(p => p.plan_key === methodSheetOrder.planKey)?.price ?? ""}` : ""}
        planName={methodSheetOrder ? (plans.find(p => p.plan_key === methodSheetOrder.planKey)?.name ?? methodSheetOrder.planKey) : ""}
        onSelect={handleMethodSelected}
        onCancel={() => setMethodSheetOrder(null)}
      />
    </div>
  );
}
