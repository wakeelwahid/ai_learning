import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "@/store";
import { challengeProgramApi } from "@/lib/api";
import { Flag, Users, Trophy, Award, ChevronRight, CalendarDays } from "lucide-react";
import BackButton from "@/components/ui/BackButton";
import toast from "react-hot-toast";

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

export default function ChallengesListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAppSelector((s) => s.auth.user);

  const { data: programs = [], isLoading } = useQuery<ChallengeProgram[]>({
    queryKey: ["challenge-programs-published"],
    queryFn: () => challengeProgramApi.listPublished().then((r) => r.data),
  });

  const { data: enrollments = [] } = useQuery<Enrollment[]>({
    queryKey: ["challenge-enrollments", user?.id],
    queryFn: () => challengeProgramApi.getMyEnrollments(user!.id).then((r) => r.data),
    enabled: !!user?.id,
  });
  const enrollmentByProgram = new Map(enrollments.map((e) => [e.program_id, e]));

  const joinMutation = useMutation({
    mutationFn: (programId: string) => challengeProgramApi.join(programId),
    onSuccess: (_res, programId) => {
      qc.invalidateQueries({ queryKey: ["challenge-enrollments", user?.id] });
      toast.success("You're in! Let's start Day 1.");
      navigate(`/challenges/${programId}`);
    },
    onError: () => toast.error("Could not join this challenge"),
  });

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <BackButton label="Back" />

      <div className="rounded-3xl bg-primary-600 p-6 text-white relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -bottom-12 -left-6 w-32 h-32 bg-white/5 rounded-full" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Flag className="w-6 h-6" />
            <span className="font-bold text-lg">Challenges</span>
          </div>
          <p className="text-white/80 text-sm max-w-md">
            Join a multi-day learning challenge — complete daily tasks, earn XP, EduPoints and badges.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-44 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">No challenges are live right now — check back soon!</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {programs.map((p) => {
            const enrollment = enrollmentByProgram.get(p.id);
            return (
              <div key={p.id} className="card flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center flex-shrink-0">
                    <CalendarDays className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-xs font-semibold text-gray-400">{p.duration_days} days</span>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{p.title}</h3>
                {p.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2 flex-1">{p.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                  <span className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5" /> +{p.completion_xp} XP</span>
                  <span className="flex items-center gap-1"><Award className="w-3.5 h-3.5" /> +{p.completion_ep} EP</span>
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {p.participant_count}</span>
                </div>
                {enrollment ? (
                  <button
                    onClick={() => navigate(`/challenges/${p.id}`)}
                    className="btn-secondary w-full justify-center"
                  >
                    {enrollment.status === "completed" ? "View Completed" : "Continue"}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => joinMutation.mutate(p.id)}
                    disabled={joinMutation.isPending}
                    className="btn-primary w-full justify-center"
                  >
                    Join Challenge
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
