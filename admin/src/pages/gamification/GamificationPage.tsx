import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gamificationApi } from "@/lib/api";
import { useForm } from "react-hook-form";
import DataTable from "@/components/ui/DataTable";
import { Zap, Star, Flame, Trophy, Award, RefreshCw, Target, Plus, X } from "lucide-react";
import toast from "react-hot-toast";
import { parseApiError } from "@/lib/errors";

interface LeaderboardEntry {
  id?: string;
  rank: number;
  user_id: string;
  total_xp: number;
  level: number;
}

interface ChallengeFormData {
  title: string;
  description: string;
  challenge_type: "quiz" | "video" | "revision" | "pyq" | "battle";
  challenge_date: string;
  xp_reward: number;
  ep_reward: number;
  target_count: number;
}

// Values must match the backend XPEvent enum exactly (lowercase) —
// services/gamification_service/app/models/gamification.py. The award
// endpoint 422s on any value not in that enum.
const XP_EVENTS = [
  { event: "video_watched", xp: 10 },
  { event: "quiz_completed", xp: 20 },
  { event: "quiz_perfect", xp: 50 },
  { event: "daily_login", xp: 5 },
  { event: "chapter_complete", xp: 100 },
  { event: "referral_success", xp: 200 },
];

function formatEventLabel(event: string): string {
  return event.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

const CHALLENGE_TYPES: { value: ChallengeFormData["challenge_type"]; label: string }[] = [
  { value: "quiz",     label: "Quiz" },
  { value: "video",    label: "Video" },
  { value: "revision", label: "Revision" },
  { value: "pyq",      label: "PYQ (Practice)" },
  { value: "battle",   label: "Battle" },
];

function todayISO() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

const medalColor = ["text-warning-500", "text-gray-400 dark:text-gray-500", "text-warning-700 dark:text-warning-600"];

const MedalIcon = ({ rank }: { rank: number }) =>
  rank <= 3 ? (
    <Trophy className={`w-4 h-4 ${medalColor[rank - 1]}`} />
  ) : (
    <span className="text-gray-500 dark:text-gray-400 text-sm font-bold">#{rank}</span>
  );

export default function GamificationPage() {
  const queryClient = useQueryClient();
  const [showChallengeForm, setShowChallengeForm] = useState(false);

  const { register, handleSubmit, reset, watch } = useForm<{
    user_id: string;
    event: string;
    reference_id: string;
  }>();
  const selectedEvent = watch("event", XP_EVENTS[0].event);

  const {
    register: regChallenge,
    handleSubmit: handleChallengeSubmit,
    reset: resetChallenge,
  } = useForm<ChallengeFormData>({
    defaultValues: { xp_reward: 50, ep_reward: 10, target_count: 1, challenge_date: todayISO() },
  });

  const {
    data: leaderboard = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<LeaderboardEntry[]>({
    queryKey: ["gamification-leaderboard"],
    queryFn: () => gamificationApi.leaderboard(20).then((r) => r.data),
  });

  const { data: todayChallenge } = useQuery({
    queryKey: ["today-challenge"],
    queryFn: () => gamificationApi.todayChallenge().then((r) => r.data),
  });

  const awardXpMutation = useMutation({
    mutationFn: (data: object) => gamificationApi.awardXP(data),
    onSuccess: () => {
      toast.success("XP awarded!");
      reset();
      refetch();
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const createChallengeMutation = useMutation({
    mutationFn: (data: ChallengeFormData) => gamificationApi.createChallenge({
      ...data,
      xp_reward: Number(data.xp_reward),
      ep_reward: Number(data.ep_reward),
      target_count: Number(data.target_count),
    }),
    onSuccess: () => {
      toast.success("Daily challenge created!");
      resetChallenge({ xp_reward: 50, ep_reward: 10, target_count: 1, challenge_date: todayISO() });
      setShowChallengeForm(false);
      queryClient.invalidateQueries({ queryKey: ["today-challenge"] });
    },
    onError: () => toast.error("Failed to create challenge"),
  });

  const leaderboardCols = [
    {
      header: "Rank",
      accessor: (r: LeaderboardEntry) => <MedalIcon rank={r.rank} />,
      className: "w-16",
    },
    {
      header: "User",
      accessor: (r: LeaderboardEntry) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
          {r.user_id.slice(0, 12)}&hellip;
        </span>
      ),
    },
    {
      header: "XP",
      accessor: (r: LeaderboardEntry) => (
        <span className="flex items-center gap-1 font-bold text-primary-600 dark:text-primary-400">
          <Star className="w-3.5 h-3.5" />
          {r.total_xp.toLocaleString()}
        </span>
      ),
      className: "w-28",
    },
    {
      header: "Level",
      accessor: (r: LeaderboardEntry) => (
        <span className="badge-info">Lv. {r.level}</span>
      ),
      className: "w-24",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Gamification</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">XP rewards, leaderboard, streaks, and badges</p>
        </div>
        <button onClick={() => refetch()} className="btn btn-sm btn-secondary">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* XP Reward Table */}
        <div className="card overflow-x-auto">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2 whitespace-nowrap">
            <Zap className="w-4 h-4 text-warning-500 flex-shrink-0" /> XP Reward Table
          </h3>
          <div className="space-y-2 min-w-[200px]">
            {XP_EVENTS.map(({ event, xp }) => (
              <div
                key={event}
                className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-gray-800 text-sm"
              >
                <span className="text-gray-600 dark:text-gray-400 font-medium">{formatEventLabel(event)}</span>
                <span className="font-bold text-primary-600 dark:text-primary-400">+{xp} XP</span>
              </div>
            ))}
          </div>
        </div>

        {/* Award XP Form */}
        <div className="card lg:col-span-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Award className="w-4 h-4 text-primary-500" /> Award Manual XP
          </h3>
          <form
            onSubmit={handleSubmit((d) =>
              awardXpMutation.mutate({
                user_id: d.user_id,
                event: d.event,
                // Every event except daily_login needs a reference tying the
                // award to a real occurrence, or the endpoint returns 422.
                reference_id: d.event === "daily_login" ? undefined : (d.reference_id || undefined),
              })
            )}
            className="space-y-4"
          >
            <div>
              <label className="label">User ID</label>
              <input
                className="input w-full"
                {...register("user_id", { required: true })}
                placeholder="User UUID"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">XP Event</label>
                <select className="input w-full" {...register("event", { required: true })}>
                  {XP_EVENTS.map(({ event }) => (
                    <option key={event} value={event}>
                      {formatEventLabel(event)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">
                  Reference ID {selectedEvent !== "daily_login" && <span className="text-danger-500">*</span>}
                </label>
                <input
                  className="input w-full"
                  {...register("reference_id", {
                    required: selectedEvent !== "daily_login",
                  })}
                  disabled={selectedEvent === "daily_login"}
                  placeholder={selectedEvent === "daily_login" ? "Not needed for daily login" : "e.g. the quiz/chapter/referral ID"}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Ties the award to a real event; repeats with the same ID are ignored.
                </p>
              </div>
            </div>
            <button
              type="submit"
              className="btn btn-primary w-full sm:w-auto"
              disabled={awardXpMutation.isPending}
            >
              <Zap className="w-4 h-4" />
              {awardXpMutation.isPending ? "Awarding…" : "Award XP"}
            </button>
          </form>
        </div>
      </div>

      {/* Daily Challenge */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Target className="w-4 h-4 text-success-500" /> Daily Challenge
          </h3>
          {!showChallengeForm && (
            <button
              type="button"
              onClick={() => setShowChallengeForm(true)}
              className="btn btn-sm btn-secondary flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Create Challenge
            </button>
          )}
        </div>

        {todayChallenge ? (
          <div className="alert-success mb-4">
            <Flame className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{todayChallenge.title}</p>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 capitalize">
                {todayChallenge.type ?? todayChallenge.challenge_type}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 font-bold text-success-700 dark:text-success-300 text-sm whitespace-nowrap">
              <Star className="w-3.5 h-3.5" />
              {todayChallenge.xp_reward} XP
            </span>
          </div>
        ) : (
          <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">No challenge today.</p>
        )}

        {showChallengeForm && (
          <form
            onSubmit={handleChallengeSubmit((d) => createChallengeMutation.mutate(d))}
            className="border border-gray-100 dark:border-gray-700 rounded-lg p-4 space-y-4 bg-gray-50 dark:bg-gray-900/40 relative"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">New Daily Challenge</h4>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full p-1 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                onClick={() => { resetChallenge({ xp_reward: 50, ep_reward: 10, target_count: 1, challenge_date: todayISO() }); setShowChallengeForm(false); }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Title</label>
                <input
                  className="input w-full"
                  {...regChallenge("title", { required: true })}
                  placeholder="Challenge title"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="label">Description</label>
                <textarea
                  className="input w-full min-h-[80px] resize-y"
                  {...regChallenge("description")}
                  placeholder="Describe the challenge…"
                />
              </div>

              <div>
                <label className="label">Challenge Type</label>
                <select className="input w-full" {...regChallenge("challenge_type", { required: true })}>
                  {CHALLENGE_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Challenge Date</label>
                <input
                  type="date"
                  className="input w-full"
                  {...regChallenge("challenge_date", { required: true })}
                />
              </div>

              <div>
                <label className="label">XP Reward</label>
                <input
                  type="number"
                  min="1"
                  className="input w-full"
                  {...regChallenge("xp_reward", { required: true, min: 1, valueAsNumber: true })}
                />
              </div>

              <div>
                <label className="label">EduPoints Reward</label>
                <input
                  type="number"
                  min="0"
                  className="input w-full"
                  {...regChallenge("ep_reward", { min: 0, valueAsNumber: true })}
                />
              </div>

              <div>
                <label className="label">Target Count</label>
                <input
                  type="number"
                  min="1"
                  className="input w-full"
                  {...regChallenge("target_count", { required: true, min: 1, valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={createChallengeMutation.isPending}
              >
                <Flame className="w-4 h-4" />
                {createChallengeMutation.isPending ? "Creating…" : "Create Challenge"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { resetChallenge({ xp_reward: 50, ep_reward: 10, target_count: 1, challenge_date: todayISO() }); setShowChallengeForm(false); }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Leaderboard */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 flex-wrap">
          <Trophy className="w-4 h-4 text-warning-500 flex-shrink-0" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Top Leaderboard</h3>
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{leaderboard.length} entries</span>
        </div>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading leaderboard…</div>
          ) : isError ? (
            <div className="p-8 text-center text-danger-600 dark:text-danger-400">
              Failed to load leaderboard.{" "}
              <button onClick={() => refetch()} className="underline">Retry</button>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500">
              No XP data yet. Seed the database or award XP to users.
            </div>
          ) : (
            <DataTable<LeaderboardEntry>
              columns={leaderboardCols}
              data={leaderboard}
            />
          )}
        </div>
      </div>
    </div>
  );
}
