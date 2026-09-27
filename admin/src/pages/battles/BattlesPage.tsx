import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { battleApi } from "@/lib/api";
import DataTable from "@/components/ui/DataTable";
import StatsCard from "@/components/ui/StatsCard";
import Modal from "@/components/ui/Modal";
import { AlertTriangle, CalendarClock, Plus, Swords, Trophy, Users, X, Zap, Activity, Clock } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Battle {
  id: string;
  mode: "solo" | "1v1" | "group";
  status: "waiting" | "active" | "completed";
  players: string[] | number;
  subject?: string;
  created_at: string;
  scheduled_at?: string | null;
}

interface LeaderboardEntry {
  id?: string;
  rank: number;
  user_id: string;
  username?: string;
  wins: number;
  total_battles: number;
  win_rate?: number;
  score?: number;
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

type FilterTab = "all" | "active" | "completed" | "waiting";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "waiting", label: "Waiting" },
];

// ─── Badge helpers ────────────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: Battle["mode"] }) {
  const styles: Record<Battle["mode"], string> = {
    solo: "badge-gray",
    "1v1": "badge-info",
    group: "badge-primary",
  };
  return <span className={`badge ${styles[mode] ?? "badge-gray"}`}>{mode}</span>;
}

function StatusBadge({ status }: { status: Battle["status"] }) {
  const styles: Record<Battle["status"], string> = {
    waiting: "badge-warning",
    active: "badge-info",
    completed: "badge-success",
  };
  return <span className={`badge ${styles[status] ?? "badge-gray"}`}>{status}</span>;
}

// ─── Medal helper (leaderboard) ───────────────────────────────────────────────

const medalColor = ["text-yellow-400", "text-gray-400", "text-orange-500"];

