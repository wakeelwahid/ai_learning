import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppSelector } from "@/store";
import { challengeProgramApi } from "@/lib/api";
import {
  Flag, Trophy, Award, Lock, CheckCircle2, Video, FileQuestion, Dumbbell,
  Swords, BookOpenCheck, ChevronRight,
} from "lucide-react";
import BackButton from "@/components/ui/BackButton";
import toast from "react-hot-toast";

interface TaskProgress {
  id: string;
  task_type: "video" | "quiz" | "practice" | "battle" | "study_session";
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

interface ChallengeProgram {
  id: string;
  title: string;
  description: string | null;
  duration_days: number;
}

const TASK_TYPE_ICON: Record<TaskProgress["task_type"], typeof Video> = {
  video: Video, quiz: FileQuestion, practice: Dumbbell, battle: Swords, study_session: BookOpenCheck,
};

function taskLink(task: TaskProgress): string {
  switch (task.task_type) {
    case "video": return `/learn/video/${task.content_ref}`;
    case "quiz": return `/quiz/${task.content_ref}`;
    case "practice": return `/quiz/${task.content_ref}`;
    case "battle": return `/battle`;
    case "study_session": return `/revision`;
    default: return "#";
  }
}

export default function ChallengeDetailPage() {
  const { programId } = useParams<{ programId: string }>();
  const user = useAppSelector((s) => s.auth.user);

  const { data: program } = useQuery<ChallengeProgram>({
    queryKey: ["challenge-program", programId],
    queryFn: () => challengeProgramApi.getById(programId!).then((r) => r.data),
    enabled: !!programId,
  });

  const { data: enrollment, isLoading } = useQuery<EnrollmentProgress>({
    queryKey: ["challenge-enrollment", user?.id, programId],
    queryFn: () => challengeProgramApi.getEnrollment(user!.id, programId!).then((r) => r.data),
    enabled: !!user?.id && !!programId,
    refetchInterval: 15000, // real task completion round-trips async via server-side triggers, so poll to reflect it
  });

  const qc = useQueryClient();
  const joinMutation = useMutation({
    mutationFn: () => challengeProgramApi.join(programId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenge-enrollment", user?.id, programId] });
      toast.success("You're in! Let's start Day 1.");
    },
    onError: () => toast.error("Could not join this challenge"),
  });

  if (!enrollment && !isLoading) {
    return (
      <div className="w-full space-y-6 animate-fade-in">
        <BackButton label="Back" />
        <div className="card text-center py-12 space-y-4">
          <Flag className="w-10 h-10 text-primary-500 mx-auto" />
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white text-lg">{program?.title ?? "Challenge"}</h2>
            {program?.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">{program.description}</p>}
          </div>
          <button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending} className="btn-primary mx-auto">
            Join Challenge
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <BackButton label="Back" to="/challenges" />

      <div className="rounded-3xl bg-primary-600 p-6 text-white relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Flag className="w-6 h-6" />
            <span className="font-bold text-lg">{enrollment?.program_title ?? program?.title}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-white/80">
            <span className="flex items-center gap-1"><Trophy className="w-4 h-4" /> +{enrollment?.completion_xp} XP</span>
            <span className="flex items-center gap-1"><Award className="w-4 h-4" /> +{enrollment?.completion_ep} EP</span>
            {enrollment?.badge_type && <span>🏅 {enrollment.badge_type}</span>}
          </div>
          {enrollment?.status === "completed" && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1 text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Challenge Completed!
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-100 dark:bg-gray-800" />)
        ) : (
          enrollment?.days
            .slice()
            .sort((a, b) => a.day_number - b.day_number)
            .map((day, i) => {
              const isLast = i === (enrollment.days.length - 1);
              const locked = day.day_number > enrollment.current_day;
              const dayComplete = day.tasks.filter((t) => t.is_required).every((t) => t.is_completed);
              return (
                <div key={day.id} className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                      dayComplete ? "bg-success-500 text-white"
                      : locked ? "bg-gray-100 dark:bg-gray-800 text-gray-400"
                      : "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                    }`}>
                      {dayComplete ? <CheckCircle2 className="w-4.5 h-4.5" /> : locked ? <Lock className="w-4 h-4" /> : day.day_number}
                    </div>
                    {!isLast && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1 min-h-[2rem]" />}
                  </div>
                  <div className={`card flex-1 mb-1 ${locked ? "opacity-50" : ""}`}>
                    <p className="font-semibold text-gray-900 dark:text-white mb-2">
                      Day {day.day_number}{day.title ? ` — ${day.title}` : ""}
                    </p>
                    <div className="space-y-2">
                      {day.tasks.slice().sort((a, b) => a.title.localeCompare(b.title)).map((task) => {
                        const Icon = TASK_TYPE_ICON[task.task_type];
                        const content = (
                          <div className={`flex items-center gap-2.5 p-2.5 rounded-xl ${
                            task.is_completed ? "bg-success-50 dark:bg-success-900/10"
                            : locked ? "bg-gray-50 dark:bg-gray-900/40"
                            : "bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-800"
                          }`}>
                            <Icon className={`w-4 h-4 flex-shrink-0 ${task.is_completed ? "text-success-500" : "text-primary-500"}`} />
                            <span className={`text-sm flex-1 ${task.is_completed ? "text-gray-500 line-through" : "text-gray-700 dark:text-gray-300"}`}>
                              {task.title}
                            </span>
                            {task.is_required && !task.is_completed && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300 shrink-0">required</span>
                            )}
                            {task.is_completed ? (
                              <CheckCircle2 className="w-4 h-4 text-success-500 shrink-0" />
                            ) : locked ? (
                              <Lock className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                            )}
                          </div>
                        );
                        return locked || task.is_completed ? (
                          <div key={task.id}>{content}</div>
                        ) : (
                          <Link key={task.id} to={taskLink(task)}>{content}</Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </div>

      <p className="text-center text-xs text-gray-400 pb-4">
        Task completion updates automatically once you finish the real activity — there's no manual "mark complete" button.
      </p>
    </div>
  );
}
