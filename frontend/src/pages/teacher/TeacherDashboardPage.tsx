import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { teacherApi, contentApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { Card, CardHeader, CardTitle, EmptyState, Select, Tabs } from "@/components/ui";
import { SkeletonLine, SkeletonCardGrid } from "@/components/ui/Skeleton";
import {
  Users, UserCheck, Video, Trophy, Target, BookOpen,
  AlertTriangle, GraduationCap, AlertCircle,
} from "lucide-react";
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
  { key: "assignments", label: "My Assignments" },
  { key: "live", label: "My Live Classes" },
  { key: "attendance", label: "My Attendance" },
  { key: "analytics", label: "My Classroom Analytics" },
  { key: "announcements", label: "My Announcements" },
  { key: "support", label: "My Student Support" },
  { key: "parent", label: "Parent Connect" },
  { key: "ai", label: "AI Teaching Assistant" },
];

interface SubjectScoreItem {
  subject_id: string;
  avg_score: number;
  quizzes_completed: number;
  students_attempted: number;
}

interface WeakTopicItem {
  topic_id: string;
  students_struggling: number;
  avg_accuracy: number;
}

interface CohortResponse {
  board: string;
  class_number: number;
  cohort_size: number;
  active_students: number;
  total_videos_watched: number;
  total_quizzes_completed: number;
  avg_quiz_score: number;
  subjects: SubjectScoreItem[];
  weak_topics: WeakTopicItem[];
}

interface Board {
  id: string;
  name: string;
  code: string;
}

interface ClassRow {
  id: string;
  name: string;
  number: number;
}

interface SubjectRow {
  id: string;
  name: string;
  code: string;
}

const CLASS_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1);

const SUBJECT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6", "#8b5cf6", "#ec4899", "#0ea5e9"];

/** analytics_service's subject_id/topic_id are a taxonomy independent of
 * content_service's curriculum tables (see quiz_service's Quiz.subject_id —
 * a bare UUID column with no foreign key) — so some ids simply have no
 * matching content_service row for the currently selected class. Resolve
 * what we can from the class's own subject list; anything unresolved falls
 * back to a short, honest label instead of a raw UUID or a guessed name. */
function shortId(id: string): string {
  return id.slice(0, 8);
}

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

function SubjectBar({ name, score, color }: { name: string; score: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate min-w-0">{name}</span>
        <span className="text-sm font-bold text-gray-900 dark:text-white w-10 text-right flex-shrink-0">
          {Math.round(score)}%
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

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-2">
            <SkeletonLine className="w-8 h-8 rounded-xl" />
            <SkeletonLine className="w-3/4" />
            <SkeletonLine className="w-1/2" />
          </div>
        ))}
      </div>
      <SkeletonCardGrid count={2} />
    </div>
  );
}

