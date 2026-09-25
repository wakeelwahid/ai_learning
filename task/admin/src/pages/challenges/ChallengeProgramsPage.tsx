import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { challengeProgramApi, quizApi } from "@/lib/api";
import DataTable from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import {
  Plus, Trash2, Flag, Eye, Send, Archive, RotateCcw, BarChart2, Video, FileQuestion,
  Dumbbell, Swords, BookOpenCheck,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChallengeProgram {
  id: string;
  title: string;
  description: string | null;
  duration_days: number;
  status: "draft" | "published" | "archived";
  badge_type: string | null;
  completion_xp: number;
  completion_ep: number;
  participant_count: number;
  created_at: string;
  days: ChallengeDay[];
}

interface ChallengeDay {
  id: string;
  day_number: number;
  title: string | null;
  tasks: ChallengeTask[];
}

interface ChallengeTask {
  id: string;
  task_type: "video" | "quiz" | "practice" | "battle" | "study_session";
  content_ref: string;
  title: string;
  is_required: boolean;
  sequence: number;
  xp_reward: number;
  ep_reward: number;
}

interface CreateForm {
  title: string;
  description: string;
  duration_days: number;
  badge_type: string;
  completion_xp: number;
  completion_ep: number;
}

interface TaskFormRow {
  task_type: ChallengeTask["task_type"];
  content_ref: string;
  title: string;
  is_required: boolean;
  xp_reward: number;
  ep_reward: number;
}

interface DayFormRow {
  day_number: number;
  title: string;
  tasks: TaskFormRow[];
}

interface BuilderForm {
  days: DayFormRow[];
}

const TASK_TYPE_ICON: Record<ChallengeTask["task_type"], typeof Video> = {
  video: Video, quiz: FileQuestion, practice: Dumbbell, battle: Swords, study_session: BookOpenCheck,
};

const STATUS_BADGE: Record<ChallengeProgram["status"], string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  published: "bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-300",
  archived: "bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-300",
};

const BADGE_OPTIONS = [
  "", "first_video", "quiz_ace", "chapter_complete", "subject_complete", "battle_champion",
  "quiz_warrior", "top_performer", "elite_learner", "challenge_complete",
];

