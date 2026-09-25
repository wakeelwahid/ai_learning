import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { battleApi } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAppSelector } from "@/store";
import {
  Swords, Users, Globe, Trophy, Clock, Zap,
  Star, Flame, Lock, Eye,
  Share2, Copy, MessageCircle,
  Search, RefreshCcw, Radio,
} from "lucide-react";
import toast from "react-hot-toast";
import { EmptyState, Button } from "@/components/ui";
import UserAvatar from "@/components/UserAvatar";
import SoloBattleFlow from "./SoloBattleFlow";
import GroupBattleFlow from "./GroupBattleFlow";
import StudyPartyPage from "./StudyPartyPage";
import BattleHistory from "./BattleHistory";
import type { CreateBattleParams, BattleType } from "@/lib/api";

type View = "hub" | "create" | "live" | "history";

const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "History", "Geography", "English", "Computer Science"];
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

// Mode tiles are solid indigo (no per-tile decorative gradient rainbow) —
// the emoji + label differentiate modes, "badge" carries genuine semantic
// meaning (Hot/Live/New) rendered as a small pill.
const BATTLE_MODES = [
  { type: "solo",         label: "Solo vs AI",     sub: "Beat the AI",        badge: null,   emoji: "🤖" },
  { type: "1v1",          label: "1v1 Battle",     sub: "Challenge a friend", badge: "Hot",  emoji: "⚔️" },
  { type: "public",       label: "Public",         sub: "Open to anyone",     badge: "Live", emoji: "🌐" },
  { type: "team",         label: "Team Battle",    sub: "Team A vs B",        badge: "New",  emoji: "🏆" },
  { type: "group",        label: "Group",          sub: "Up to 20 players",   badge: null,   emoji: "👥" },
  { type: "subject",      label: "Subject",        sub: "Open subject quiz",  badge: null,   emoji: "📚" },
  { type: "chapter",      label: "Chapter",        sub: "Revision-focused",   badge: null,   emoji: "📖" },
  { type: "class_battle", label: "Class Battle",   sub: "Class vs Class",     badge: null,   emoji: "🏫" },
  { type: "study_party",  label: "Study Party",    sub: "Watch + Quiz",       badge: "New",  emoji: "🎓" },
] as const;

const TYPE_FILTERS = [
  { key: "all",          label: "All" },
  { key: "1v1",          label: "1v1" },
  { key: "group",        label: "Group" },
  { key: "public",       label: "Public" },
  { key: "team",         label: "Team" },
  { key: "class_battle", label: "Class" },
  { key: "subject",      label: "Subject" },
  { key: "chapter",      label: "Chapter" },
  { key: "study_party",  label: "Party" },
];

const STATUS_CFG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  waiting:  { label: "Waiting",  dot: "bg-warning-400 animate-pulse", text: "text-warning-700 dark:text-warning-300", bg: "bg-warning-50 dark:bg-warning-900/20 border-warning-200 dark:border-warning-800" },
  starting: { label: "Starting", dot: "bg-warning-500 animate-pulse", text: "text-warning-700 dark:text-warning-300", bg: "bg-warning-50 dark:bg-warning-900/20 border-warning-200 dark:border-warning-800" },
  active:   { label: "Live",     dot: "bg-success-500 animate-pulse", text: "text-success-700 dark:text-success-300", bg: "bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800" },
};

// Battle type is a category, not a status — one neutral left-border accent
// for every card instead of a decorative rainbow per type.
const TYPE_BORDER = "border-l-primary-400 dark:border-l-primary-600";

const DIFF_COLOR: Record<string, string> = {
  easy: "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300",
  medium: "bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300",
  hard: "bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-300",
};