function MedalIcon({ rank }: { rank: number }) {
  return rank <= 3 ? (
    <Trophy className={`w-4 h-4 ${medalColor[rank - 1]}`} />
  ) : (
    <span className="text-gray-500 text-sm font-bold">#{rank}</span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Schedule Battle form ─────────────────────────────────────────────────────

interface ScheduleForm {
  battle_type: string;
  subject: string;
  difficulty: "easy" | "medium" | "hard";
  question_count: number;
  time_limit_sec: number;
  max_players: number;
  scheduled_at: string; // datetime-local value
}

const EMPTY_SCHEDULE: ScheduleForm = {
  battle_type: "public",
  subject: "",
  difficulty: "medium",
  question_count: 10,
  time_limit_sec: 300,
  max_players: 10,
  scheduled_at: "",
};

const BATTLE_TYPES = [
  { value: "public", label: "Public (open to anyone)" },
  { value: "group", label: "Group (private, invite code)" },
  { value: "subject", label: "Subject-themed open" },
  { value: "class_battle", label: "Class vs Class" },
  { value: "school_battle", label: "School vs School" },
];

export default function BattlesPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const qc = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [form, setForm] = useState<ScheduleForm>(EMPTY_SCHEDULE);
  const [formError, setFormError] = useState("");
  const [createdInfo, setCreatedInfo] = useState<{ id: string; invite_code?: string } | null>(null);
  const [viewingBattle, setViewingBattle] = useState<Battle | null>(null);

  const scheduleMutation = useMutation({
    mutationFn: () =>
      battleApi.create({
        battle_type: form.battle_type,
        subject: form.subject || null,
        difficulty: form.difficulty,
        question_count: form.question_count,
        time_limit_sec: form.time_limit_sec,
        max_players: form.max_players,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["battles"] });
      setCreatedInfo({ id: r.data?.id ?? r.data?.battle_id ?? "", invite_code: r.data?.invite_code });
    },
    onError: (err: any) =>
      setFormError(err?.response?.data?.detail ?? "Failed to schedule battle."),
  });

  const openSchedule = () => {
    setForm(EMPTY_SCHEDULE);
    setFormError("");
    setCreatedInfo(null);
    setScheduleOpen(true);
  };

  // Fetch all battles (unfiltered for stats; filtered for table)
  const {
    data: allBattles = [],
    isLoading: battlesLoading,
    isError: battlesError,
  } = useQuery<Battle[]>({
    queryKey: ["battles"],
    queryFn: () => battleApi.list().then((r) => r.data?.battles ?? r.data ?? []),
  });

  const {
    data: leaderboardRaw = [],
    isLoading: leaderboardLoading,
    isError: leaderboardError,
  } = useQuery<LeaderboardEntry[]>({
    queryKey: ["battles-leaderboard"],
    queryFn: () =>
      battleApi.leaderboard().then((r) => r.data?.leaderboard ?? r.data ?? []),
  });

  // ── Derived stats ────────────────────────────────────────────────────────────
  const totalBattles = allBattles.length;
  const activeBattles = allBattles.filter((b) => b.status === "active").length;
  const completedBattles = allBattles.filter((b) => b.status === "completed").length;
  const totalPlayers = allBattles.reduce((acc, b) => {
    const count = Array.isArray(b.players) ? b.players.length : (b.players ?? 0);
    return acc + (count as number);
  }, 0);

  // ── Filtered data for table ──────────────────────────────────────────────────
  const filteredBattles =
    activeTab === "all"
      ? allBattles
      : allBattles.filter((b) => b.status === activeTab);

  // ── Top 10 from leaderboard ──────────────────────────────────────────────────
  const topLeaderboard = leaderboardRaw.slice(0, 10).map((entry, i) => ({
    ...entry,
    rank: entry.rank ?? i + 1,
  }));

  // ── Table columns ────────────────────────────────────────────────────────────
  const battleColumns = [
    {
      header: "Battle ID",
      accessor: (row: Battle) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
          {row.id ? row.id.slice(0, 8) : "—"}
        </span>
      ),
    },
    {
      header: "Mode",
      accessor: (row: Battle) =>
        row.mode ? <ModeBadge mode={row.mode} /> : <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>,
    },
    {
      header: "Status",
      accessor: (row: Battle) =>
        row.status ? (
          <StatusBadge status={row.status} />
        ) : (
          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
        ),
    },
    {
      header: "Players",
      accessor: (row: Battle) => {
        const count = Array.isArray(row.players)
          ? row.players.length
          : (row.players ?? 0);
        return (
          <span className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
            <Users className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            {count}
          </span>
        );
      },
    },
    {
      header: "Subject",
      accessor: (row: Battle) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{row.subject ?? "—"}</span>
      ),
    },
    {
      header: "Scheduled",
      accessor: (row: Battle) =>
        row.scheduled_at ? (
          <span className="flex items-center gap-1 text-xs text-primary-700 dark:text-primary-400 font-medium">
            <CalendarClock className="w-3.5 h-3.5" />
            {new Date(row.scheduled_at).toLocaleString("en-IN", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
        ),
    },
    {
      header: "Created",
      accessor: (row: Battle) =>
        row.created_at ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(row.created_at).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
        ),
    },
    {
      header: "Actions",
      accessor: (row: Battle) => (
        <button
          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 px-2 py-1 rounded hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
          onClick={() => setViewingBattle(row)}
        >
          View
        </button>
      ),
    },
  ];

  // ── Leaderboard columns ──────────────────────────────────────────────────────
  const leaderboardColumns = [
    {
      header: "Rank",
      accessor: (row: LeaderboardEntry) => <MedalIcon rank={row.rank} />,
    },
    {
      header: "Player",
      accessor: (row: LeaderboardEntry) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
          {row.username ?? row.user_id?.slice(0, 12) + "…"}
        </span>
      ),
    },
    {
      header: "Wins",
      accessor: (row: LeaderboardEntry) => (
        <span className="flex items-center gap-1 font-bold text-success-600 dark:text-success-400 text-sm">
          <Zap className="w-3.5 h-3.5" />
          {row.wins ?? 0}
        </span>
      ),
    },
    {
      header: "Battles",
      accessor: (row: LeaderboardEntry) => (
        <span className="text-sm text-gray-700 dark:text-gray-300">{row.total_battles ?? 0}</span>
      ),
    },
    {
      header: "Win Rate",
      accessor: (row: LeaderboardEntry) => {
        const rate =
          row.win_rate != null
            ? row.win_rate
            : row.total_battles
            ? Math.round(((row.wins ?? 0) / row.total_battles) * 100)
            : 0;
        return (
          <span
            className={`text-sm font-semibold ${
              rate >= 60
                ? "text-success-600 dark:text-success-400"
                : rate >= 40
                ? "text-warning-600 dark:text-warning-400"
                : "text-danger-500 dark:text-danger-400"
            }`}
          >
            {rate}%
          </span>
        );
      },
    },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Swords className="w-6 h-6 text-primary-600" />
            Battle Management
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Monitor competitive battles across the platform
          </p>
        </div>
        <button className="btn-primary self-start sm:self-auto" onClick={openSchedule}>
          <CalendarClock className="w-4 h-4" />
          Schedule Battle
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          label="Total Battles"
          value={battlesLoading ? "—" : totalBattles}
          icon={Swords}
          color="bg-primary-600"
        />
        <StatsCard
          label="Active Battles"
          value={battlesLoading ? "—" : activeBattles}
          icon={Activity}
          color="bg-info-500"
        />
        <StatsCard
          label="Completed Battles"
          value={battlesLoading ? "—" : completedBattles}
          icon={Trophy}
          color="bg-success-500"
        />
        <StatsCard
          label="Total Players"
          value={battlesLoading ? "—" : totalPlayers}
          icon={Users}
          color="bg-gray-500"
        />
      </div>

      {/* Battle Table Section */}
      <div className="card overflow-hidden">
        {/* Card header + filter tabs */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-primary-600" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Battles</h3>
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
              {filteredBattles.length} records
            </span>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 sm:ml-auto bg-gray-100 dark:bg-gray-900/60 rounded-lg p-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error state */}
        {battlesError && (
          <div className="p-8 text-center">
            <Swords className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">Failed to load battles</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
              Check your connection or API configuration.
            </p>
          </div>
        )}

        {/* Table with horizontal scroll on mobile */}
        {!battlesError && (
          <div className="overflow-x-auto">
            {battlesLoading ? (
              <DataTable
                columns={battleColumns}
                data={[]}
                loading={true}
                pageSize={10}
              />
            ) : filteredBattles.length === 0 ? (
              <div className="p-10 text-center">
                <Clock className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">No battles found</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                  {activeTab === "all"
                    ? "No battles have been created yet."
                    : `No ${activeTab} battles at the moment.`}
                </p>
              </div>
            ) : (
              <DataTable
                columns={battleColumns}
                data={filteredBattles}
                loading={false}
                pageSize={10}
              />
            )}
          </div>
        )}
      </div>

      {/* Battle Leaderboard Section */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-warning-500" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Battle Leaderboard</h3>
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">Top 10 players</span>
        </div>

        {leaderboardError && (
          <div className="p-8 text-center">
            <Trophy className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">Failed to load leaderboard</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
              Leaderboard data is unavailable right now.
            </p>
          </div>
        )}

        {!leaderboardError && (
          <>
            {leaderboardLoading ? (
              <DataTable
                columns={leaderboardColumns}
                data={[]}
                loading={true}
                pageSize={10}
              />
            ) : topLeaderboard.length === 0 ? (
              <div className="p-8 text-center">
                <Trophy className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">No leaderboard data yet</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                  Players will appear here once battles are completed.
                </p>
              </div>
            ) : (
              <DataTable
                columns={leaderboardColumns}
                data={topLeaderboard}
                loading={false}
                pageSize={10}
              />
            )}
          </>
        )}
      </div>

      {/* Schedule Battle modal */}
      {scheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-primary-600" />
                Schedule a Battle
              </h3>
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" onClick={() => setScheduleOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdInfo ? (
              <div className="p-6 text-center space-y-3">
                <Trophy className="w-10 h-10 text-success-500 mx-auto" />
                <p className="font-semibold text-gray-900 dark:text-gray-100">Battle scheduled!</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Joined participants will get a push reminder ~10 minutes before start.
                </p>
                {createdInfo.invite_code && (
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Invite code:{" "}
                    <span className="font-mono font-bold text-primary-700 dark:text-primary-400">{createdInfo.invite_code}</span>
                  </p>
                )}
                <button className="btn-primary mt-2" onClick={() => setScheduleOpen(false)}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="p-5 space-y-4">
                  {formError && (
                    <div className="alert-danger">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {formError}
                    </div>
                  )}

                  <div>
                    <label className="label">Battle Type</label>
                    <select
                      className="input"
                      value={form.battle_type}
                      onChange={(e) => setForm({ ...form, battle_type: e.target.value })}
                    >
                      {BATTLE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Subject</label>
                      <input
                        className="input"
                        placeholder="e.g. Physics"
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label">Difficulty</label>
                      <select
                        className="input"
                        value={form.difficulty}
                        onChange={(e) => setForm({ ...form, difficulty: e.target.value as ScheduleForm["difficulty"] })}
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="label">Questions</label>
                      <input
                        type="number" min={5} max={30} className="input"
                        value={form.question_count}
                        onChange={(e) => setForm({ ...form, question_count: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="label">Time Limit (s)</label>
                      <input
                        type="number" min={60} max={900} step={30} className="input"
                        value={form.time_limit_sec}
                        onChange={(e) => setForm({ ...form, time_limit_sec: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="label">Max Players</label>
                      <input
                        type="number" min={2} max={100} className="input"
                        value={form.max_players}
                        onChange={(e) => setForm({ ...form, max_players: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Start Time (optional)</label>
                    <input
                      type="datetime-local"
                      className="input"
                      value={form.scheduled_at}
                      onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                    />
                    <p className="helper-text">
                      When set, joined participants are reminded via push ~10 minutes before this
                      time. Leave blank for an unscheduled open room.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
                  <button className="btn-secondary" onClick={() => setScheduleOpen(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    disabled={scheduleMutation.isPending}
                    onClick={() => scheduleMutation.mutate()}
                  >
                    <Plus className="w-4 h-4" />
                    {scheduleMutation.isPending ? "Scheduling…" : "Create Battle"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Battle detail modal */}
      {viewingBattle && (
        <Modal title="Battle Details" onClose={() => setViewingBattle(null)} size="sm">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Battle ID</span>
              <span className="font-mono text-gray-900 dark:text-gray-100">{viewingBattle.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Mode</span>
              <span className="text-gray-900 dark:text-gray-100 capitalize">{viewingBattle.mode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Status</span>
              <span className="text-gray-900 dark:text-gray-100 capitalize">{viewingBattle.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Players</span>
              <span className="text-gray-900 dark:text-gray-100">
                {Array.isArray(viewingBattle.players) ? viewingBattle.players.length : viewingBattle.players}
              </span>
            </div>
            {viewingBattle.subject && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Subject</span>
                <span className="text-gray-900 dark:text-gray-100">{viewingBattle.subject}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Created</span>
              <span className="text-gray-900 dark:text-gray-100">{new Date(viewingBattle.created_at).toLocaleString("en-IN")}</span>
            </div>
            {viewingBattle.scheduled_at && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Scheduled</span>
                <span className="text-gray-900 dark:text-gray-100">{new Date(viewingBattle.scheduled_at).toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