export default function ChallengeProgramsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [builderProgramId, setBuilderProgramId] = useState<string | null>(null);
  const [previewProgram, setPreviewProgram] = useState<ChallengeProgram | null>(null);
  const [analyticsProgramId, setAnalyticsProgramId] = useState<string | null>(null);

  const { data: programs = [], isLoading, isError, refetch } = useQuery<ChallengeProgram[]>({
    queryKey: ["admin-challenge-programs"],
    queryFn: () => challengeProgramApi.adminList().then((r) => r.data),
  });

  const { register, handleSubmit, reset } = useForm<CreateForm>({
    defaultValues: { duration_days: 7, completion_xp: 100, completion_ep: 50, badge_type: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) =>
      challengeProgramApi.adminCreate({
        ...data,
        duration_days: Number(data.duration_days),
        completion_xp: Number(data.completion_xp),
        completion_ep: Number(data.completion_ep),
        badge_type: data.badge_type || null,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-challenge-programs"] });
      toast.success("Challenge created. Now add days & tasks.");
      reset();
      setShowCreate(false);
      setBuilderProgramId(res.data.id);
    },
    onError: () => toast.error("Failed to create challenge"),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => challengeProgramApi.adminPublish(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-challenge-programs"] }); toast.success("Published!"); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Could not publish"),
  });
  const unpublishMutation = useMutation({
    mutationFn: (id: string) => challengeProgramApi.adminUnpublish(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-challenge-programs"] }); toast.success("Moved back to draft"); },
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => challengeProgramApi.adminArchive(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-challenge-programs"] }); toast.success("Archived"); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => challengeProgramApi.adminDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-challenge-programs"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Only a draft challenge can be deleted"),
  });

  const columns = [
    { header: "Title", accessor: (r: ChallengeProgram) => (
      <div>
        <p className="font-medium text-gray-900 dark:text-gray-100">{r.title}</p>
        <p className="text-xs text-gray-400">{r.duration_days} days</p>
      </div>
    ) },
    { header: "Status", accessor: (r: ChallengeProgram) => (
      <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
    ) },
    { header: "Participants", accessor: (r: ChallengeProgram) => r.participant_count },
    { header: "Rewards", accessor: (r: ChallengeProgram) => (
      <span className="text-xs text-gray-500">+{r.completion_xp} XP, +{r.completion_ep} EP{r.badge_type ? `, 🏅 ${r.badge_type}` : ""}</span>
    ) },
    { header: "Actions", accessor: (r: ChallengeProgram) => (
      <div className="flex items-center gap-1.5 flex-wrap">
        <button title="Edit days/tasks" onClick={() => setBuilderProgramId(r.id)}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
          <Plus className="w-4 h-4" />
        </button>
        <button title="Preview" onClick={() => setPreviewProgram(r)}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
          <Eye className="w-4 h-4" />
        </button>
        <button title="Analytics" onClick={() => setAnalyticsProgramId(r.id)}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
          <BarChart2 className="w-4 h-4" />
        </button>
        {r.status === "draft" && (
          <button title="Publish" onClick={() => publishMutation.mutate(r.id)}
            className="p-1.5 rounded hover:bg-success-50 dark:hover:bg-success-900/30 text-success-600">
            <Send className="w-4 h-4" />
          </button>
        )}
        {r.status === "published" && (
          <button title="Unpublish" onClick={() => unpublishMutation.mutate(r.id)}
            className="p-1.5 rounded hover:bg-warning-50 dark:hover:bg-warning-900/30 text-warning-600">
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        {r.status !== "archived" && (
          <button title="Archive" onClick={() => archiveMutation.mutate(r.id)}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <Archive className="w-4 h-4" />
          </button>
        )}
        <button title="Delete (draft only)" disabled={r.status !== "draft"}
          onClick={() => window.confirm(`Delete "${r.title}"? This cannot be undone.`) && deleteMutation.mutate(r.id)}
          className="p-1.5 rounded hover:bg-danger-50 dark:hover:bg-danger-900/30 text-danger-500 disabled:opacity-30 disabled:cursor-not-allowed">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Flag className="w-5 h-5 text-primary-600" /> Challenges
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Multi-day learning programs with mixed tasks — videos, quizzes, practice, battles, and study sessions.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> New Challenge
        </button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : isError ? (
          <div className="p-8 text-center text-danger-600 dark:text-danger-400">
            Failed to load. <button onClick={() => refetch()} className="underline">Retry</button>
          </div>
        ) : programs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No challenges yet. Create one to get started.</div>
        ) : (
          <DataTable<ChallengeProgram> columns={columns} data={programs} searchKey="title" />
        )}
      </div>

      {/* ── Create Challenge Modal ── */}
      {showCreate && (
        <Modal title="New Challenge" onClose={() => { setShowCreate(false); reset(); }}>
          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <div>
              <label className="label">Title</label>
              <input className="input" {...register("title", { required: true })} placeholder="e.g. 7-Day Maths Challenge" />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input" rows={2} {...register("description")} placeholder="What will students learn?" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Duration (days)</label>
                <input type="number" min={1} max={90} className="input" {...register("duration_days", { required: true, valueAsNumber: true })} />
              </div>
              <div>
                <label className="label">Completion XP</label>
                <input type="number" min={0} className="input" {...register("completion_xp", { valueAsNumber: true })} />
              </div>
              <div>
                <label className="label">Completion EP</label>
                <input type="number" min={0} className="input" {...register("completion_ep", { valueAsNumber: true })} />
              </div>
            </div>
            <div>
              <label className="label">Completion badge (optional)</label>
              <select className="input" {...register("badge_type")}>
                {BADGE_OPTIONS.map((b) => <option key={b} value={b}>{b || "— none —"}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => { setShowCreate(false); reset(); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create & Add Days"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Builder Modal (Days & Tasks) ── */}
      {builderProgramId && (
        <ChallengeBuilderModal programId={builderProgramId} onClose={() => setBuilderProgramId(null)} />
      )}

      {/* ── Preview Modal ── */}
      {previewProgram && (
        <Modal title={`Preview: ${previewProgram.title}`} onClose={() => setPreviewProgram(null)} size="lg">
          <ChallengePreview program={previewProgram} />
        </Modal>
      )}

      {/* ── Analytics Modal ── */}
      {analyticsProgramId && (
        <ChallengeAnalyticsModal programId={analyticsProgramId} onClose={() => setAnalyticsProgramId(null)} />
      )}
    </div>
  );
}

// ─── Builder Modal ──────────────────────────────────────────────────────────
function ChallengeBuilderModal({ programId, onClose }: { programId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: program, isLoading } = useQuery<ChallengeProgram>({
    queryKey: ["admin-challenge-program", programId],
    queryFn: () => challengeProgramApi.adminGet(programId).then((r) => r.data),
  });

  const [newDayNumber, setNewDayNumber] = useState(1);
  const [newDayTitle, setNewDayTitle] = useState("");

  const addDayMutation = useMutation({
    mutationFn: () => challengeProgramApi.adminAddDay(programId, { day_number: newDayNumber, title: newDayTitle || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-challenge-program", programId] });
      qc.invalidateQueries({ queryKey: ["admin-challenge-programs"] });
      setNewDayTitle("");
      setNewDayNumber((n) => n + 1);
      toast.success("Day added");
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Could not add day"),
  });

  const deleteDayMutation = useMutation({
    mutationFn: (dayId: string) => challengeProgramApi.adminDeleteDay(dayId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-challenge-program", programId] });
      qc.invalidateQueries({ queryKey: ["admin-challenge-programs"] });
    },
  });

  return (
    <Modal title={`Build: ${program?.title ?? "…"}`} onClose={onClose} size="xl">
      {isLoading ? (
        <div className="p-8 text-center text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-end gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40">
            <div>
              <label className="label">Day #</label>
              <input type="number" min={1} className="input w-24" value={newDayNumber}
                onChange={(e) => setNewDayNumber(Number(e.target.value))} />
            </div>
            <div className="flex-1">
              <label className="label">Day title (optional)</label>
              <input className="input" value={newDayTitle} onChange={(e) => setNewDayTitle(e.target.value)} placeholder="e.g. Warm-up day" />
            </div>
            <button className="btn-primary" onClick={() => addDayMutation.mutate()} disabled={addDayMutation.isPending}>
              <Plus className="w-4 h-4" /> Add Day
            </button>
          </div>

          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {(program?.days ?? []).sort((a, b) => a.day_number - b.day_number).map((day) => (
              <ChallengeDayCard key={day.id} day={day} programId={programId} onDeleteDay={() => deleteDayMutation.mutate(day.id)} />
            ))}
            {(program?.days ?? []).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No days yet — add Day 1 above.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function ChallengeDayCard({ day, programId, onDeleteDay }: { day: ChallengeDay; programId: string; onDeleteDay: () => void }) {
  const qc = useQueryClient();
  const [showTaskForm, setShowTaskForm] = useState(false);
  const { register, handleSubmit, reset, watch } = useForm<TaskFormRow>({
    defaultValues: { task_type: "video", is_required: true, xp_reward: 10, ep_reward: 5 },
  });
  const taskType = watch("task_type");

  const addTaskMutation = useMutation({
    mutationFn: (data: TaskFormRow) =>
      challengeProgramApi.adminAddTask(day.id, {
        ...data,
        xp_reward: Number(data.xp_reward),
        ep_reward: Number(data.ep_reward),
        sequence: day.tasks.length,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-challenge-program", programId] });
      reset();
      setShowTaskForm(false);
      toast.success("Task added");
    },
    onError: () => toast.error("Could not add task"),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => challengeProgramApi.adminDeleteTask(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-challenge-program", programId] }),
  });

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900 dark:text-gray-100">
          Day {day.day_number}{day.title ? ` — ${day.title}` : ""}
        </h4>
        <button onClick={onDeleteDay} className="text-danger-500 hover:text-danger-600" title="Delete day">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2 mb-3">
        {day.tasks.sort((a, b) => a.sequence - b.sequence).map((task) => {
          const Icon = TASK_TYPE_ICON[task.task_type];
          return (
            <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 text-sm">
              <Icon className="w-4 h-4 text-primary-500 flex-shrink-0" />
              <span className="flex-1 truncate">{task.title}</span>
              <span className="text-xs text-gray-400">{task.task_type}</span>
              {!task.is_required && <span className="badge bg-gray-100 text-gray-500 text-xs">optional</span>}
              <span className="text-xs text-gray-400">+{task.xp_reward} XP</span>
              <button onClick={() => deleteTaskMutation.mutate(task.id)} className="text-danger-400 hover:text-danger-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
        {day.tasks.length === 0 && <p className="text-xs text-gray-400">No tasks yet.</p>}
      </div>

      {showTaskForm ? (
        <form onSubmit={handleSubmit((d) => addTaskMutation.mutate(d))} className="space-y-2 p-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg">
          <div className="grid grid-cols-2 gap-2">
            <select className="input text-sm" {...register("task_type")}>
              <option value="video">Video</option>
              <option value="quiz">Quiz</option>
              <option value="practice">Practice</option>
              <option value="battle">Battle</option>
              <option value="study_session">Study Session</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("is_required")} defaultChecked /> Required
            </label>
          </div>
          <ContentRefPicker taskType={taskType} register={register} />
          <input className="input text-sm" {...register("title", { required: true })} placeholder="Display title (e.g. 'Watch: Intro to Fractions')" />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min={0} className="input text-sm" {...register("xp_reward", { valueAsNumber: true })} placeholder="XP reward" />
            <input type="number" min={0} className="input text-sm" {...register("ep_reward", { valueAsNumber: true })} placeholder="EduPoints reward" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => { setShowTaskForm(false); reset(); }}>Cancel</button>
            <button type="submit" className="btn-primary text-sm" disabled={addTaskMutation.isPending}>Add Task</button>
          </div>
        </form>
      ) : (
        <button className="btn-secondary text-sm w-full" onClick={() => setShowTaskForm(true)}>
          <Plus className="w-3.5 h-3.5" /> Add Task
        </button>
      )}
    </div>
  );
}

// Quiz/practice get a real picker since quizApi.adminList already returns a
// flat, searchable list. Video/battle/study_session have no equivalent flat
// listing in this admin panel (video only exists via the board→...→topic
// cascade on ContentManagerPage) — for those, the admin pastes a known id,
// matching how DailyChallenge's target_ref field already works elsewhere.
function ContentRefPicker({ taskType, register }: { taskType: ChallengeTask["task_type"]; register: any }) {
  const { data: quizList = [] } = useQuery({
    queryKey: ["admin-quizzes-for-picker", taskType],
    queryFn: () =>
      quizApi.adminList({ quiz_type: taskType === "practice" ? "practice" : undefined, limit: 50 })
        .then((r) => {
          const d = r.data;
          return Array.isArray(d) ? d : d?.quizzes ?? d?.items ?? [];
        }),
    enabled: taskType === "quiz" || taskType === "practice",
  });

  if (taskType === "quiz" || taskType === "practice") {
    return (
      <select className="input text-sm" {...register("content_ref", { required: true })}>
        <option value="">Select a {taskType}…</option>
        {quizList.map((q: any) => (
          <option key={q.id} value={q.id}>{q.title} ({q.quiz_type})</option>
        ))}
      </select>
    );
  }

  return (
    <input className="input text-sm" {...register("content_ref", { required: true })}
      placeholder={
        taskType === "video" ? "Video ID (from Content Manager)"
        : taskType === "battle" ? "Battle ID"
        : "Topic ID (or leave blank for any revision session)"
      } />
  );
}

// ─── Preview ────────────────────────────────────────────────────────────────
function ChallengePreview({ program }: { program: ChallengeProgram }) {
  return (
    <div className="space-y-4">
      {program.description && <p className="text-sm text-gray-600 dark:text-gray-400">{program.description}</p>}
      <div className="flex gap-4 text-sm text-gray-500">
        <span>{program.duration_days} days</span>
        <span>+{program.completion_xp} XP on completion</span>
        <span>+{program.completion_ep} EP on completion</span>
        {program.badge_type && <span>🏅 {program.badge_type}</span>}
      </div>
      <div className="space-y-3">
        {program.days.sort((a, b) => a.day_number - b.day_number).map((day, i) => (
          <div key={day.id} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-bold flex items-center justify-center">
                {day.day_number}
              </div>
              {i < program.days.length - 1 && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />}
            </div>
            <div className="flex-1 pb-4">
              <p className="font-medium text-gray-900 dark:text-gray-100 mb-1.5">{day.title || `Day ${day.day_number}`}</p>
              <div className="space-y-1.5">
                {day.tasks.sort((a, b) => a.sequence - b.sequence).map((task) => {
                  const Icon = TASK_TYPE_ICON[task.task_type];
                  return (
                    <div key={task.id} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Icon className="w-3.5 h-3.5 text-primary-500" />
                      <span>{task.title}</span>
                      {task.is_required ? (
                        <span className="badge bg-primary-50 text-primary-600 text-xs">required</span>
                      ) : (
                        <span className="badge bg-gray-100 text-gray-500 text-xs">optional</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Analytics ──────────────────────────────────────────────────────────────
function ChallengeAnalyticsModal({ programId, onClose }: { programId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-challenge-analytics", programId],
    queryFn: () => challengeProgramApi.adminAnalytics(programId).then((r) => r.data),
  });

  return (
    <Modal title="Challenge Analytics" onClose={onClose}>
      {isLoading ? (
        <div className="p-8 text-center text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{data?.total_participants ?? 0}</p>
              <p className="text-xs text-gray-400">Participants</p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{Math.round((data?.completion_rate ?? 0) * 100)}%</p>
              <p className="text-xs text-gray-400">Completion rate</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Per-day funnel</p>
            <div className="space-y-1.5">
              {(data?.per_day_funnel ?? []).map((d: any) => (
                <div key={d.day_number} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-16">Day {d.day_number}</span>
                  <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full"
                      style={{ width: `${data.total_participants ? (d.reached / data.total_participants) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-10 text-right">{d.reached}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