export default function TeacherDashboardPage() {
  const [activeTab, setActiveTab] = useState("students");
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: boards, isLoading: boardsLoading, error: boardsError } = useQuery({
    queryKey: ["content-boards"],
    queryFn: () => contentApi.boards().then(r => r.data as Board[]),
    staleTime: 10 * 60_000,
  });

  const boardParam = searchParams.get("board") ?? "";
  const classParam = Number(searchParams.get("class") ?? "");

  const selectedBoardCode = boardParam || boards?.[0]?.code || "";
  const selectedBoard = boards?.find(b => b.code === selectedBoardCode) ?? boards?.[0];
  const selectedClassNumber = CLASS_NUMBERS.includes(classParam) ? classParam : 10;

  const setBoardCode = (code: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("board", code);
    next.set("class", String(selectedClassNumber));
    setSearchParams(next, { replace: true });
  };
  const setClassNumber = (num: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("board", selectedBoardCode);
    next.set("class", String(num));
    setSearchParams(next, { replace: true });
  };

  const {
    data: cohort,
    isLoading: cohortLoading,
    isFetching: cohortFetching,
    error: cohortError,
  } = useQuery({
    queryKey: ["teacher-cohort", selectedBoard?.name, selectedClassNumber],
    queryFn: () => teacherApi.cohort(selectedBoard!.name, selectedClassNumber).then(r => r.data as CohortResponse),
    enabled: !!selectedBoard?.name,
  });

  // Resolve subject_id -> display name from content_service's curriculum
  // for this exact board + class. Not every analytics subject_id will be
  // present here (quiz_service's subject_id has no FK into content_service),
  // so unresolved ids fall back to a short, honest label below rather than
  // a raw UUID or a guessed name.
  const { data: classesForBoard } = useQuery({
    queryKey: ["content-classes", selectedBoard?.id],
    queryFn: () => contentApi.classes(selectedBoard!.id).then(r => r.data as ClassRow[]),
    enabled: !!selectedBoard?.id,
    staleTime: 10 * 60_000,
  });
  const classRow = classesForBoard?.find(c => c.number === selectedClassNumber);

  const { data: subjectsForClass } = useQuery({
    queryKey: ["content-subjects", classRow?.id],
    queryFn: () => contentApi.subjects(classRow!.id).then(r => r.data as SubjectRow[]),
    enabled: !!classRow?.id,
    staleTime: 10 * 60_000,
  });
  const subjectNameById: Record<string, string> = {};
  for (const subj of subjectsForClass ?? []) subjectNameById[subj.id] = subj.name;

  const nameForSubject = (subjectId: string) => subjectNameById[subjectId] ?? `Subject ${shortId(subjectId)}`;
  const nameForTopic = (topicId: string) => `Topic ${shortId(topicId)}`;

  const cohortIsEmpty = !!cohort && cohort.cohort_size === 0;
  const hasNoBoards = !boardsLoading && !boardsError && (!boards || boards.length === 0);

  return (
    <div className="w-full space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Classroom</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Everything about your students, in one place
        </p>
      </div>

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === "students" && <MyClassroomSection />}
      {activeTab === "assignments" && <AssignmentsSection />}
      {activeTab === "live" && <LiveClassSection />}
      {activeTab === "announcements" && <AnnouncementsSection />}
      {activeTab === "attendance" && <AttendanceSection />}
      {activeTab === "support" && <StudentSupportSection />}
      {activeTab === "parent" && <ParentConnectSection />}
      {activeTab === "ai" && <AITeachingAssistantSection />}

      {activeTab === "analytics" && (
        <>
          {boardsLoading && (
            <>
              <SkeletonLine className="w-64 h-8" />
              <DashboardSkeleton />
            </>
          )}

          {boardsError && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-300 border border-danger-100 dark:border-danger-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{parseApiError(boardsError)}</span>
            </div>
          )}

          {hasNoBoards && (
            <EmptyState
              icon={BookOpen}
              title="No boards configured yet"
              description="There is no curriculum data available to select a board and class from."
            />
          )}

          {boards && boards.length > 0 && (
            <>
              <div className="flex items-center justify-end gap-3 flex-wrap">
                <Select
                  value={selectedBoardCode}
                  onChange={e => setBoardCode(e.target.value)}
                  options={boards.map(b => ({ value: b.code, label: b.name }))}
                  className="min-w-[140px]"
                />
                <Select
                  value={String(selectedClassNumber)}
                  onChange={e => setClassNumber(Number(e.target.value))}
                  options={CLASS_NUMBERS.map(n => ({ value: String(n), label: `Class ${n}` }))}
                  className="min-w-[120px]"
                />
              </div>

              {(cohortLoading || (cohortFetching && !cohort)) && <DashboardSkeleton />}

              {cohortError && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-300 border border-danger-100 dark:border-danger-800">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{parseApiError(cohortError)}</span>
                </div>
              )}

              {cohort && !cohortIsEmpty && (
                <>
                  <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard
              icon={Users}
              label="Cohort Size"
              value={cohort.cohort_size}
              color="bg-indigo-500"
            />
            <StatCard
              icon={UserCheck}
              label="Active Students"
              value={cohort.active_students}
              sub={cohort.cohort_size > 0 ? `${Math.round((cohort.active_students / cohort.cohort_size) * 100)}% of cohort` : undefined}
              color="bg-emerald-500"
            />
            <StatCard
              icon={Video}
              label="Videos Watched"
              value={cohort.total_videos_watched}
              color="bg-sky-500"
            />
            <StatCard
              icon={Trophy}
              label="Quizzes Completed"
              value={cohort.total_quizzes_completed}
              color="bg-amber-500"
            />
            <StatCard
              icon={Target}
              label="Avg Quiz Score"
              value={`${Math.round(cohort.avg_quiz_score)}%`}
              color="bg-rose-500"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="w-4 h-4 text-primary-500" /> Subject Performance
                </CardTitle>
              </CardHeader>
              {cohort.subjects.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No subject data yet for this cohort.</p>
              ) : (
                <div className="space-y-4">
                  {[...cohort.subjects]
                    .sort((a, b) => b.quizzes_completed - a.quizzes_completed)
                    .map((subj, i) => (
                      <div key={subj.subject_id}>
                        <SubjectBar
                          name={nameForSubject(subj.subject_id)}
                          score={subj.avg_score}
                          color={SUBJECT_COLORS[i % SUBJECT_COLORS.length]}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          {subj.quizzes_completed} quizzes completed · {subj.students_attempted} students attempted
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="w-4 h-4 text-warning-500" /> Weak Topics
                </CardTitle>
              </CardHeader>
              {cohort.weak_topics.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No weak topics identified for this cohort.</p>
              ) : (
                <div className="space-y-3">
                  {[...cohort.weak_topics]
                    .sort((a, b) => b.students_struggling - a.students_struggling)
                    .map(wt => (
                      <div key={wt.topic_id} className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-danger-50 dark:bg-danger-900/30 flex items-center justify-center text-danger-500 text-xs font-bold flex-shrink-0">
                          {Math.round(wt.avg_accuracy)}%
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                            {nameForTopic(wt.topic_id)}
                          </p>
                          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-danger-400 rounded-full" style={{ width: `${Math.max(0, Math.min(100, wt.avg_accuracy))}%` }} />
                          </div>
                        </div>
                        <span className="text-xs font-medium text-gray-400 flex-shrink-0">
                          {wt.students_struggling} struggling
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

              {cohortIsEmpty && (
                <EmptyState
                  icon={GraduationCap}
                  title="No students found for this board and class yet"
                  description="Once students complete their profile with this board and class, their cohort analytics will show up here."
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