function LiveArenaPanel({ openBattles, filteredBattles, liveCount, searchQuery, setSearchQuery, typeFilter, setTypeFilter, isRefreshing, refetchOpen, spectateMutation, joinByIdMutation }: {
  openBattles: any[]; filteredBattles: any[]; liveCount: number;
  searchQuery: string; setSearchQuery: (v: string) => void;
  typeFilter: string; setTypeFilter: (v: string) => void;
  isRefreshing: boolean; refetchOpen: () => void;
  spectateMutation: any; joinByIdMutation: any;
}) {
  const PER_PAGE = 5;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [typeFilter, searchQuery]);
  const totalPages = Math.max(1, Math.ceil(filteredBattles.length / PER_PAGE));
  const paged = filteredBattles.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Radio className="w-4 h-4 text-success-500 animate-pulse" />
          <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">Live Arena</h3>
          {openBattles.length > 0 && (
            <span className="bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-bold px-2.5 py-0.5 rounded-full">{openBattles.length} open</span>
          )}
          {liveCount > 0 && (
            <span className="bg-success-100 dark:bg-success-900/40 text-success-700 dark:text-success-300 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse inline-block" />{liveCount} live
            </span>
          )}
        </div>
        <button onClick={() => refetchOpen()} disabled={isRefreshing}
          className="flex items-center gap-1.5 text-xs text-primary-500 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium disabled:opacity-40 bg-primary-50 dark:bg-primary-900/30 px-2.5 py-1.5 rounded-lg transition-colors">
          <RefreshCcw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          className="input pl-9 pr-8"
          placeholder="Search by subject or topic..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">✕</button>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
        {TYPE_FILTERS.map(({ key, label }) => (
          <button key={key} onClick={() => setTypeFilter(key)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
              typeFilter === key ? "bg-primary-600 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {filteredBattles.length === 0 ? (
        <EmptyState
          icon={Globe}
          title={openBattles.length === 0 ? "No open battles right now" : "No battles match your filter"}
          description={
            openBattles.length === 0
              ? "Create a Public, Group or 1v1 battle — it'll appear here instantly"
              : "Try a different filter or clear your search"
          }
        />
      ) : (
        <div className="space-y-2">
          {paged.map((b: any) => {
            const mode        = BATTLE_MODES.find((m) => m.type === b.battle_type);
            const stCfg       = STATUS_CFG[b.status] ?? STATUS_CFG.waiting;
            const isLive      = b.status === "active";
            const isFull      = b.current_players >= b.max_players;
            const borderColor = TYPE_BORDER;
            const spotsLeft   = Math.max(0, (b.max_players ?? 2) - (b.current_players ?? 0));

            return (
              <div key={b.id}
                className={`group bg-white dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700 border-l-4 ${borderColor} shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden`}>
                {/* Card header row */}
                <div className="flex items-center gap-3 px-3.5 pt-3.5 pb-2.5">
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-lg shadow-sm">
                      {mode?.emoji ?? "⚔️"}
                    </div>
                    {isLive && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success-500 border-2 border-white dark:border-gray-800 animate-pulse" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-gray-900 dark:text-white truncate leading-tight">
                        {b.subject || "General"}{b.topic ? ` · ${b.topic}` : ""}
                      </span>
                      <span className={`flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${stCfg.bg} ${stCfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${stCfg.dot}`} />
                        {stCfg.label}
                      </span>
                    </div>
                    {/* Meta row */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] sm:text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 px-2 py-0.5 rounded font-semibold capitalize">
                        {b.battle_type.replace(/_/g, " ")}
                      </span>
                      <span className={`text-[11px] sm:text-xs px-2 py-0.5 rounded font-semibold capitalize ${DIFF_COLOR[b.difficulty] ?? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
                        {b.difficulty}
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Users className="w-3 h-3" /> {b.current_players}/{b.max_players}
                        {isFull && !isLive && <span className="text-danger-500 font-bold ml-0.5">Full</span>}
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {b.time_limit_sec / 60}m
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{b.question_count}Q</span>
                    </div>
                  </div>
                </div>

                {/* Participants strip */}
                {b.participants?.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3.5 pb-2.5 flex-wrap">
                    {b.participants.slice(0, 5).map((p: any, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1.5 text-[11px] bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                        <UserAvatar userId={p.user_id} name={p.display_name} src={p.avatar_url} sizeClass="w-4 h-4 text-[9px]" />
                        {p.display_name}
                      </span>
                    ))}
                    {!isLive && spotsLeft > 0 && (
                      <span className="text-[11px] text-success-600 dark:text-success-400 font-semibold">{spotsLeft} spot{spotsLeft > 1 ? "s" : ""} open</span>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 px-3.5 pb-3.5">
                  <button
                    onClick={() => spectateMutation.mutate(b.id)}
                    disabled={spectateMutation.isPending}
                    className="flex items-center justify-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/30 px-3.5 py-2 rounded-lg transition-colors font-semibold">
                    <Eye className="w-3.5 h-3.5" /> Watch
                  </button>
                  {!isLive && !isFull ? (
                    <button
                      onClick={() => joinByIdMutation.mutate(b.id)}
                      disabled={joinByIdMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white font-bold px-4 py-2 rounded-lg transition-colors shadow-sm">
                      {joinByIdMutation.isPending ? "Joining..." : "Join Battle →"}
                    </button>
                  ) : isLive ? (
                    <span className="flex-1 flex items-center justify-center text-xs bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400 font-bold px-4 py-2 rounded-lg border border-success-200 dark:border-success-800">
                      In Progress
                    </span>
                  ) : (
                    <span className="flex-1 flex items-center justify-center text-xs bg-danger-50 dark:bg-danger-900/20 text-danger-500 font-bold px-4 py-2 rounded-lg border border-danger-100 dark:border-danger-800">
                      Room Full
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-1.5 flex-wrap pt-3 border-t border-gray-100 dark:border-gray-700 mt-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 sm:px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400 hover:border-primary-200 dark:hover:border-primary-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-400 dark:text-gray-500 font-medium text-center order-last xs:order-none w-full xs:w-auto">
                {page + 1} / {totalPages}
                <span className="text-[11px] ml-1.5 text-gray-300 dark:text-gray-600">({filteredBattles.length} battles)</span>
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 sm:px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400 hover:border-primary-200 dark:hover:border-primary-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BattlePage() {
  const { t } = useLanguage();
  const user = useAppSelector((s) => s.auth.user);
  const { inviteCode: urlInviteCode } = useParams<{ inviteCode?: string }>();
  const navigate = useNavigate();

  const [view, setView]               = useState<View>("hub");
  const [activeBattle, setActiveBattle] = useState<any>(null);
  const [joinCode, setJoinCode]       = useState("");
  const [shareModal, setShareModal]   = useState<{ code: string; url: string } | null>(null);
  const [typeFilter, setTypeFilter]   = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [createForm, setCreateForm]   = useState<CreateBattleParams>({
    battle_type: "solo", subject: "Mathematics", difficulty: "medium",
    question_count: 10, time_limit_sec: 300, max_players: 2,
    team_a_name: "Red Team", team_b_name: "Blue Team", class_a: "", class_b: "", topic: "",
  });

  const { data: statsData } = useQuery({
    queryKey: ["battle-stats", user?.id],
    queryFn: () => battleApi.stats(user!.id).then((r) => r.data),
    enabled: !!user?.id,
  });

  const { data: openData, refetch: refetchOpen, isFetching: isRefreshing } = useQuery({
    queryKey: ["open-battles"],
    queryFn: () => battleApi.listOpen().then((r) => r.data),
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      battleApi.create({ ...createForm }, user!.id, user!.full_name || "Student", user?.avatar_url ?? undefined).then((r) => r.data),
    onSuccess: (data) => {
      if (data.share_code || data.invite_code) {
        const code = data.invite_code || data.share_code;
        setShareModal({ code, url: `${window.location.origin}/battle/${code}` });
      }
      setActiveBattle(data);
      setView("live");
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to create battle"),
  });

  const joinMutation = useMutation({
    mutationFn: (code: string) =>
      battleApi.join(code, user!.id, user!.full_name || "Student", user?.avatar_url ?? undefined).then((r) => r.data),
    onSuccess: (data) => { setActiveBattle(data); setView("live"); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Invalid invite code"),
  });

  // Share-link deep link (/battle/<CODE>): auto-join straight into the lobby.
  // The server enforces stake eligibility — an insufficient-XP joiner gets the
  // "You need at least N XP…" error as a toast and stays on the battle hub.
  const autoJoinTried = useRef(false);
  useEffect(() => {
    if (!urlInviteCode || !user?.id || autoJoinTried.current) return;
    autoJoinTried.current = true;
    joinMutation.mutate(urlInviteCode.toUpperCase());
    navigate("/battle", { replace: true }); // clean the URL either way
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlInviteCode, user?.id]);

  const joinByIdMutation = useMutation({
    mutationFn: (battleId: string) =>
      battleApi.joinById(battleId, user!.id, user!.full_name || "Student").then((r) => r.data),
    onSuccess: (data) => { setActiveBattle(data); setView("live"); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Could not join"),
  });

  const spectateMutation = useMutation({
    mutationFn: (battleId: string) =>
      battleApi.spectate(battleId, user!.id, user!.full_name || "Spectator").then((r) => r.data),
    onSuccess: (data) => { setActiveBattle({ ...data, _spectating: true }); setView("live"); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Could not watch"),
  });

  // All useMemo hooks BEFORE any conditional returns
  const openBattles: any[] = useMemo(() => openData?.battles ?? [], [openData]);

  const filteredBattles = useMemo(() => openBattles.filter((b) => {
    if (typeFilter !== "all" && b.battle_type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!b.subject?.toLowerCase().includes(q) && !b.topic?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [openBattles, typeFilter, searchQuery]);

  const liveCount   = useMemo(() => openBattles.filter((b) => b.status === "active").length, [openBattles]);
  const stats       = statsData;
  const selectedMode = BATTLE_MODES.find((m) => m.type === createForm.battle_type);

  // Conditional renders after all hooks
  if (view === "live" && activeBattle) {
    const exitBattle = () => { setActiveBattle(null); setView("hub"); };
    if (activeBattle.battle_type === "solo")
      return <SoloBattleFlow battle={activeBattle} userId={user!.id} onExit={exitBattle} />;
    if (activeBattle.battle_type === "study_party")
      return (
        <StudyPartyPage
          battle={activeBattle} userId={user!.id} displayName={user!.full_name || "Student"}
          onExit={exitBattle}
          onStartBattle={() => setActiveBattle((prev: any) => ({ ...prev, battle_type: "group" }))}
        />
      );
    return <GroupBattleFlow battle={activeBattle} userId={user!.id} displayName={user!.full_name || "Student"} onExit={exitBattle} isSpectator={!!activeBattle._spectating} />;
  }

  if (view === "history")
    return <BattleHistory userId={user!.id} displayName={user!.full_name || "Student"} user={user} onBack={() => setView("hub")} />;

  return (
    <div className="w-full pb-10 animate-fade-in">

      {/* ── HERO — full width ─────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden bg-primary-600 p-4 sm:p-5 text-white shadow-sm mb-4">
        <div className="absolute inset-0 pointer-events-none select-none opacity-[0.07]">
          <span className="absolute top-2 right-4 text-8xl">⚔️</span>
          <span className="absolute -bottom-2 left-2 text-6xl">🏆</span>
        </div>
        <div className="relative flex flex-col xs:flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
              <Swords className="w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0" /> Battle Arena
            </h1>
            <p className="text-white/70 text-sm sm:text-base mt-1">Challenge friends · Beat AI · Climb the leaderboard</p>
          </div>
          <button onClick={() => setView("history")}
            className="flex-shrink-0 flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/20 px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <Trophy className="w-4 h-4" /> History
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 mt-3.5">
            {[
              { label: "Battles",  value: stats.battles_played,  icon: Swords },
              { label: "Wins",     value: stats.battles_won,     icon: Trophy },
              { label: "Win %",    value: `${stats.win_rate}%`,  icon: Flame },
              { label: "XP",       value: stats.total_xp_earned, icon: Star },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-white/10 rounded-xl p-2.5 sm:p-3 text-center border border-white/10 min-w-0">
                <Icon className="w-4 h-4 mx-auto mb-1.5 text-white/60" />
                <p className="text-lg sm:text-xl font-bold leading-none truncate">{value}</p>
                <p className="text-[11px] sm:text-xs text-white/60 mt-1.5 truncate">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 2-col at xl: left = modes+form, right = join+arena ─── */}
      <div className="xl:flex xl:gap-6 xl:items-start">

        {/* ── LEFT COLUMN ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* BATTLE MODES */}
          <div>
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-primary-500" /> Choose Mode
            </p>
            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-3 2xl:grid-cols-5 gap-2 sm:gap-2.5">
              {BATTLE_MODES.map(({ type, label, sub, badge, emoji }) => (
                <button
                  key={type}
                  onClick={() => {
                    setCreateForm((f) => ({
                      ...f, battle_type: type as BattleType,
                      max_players: type === "group" || type === "public" ? 20 : type === "team" ? 10 : 2,
                    }));
                    setView("create");
                  }}
                  className="relative bg-primary-600 hover:bg-primary-700 text-white rounded-2xl p-3.5 sm:p-4 text-left active:scale-[0.97] transition-all duration-150 overflow-hidden group"
                >
                  {badge && (
                    <span className="absolute top-2 right-2 text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold tracking-wide uppercase">{badge}</span>
                  )}
                  <div className="text-3xl sm:text-4xl mb-2.5">{emoji}</div>
                  <p className="font-bold text-sm sm:text-[15px] leading-snug tracking-tight">
                    {type === "solo" ? t("soloChallenge") : type === "group" ? t("groupBattle") : type === "study_party" ? t("studyParty") : label}
                  </p>
                  <p className="text-white/75 text-[11px] sm:text-xs mt-1 leading-snug hidden sm:block">{sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* CREATE FORM */}
          {view === "create" && (
            <div className="rounded-2xl border border-primary-100 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-950/30 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>{selectedMode?.emoji}</span>
                  {selectedMode?.label ?? createForm.battle_type}
                </h2>
                <button onClick={() => setView("hub")}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors">
                  ✕ Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { label: "Subject",    field: "subject",        options: SUBJECTS.map((s) => ({ value: s, label: s })) },
                  { label: "Difficulty", field: "difficulty",     options: DIFFICULTIES.map((d) => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) })) },
                  { label: "Questions",  field: "question_count", options: [5, 10, 15, 20].map((n) => ({ value: n, label: `${n} questions` })) },
                  { label: "Time",       field: "time_limit_sec", options: [120, 180, 300, 600].map((n) => ({ value: n, label: `${n / 60} min` })) },
                ].map(({ label, field, options }) => (
                  <div key={field}>
                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</label>
                    <select
                      className="input mt-1 py-2"
                      value={(createForm as any)[field]}
                      onChange={(e) => setCreateForm((f) => ({ ...f, [field]: field === "question_count" || field === "time_limit_sec" ? +e.target.value : e.target.value }))}
                    >
                      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {createForm.battle_type === "team" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[["team_a_name", "Team A", "Red Team"], ["team_b_name", "Team B", "Blue Team"]].map(([field, label, ph]) => (
                    <div key={field}>
                      <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</label>
                      <input placeholder={ph} className="input mt-1 py-2"
                        value={(createForm as any)[field]} onChange={(e) => setCreateForm((f) => ({ ...f, [field]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              )}

              {createForm.battle_type === "class_battle" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[["class_a", "Class A", "e.g. 10A"], ["class_b", "Class B", "e.g. 10B"]].map(([field, label, ph]) => (
                    <div key={field}>
                      <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</label>
                      <input placeholder={ph} className="input mt-1 py-2"
                        value={(createForm as any)[field]} onChange={(e) => setCreateForm((f) => ({ ...f, [field]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              )}

              {createForm.battle_type === "study_party" && (
                <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-3.5 text-sm text-primary-700 dark:text-primary-300 leading-relaxed">
                  Friends watch a video together, discuss, then quiz — all in one room. Share the invite code after creating.
                </div>
              )}

              <Button onClick={() => createMutation.mutate()} isLoading={createMutation.isPending} fullWidth size="lg">
                {createMutation.isPending ? "Creating..." : <><Zap className="w-4 h-4" /> Start Battle</>}
              </Button>
            </div>
          )}

          {/* SHARE MODAL */}
          {shareModal && (
            <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/40 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-base font-bold text-primary-900 dark:text-primary-200 flex items-center gap-2 min-w-0"><Share2 className="w-4 h-4 flex-shrink-0" /> <span className="truncate">Share Battle</span></h3>
                <button onClick={() => setShareModal(null)} className="flex-shrink-0 text-sm bg-white dark:bg-gray-800 border border-primary-200 dark:border-primary-700 text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 px-3 py-1.5 rounded-lg">Done</button>
              </div>
              <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-2.5 sm:px-4 py-3 border border-primary-200 dark:border-primary-700">
                <span className="font-mono text-xl sm:text-3xl font-bold tracking-wide sm:tracking-widest text-primary-700 dark:text-primary-300 flex-1 min-w-0 truncate">{shareModal.code}</span>
                <button onClick={() => { navigator.clipboard.writeText(shareModal.code); toast.success("Code copied!"); }}
                  className="flex-shrink-0 p-2 text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <a href={`https://wa.me/?text=${encodeURIComponent(`🔥 Join my Quiz Battle!\nCode: ${shareModal.code}\n${shareModal.url}`)}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-success-500 hover:bg-success-600 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
                <button onClick={() => { navigator.clipboard.writeText(shareModal.url); toast.success("Link copied!"); }}
                  className="flex-1 flex items-center justify-center gap-2 btn-secondary text-sm">
                  <Copy className="w-4 h-4" /> Copy Link
                </button>
              </div>
            </div>
          )}

          {/* JOIN BY CODE — mobile/tablet only */}
          <div className="xl:hidden card !p-3.5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-primary-400" /> Join with Invite Code
            </h3>
            <div className="flex gap-2">
              <input
                className="input flex-1 uppercase tracking-widest font-mono placeholder:normal-case placeholder:tracking-normal"
                placeholder="Enter code — e.g. PHY-7821"
                maxLength={8}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && joinCode.length >= 4 && joinMutation.mutate(joinCode)}
              />
              <button onClick={() => joinMutation.mutate(joinCode)}
                disabled={joinCode.length < 4 || joinMutation.isPending}
                className="btn-primary px-5 text-sm whitespace-nowrap">
                {joinMutation.isPending ? "..." : "Join →"}
              </button>
            </div>
          </div>

          {/* LIVE ARENA — mobile/tablet only */}
          <div className="xl:hidden">
            <LiveArenaPanel
              openBattles={openBattles} filteredBattles={filteredBattles} liveCount={liveCount}
              searchQuery={searchQuery} setSearchQuery={setSearchQuery}
              typeFilter={typeFilter} setTypeFilter={setTypeFilter}
              isRefreshing={isRefreshing} refetchOpen={refetchOpen}
              spectateMutation={spectateMutation} joinByIdMutation={joinByIdMutation}
            />
          </div>
        </div>

        {/* ── RIGHT COLUMN: sticky join + live arena (xl+) ── */}
        <aside className="hidden xl:flex flex-col w-80 2xl:w-96 flex-shrink-0 sticky top-6 self-start space-y-4">
          {/* Join by code */}
          <div className="card !p-3.5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-primary-400" /> Join with Invite Code
            </h3>
            <div className="flex gap-2">
              <input
                className="input flex-1 uppercase tracking-widest font-mono placeholder:normal-case placeholder:tracking-normal"
                placeholder="Enter code — e.g. PHY-7821"
                maxLength={8}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && joinCode.length >= 4 && joinMutation.mutate(joinCode)}
              />
              <button onClick={() => joinMutation.mutate(joinCode)}
                disabled={joinCode.length < 4 || joinMutation.isPending}
                className="btn-primary px-4 text-sm whitespace-nowrap">
                {joinMutation.isPending ? "..." : "Join →"}
              </button>
            </div>
          </div>

          {/* Live Arena */}
          <LiveArenaPanel
            openBattles={openBattles} filteredBattles={filteredBattles} liveCount={liveCount}
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            typeFilter={typeFilter} setTypeFilter={setTypeFilter}
            isRefreshing={isRefreshing} refetchOpen={refetchOpen}
            spectateMutation={spectateMutation} joinByIdMutation={joinByIdMutation}
          />
        </aside>

      </div>
    </div>
  );
}
