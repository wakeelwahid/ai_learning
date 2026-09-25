import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Star, Crown, TrendingUp, Zap, Gift, Unlock, Users, Swords, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import BackButton from "@/components/ui/BackButton";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import UserAvatar from "@/components/UserAvatar";
import ChallengeFriendModal from "@/components/growth/ChallengeFriendModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { gamificationApi, quizApi, contentApi, api } from "@/lib/api";
import { useAppSelector } from "@/store";

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

const LEVEL_NAMES = [
  "Novice", "Explorer", "Scholar", "Achiever", "Expert",
  "Champion", "Master", "Legend", "Elite", "Grand Master",
];

function levelName(level: number) {
  return LEVEL_NAMES[Math.min(level - 1, 9)];
}

function shortId(uid: string) {
  return uid.slice(0, 6).toUpperCase();
}

interface RankRewardTier {
  rank_from: number;
  rank_to: number;
  premium_months: number;
  label: string;
  icon: string;
}

// Perks are presentation-only text, not backend data — the actual tier
// boundaries and reward months come from /leaderboard/rank-rewards (see
// makeUnlockTierLookup below), so admin changes to those numbers never
// drift out of sync with what's shown here.
const TIER_PERKS: Record<string, string[]> = {
  "Top 10": ["All premium content", "AI tutor unlimited", "Career explorer", "Priority support"],
  "Top 20": ["Premium content", "AI tutor 100 chats/mo", "Career explorer", "Battle arena VIP"],
  "Top 30": ["Premium content", "AI tutor 50 chats/mo", "Flashcards unlimited", "Battle arena"],
};

function makeUnlockTierLookup(tiers: RankRewardTier[]) {
  return (rank: number) => {
    const tier = tiers.find((t) => rank >= t.rank_from && rank <= t.rank_to);
    if (!tier) return null;
    return { months: tier.premium_months, label: `${tier.premium_months} month${tier.premium_months === 1 ? "" : "s"} FREE Premium`, icon: tier.icon };
  };
}

const PODIUM_CFG = [
  { ring: "ring-warning-300", height: "h-24", label: "#1" },
  { ring: "ring-gray-200",    height: "h-16", label: "#2" },
  { ring: "ring-warning-200", height: "h-12", label: "#3" },
];

export default function LeaderboardPage() {
  const { t } = useLanguage();
  const userId = useAppSelector((s) => s.auth.user?.id ?? "");
  const [scope, setScope]      = useState<"global" | "subject" | "friends">("global");
  const [selSubjectId, setSelSubjectId] = useState<string | null>(null);
  const [showUnlocks, setShowUnlocks] = useState(false);
  const [challenging, setChallenging] = useState<{ id: string; name: string; avatarUrl?: string | null } | null>(null);

  const { data: leaders = [], isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => gamificationApi.leaderboard(50).then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: myRankData } = useQuery({
    queryKey: ["rank-unlock", userId],
    queryFn: () => gamificationApi.rankUnlock(userId).then((r) => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const { data: rankRewardsData } = useQuery({
    queryKey: ["rank-rewards"],
    queryFn: () => gamificationApi.rankRewards().then((r) => r.data),
    staleTime: 300_000,
  });
  const rankTiers: RankRewardTier[] = rankRewardsData?.tiers ?? [];
  const getUnlockTier = makeUnlockTierLookup(rankTiers);

  const { data: friendsLb, isLoading: friendsLoading } = useQuery({
    queryKey: ["friends-leaderboard", userId],
    queryFn: () => gamificationApi.friendsLeaderboard(userId).then((r) => r.data),
    enabled: !!userId && scope === "friends",
    staleTime: 45_000, // matches the server-side Redis TTL
  });

  // Real board/class from the student's own profile — never guessed or
  // client-overridable, so the subject leaderboard always scopes to the
  // caller's actual curriculum.
  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => api.get(`/v1/users/profile/${userId}`).then((r) => r.data),
    enabled: !!userId && scope === "subject",
  });
  const board = profile?.board as string | undefined;
  const classNum = Number(profile?.class_number) || undefined;

  const { data: catalog } = useQuery({
    queryKey: ["my-catalog-for-leaderboard", userId],
    queryFn: () => contentApi.myCatalog().then((r) => r.data),
    enabled: !!userId && scope === "subject",
  });
  const subjects: { id: string; name: string }[] = catalog?.subjects ?? [];

  useEffect(() => {
    if (!selSubjectId && subjects.length > 0) setSelSubjectId(subjects[0].id);
  }, [subjects, selSubjectId]);

  const { data: subjectLb, isLoading: subjectLbLoading } = useQuery({
    queryKey: ["subject-leaderboard", board, classNum, selSubjectId],
    queryFn: () => quizApi.subjectLeaderboard(board!, classNum!, selSubjectId!).then((r) => r.data),
    enabled: !!board && !!classNum && !!selSubjectId,
    staleTime: 60_000,
  });

  const myRank: number | null = myRankData?.rank ?? null;
  // Only present in `leaders` if ranked in the fetched top 50 — otherwise
  // fall back to rank-unlock's own total_xp/level so the Unlock Progress /
  // CTA math always has real numbers instead of rendering "+undefined XP".
  const myEntry = leaders.find((l: any) => l.user_id === userId)
    ?? (myRankData?.total_xp != null ? { user_id: userId, total_xp: myRankData.total_xp, level: myRankData.level } : undefined);

  const top3  = leaders.slice(0, 3);
  const rest  = leaders.slice(3);
  const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;

  const xpToTop = (threshold: number) => {
    const threshEntry = leaders[threshold - 1];
    if (!threshEntry || !myEntry) return null;
    return Math.max(0, threshEntry.total_xp - myEntry.total_xp);
  };

  return (
    <div className="w-full space-y-5 pb-8 animate-fade-in">
      <BackButton label="Back" />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-warning-50 dark:bg-warning-900/20 flex-shrink-0">
              <Trophy className="w-4 h-4 text-warning-500" />
            </span>
            {t("leaderboard")}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{t("topStudents")}</p>
        </div>
        <button
          onClick={() => setShowUnlocks(!showUnlocks)}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
        >
          <Gift className="w-3.5 h-3.5" /> XP Rewards
        </button>
      </div>

      {/* XP Unlock Rewards Banner — full width */}
      {showUnlocks && (
        <Card noPadding className="overflow-hidden border-warning-200 dark:border-warning-900/40">
          <div className="bg-warning-500 px-4 py-2.5">
            <h2 className="text-white font-bold text-sm flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> Top Rankers Unlock FREE Premium</h2>
            <p className="text-white/80 text-[11px] mt-0.5">Earn XP to climb ranks and unlock paid features for FREE every month</p>
          </div>
          <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {rankTiers.map((tier) => {
              const perks = TIER_PERKS[tier.label] ?? [];
              return (
                <div key={tier.label} className="rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                  <div className="bg-primary-600 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-white font-bold text-xs flex items-center gap-1.5 min-w-0 truncate">
                      <span className="flex-shrink-0">{tier.icon}</span> {tier.label} students
                    </span>
                    <span className="bg-white/25 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">{tier.premium_months}mo FREE</span>
                  </div>
                  <div className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {perks.map((p) => (
                        <span key={p} className="flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 px-1.5 py-0.5 rounded-full">
                          <Unlock className="w-2.5 h-2.5 text-success-500" /> {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 text-center pb-2.5">Rankings reset monthly. Rewards applied automatically on the 1st of the next month.</p>
        </Card>
      )}

      {/* 2-col at xl */}
      <div className="xl:flex xl:gap-8 xl:items-start">

        {/* ── LEFT: Podium + Ranks list ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Scope filter — mobile/tablet */}
          <div className="flex items-center gap-3 flex-wrap xl:hidden">
            <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-semibold">
              {(["global", "subject", "friends"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)}
                  className={`px-3 py-1.5 transition-colors ${scope === s ? "bg-primary-600 text-white" : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                  {s === "global" ? t("global") : s === "subject" ? "Subject" : "Friends"}
                </button>
              ))}
            </div>
          </div>

          {scope === "subject" && (
            <>
              {subjects.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {subjects.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelSubjectId(s.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        selSubjectId === s.id
                          ? "bg-primary-600 text-white"
                          : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}

              {subjectLbLoading ? (
                <div className="flex justify-center py-16">
                  <div className="w-10 h-10 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
                </div>
              ) : !subjectLb || subjectLb.entries.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={Trophy}
                    title={subjects.length === 0 ? "Complete your profile to see subject rankings." : "No quiz attempts yet for this subject — be the first!"}
                  />
                </Card>
              ) : (
                <Card noPadding className="divide-y divide-gray-50 dark:divide-gray-800 overflow-hidden">
                  {subjectLb.entries.map((e: any) => {
                    const isMe = e.student_id === userId;
                    const label = isMe ? "You" : shortId(e.student_id);
                    return (
                      <div key={e.student_id} className={`flex items-center gap-2.5 px-3 sm:px-4 py-2.5 transition-colors ${isMe ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"}`}>
                        <div className="w-6 flex justify-center flex-shrink-0">
                          {MEDALS[e.rank] ? <span className="text-sm">{MEDALS[e.rank]}</span> : <span className="text-xs font-bold text-gray-400">#{e.rank}</span>}
                        </div>
                        <div className="w-8 h-8 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {label.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${isMe ? "text-primary-700 dark:text-primary-400" : "text-gray-800 dark:text-gray-200"}`}>{label}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-success-600 dark:text-success-400 tabular-nums">{e.score.toFixed(1)}%</p>
                          <p className="text-[10px] text-gray-400">avg score</p>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}
            </>
          )}

          {scope === "friends" && (
            <>
              {friendsLoading ? (
                <div className="flex justify-center py-16">
                  <div className="w-10 h-10 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
                </div>
              ) : !friendsLb || friendsLb.friend_count === 0 ? (
                <Card className="flex flex-col items-center">
                  <EmptyState icon={Users} title="Add friends to compete!" />
                  <Link to="/messages" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-bold hover:bg-primary-700 transition-colors -mt-2">
                    <UserPlus className="w-3.5 h-3.5" /> Find Friends
                  </Link>
                </Card>
              ) : (
                <Card noPadding className="divide-y divide-gray-50 dark:divide-gray-800 overflow-hidden">
                  {friendsLb.entries.map((e: any) => {
                    const label = e.is_me ? "You" : e.full_name || "Student";
                    return (
                      <div key={e.user_id} className={`flex flex-wrap sm:flex-nowrap items-center gap-x-2.5 gap-y-1.5 px-3 sm:px-4 py-2.5 transition-colors ${e.is_me ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"}`}>
                        <div className="w-6 flex justify-center flex-shrink-0">
                          {MEDALS[e.rank] ? <span className="text-sm">{MEDALS[e.rank]}</span> : <span className="text-xs font-bold text-gray-400">#{e.rank}</span>}
                        </div>
                        {e.avatar_url ? (
                          <img src={e.avatar_url} alt={label} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {label.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${e.is_me ? "text-primary-700 dark:text-primary-400" : "text-gray-800 dark:text-gray-200"}`}>{label}</p>
                          <p className="text-[11px] text-gray-400">Lv {e.level}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-primary-600 dark:text-primary-400 tabular-nums">{(e.total_xp ?? 0).toLocaleString()}</p>
                          <p className="text-[10px] text-gray-400">XP</p>
                        </div>
                        {!e.is_me && (
                          <button
                            onClick={() => setChallenging({ id: e.user_id, name: label, avatarUrl: e.avatar_url })}
                            className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-[11px] font-bold hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors ml-auto sm:ml-0 basis-full sm:basis-auto justify-center sm:justify-start"
                            title={`Challenge ${label}`}
                          >
                            <Swords className="w-3 h-3" /> Challenge
                          </button>
                        )}
                      </div>
                    );
                  })}
                </Card>
              )}
            </>
          )}

          {scope === "global" && (
            <>
              {isLoading ? (
                <div className="flex justify-center py-16">
                  <div className="w-10 h-10 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
                </div>
              ) : leaders.length === 0 ? (
                <Card><EmptyState icon={Trophy} title="No data yet — be the first!" /></Card>
              ) : (
                <>
                  {/* Podium */}
                  {top3.length >= 3 && (
                    <Card className="py-6 px-2 sm:px-5 bg-primary-50/50 dark:bg-primary-900/10 relative overflow-hidden">
                      <div className="flex items-end justify-center gap-2 sm:gap-3 relative z-10">
                        {podiumOrder.map((entry: any) => {
                          const r = entry.rank as number;
                          const cfg = PODIUM_CFG[r - 1];
                          const tier = getUnlockTier(r);
                          return (
                            <div key={entry.user_id} className="flex flex-col items-center gap-1 flex-1 min-w-0 max-w-[76px] sm:max-w-[96px]">
                              {tier && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400 whitespace-nowrap">
                                  {tier.months}mo FREE
                                </span>
                              )}
                              <div className={`relative rounded-full ring-2 ${cfg.ring}`}>
                                <UserAvatar userId={entry.user_id} name={entry.display_name ?? shortId(entry.user_id)} sizeClass="w-9 h-9 sm:w-11 sm:h-11 text-xs sm:text-sm" />
                                {r === 1 && (
                                  <Crown className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 text-warning-500 drop-shadow" fill="currentColor" />
                                )}
                              </div>
                              <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 text-center leading-tight truncate w-full">Lv {entry.level}</p>
                              <div className="flex items-center gap-0.5 text-[11px] text-primary-600 dark:text-primary-400 font-bold truncate w-full justify-center">
                                <Star className="w-2.5 h-2.5 shrink-0" fill="currentColor" /> {entry.total_xp.toLocaleString()}
                              </div>
                              <div className={`w-full ${cfg.height} bg-primary-600 rounded-t-lg flex items-center justify-center`}>
                                <span className="text-white font-bold text-xs sm:text-sm">{cfg.label}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}

                  {/* Tier strip */}
                  <div className="grid grid-cols-3 gap-2">
                    {rankTiers.map((tier) => (
                      <div key={tier.label} className="bg-primary-600 rounded-xl px-2 py-2.5 text-center text-white">
                        <span className="block text-base mb-1">{tier.icon}</span>
                        <p className="text-xs font-bold leading-tight">{tier.label}</p>
                        <p className="text-[10px] text-white/75 leading-tight mt-0.5">{tier.premium_months}mo FREE</p>
                      </div>
                    ))}
                  </div>

                  {/* Ranks 4–N */}
                  <Card noPadding className="divide-y divide-gray-50 dark:divide-gray-800 overflow-hidden">
                    {rest.map((entry: any) => {
                      const tier = getUnlockTier(entry.rank);
                      const isMe = entry.user_id === userId;
                      return (
                        <div key={entry.user_id} className={`flex items-center gap-2.5 px-3 sm:px-4 py-2.5 transition-colors ${isMe ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"} ${tier ? "bg-warning-50/50 dark:bg-warning-900/10" : ""}`}>
                          <div className="w-6 flex justify-center flex-shrink-0">
                            {tier
                              ? <span className="text-sm">{tier.icon}</span>
                              : <span className="text-xs font-bold text-gray-400">#{entry.rank}</span>}
                          </div>
                          <UserAvatar userId={entry.user_id} name={entry.display_name ?? shortId(entry.user_id)} sizeClass="w-8 h-8 text-xs" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate min-w-0">
                                {isMe ? "You" : `Level ${entry.level}`}
                              </p>
                              {isMe && <Badge variant="primary">You</Badge>}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                              <p className="text-[11px] text-gray-400 truncate min-w-0">{levelName(entry.level)}</p>
                              {tier && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white bg-warning-500 flex-shrink-0 flex items-center gap-0.5">
                                  <Unlock className="w-2 h-2" /> {tier.months}mo
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-primary-600 dark:text-primary-400 tabular-nums">{entry.total_xp.toLocaleString()}</p>
                            <p className="text-[10px] text-gray-400">XP</p>
                          </div>
                        </div>
                      );
                    })}
                  </Card>
                </>
              )}
            </>
          )}
        </div>

        {/* ── RIGHT: sticky sidebar (xl+) ── */}
        <aside className="hidden xl:flex flex-col w-72 flex-shrink-0 sticky top-6 self-start space-y-4">
          {/* Scope filter */}
          <Card>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">View</p>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-semibold w-full">
              {(["global", "subject", "friends"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)}
                  className={`flex-1 px-3 py-1.5 transition-colors ${scope === s ? "bg-primary-600 text-white" : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                  {s === "global" ? t("global") : s === "subject" ? "Subject" : "Friends"}
                </button>
              ))}
            </div>
          </Card>

          {/* Your rank banner */}
          {myEntry && myRank && (
            <Card className="bg-primary-50 dark:bg-primary-900/20 border-primary-100 dark:border-primary-900/40 flex items-center gap-2.5 px-3.5 py-3">
              <UserAvatar userId={userId} name={myEntry.display_name ?? shortId(userId)} sizeClass="w-8 h-8 text-xs flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{t("yourRank")}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">Lv {myEntry.level} — {levelName(myEntry.level)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-base font-bold text-primary-600 dark:text-primary-400">#{myRank}</p>
                <p className="text-[11px] text-gray-400">{myEntry.total_xp.toLocaleString()} XP</p>
              </div>
            </Card>
          )}

          {/* Unlock progress */}
          {myRank && myRank > 10 && (
            <Card className="border border-primary-100 dark:border-primary-900/40">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-primary-500" /> Unlock Progress
                </p>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Rank #{myRank}</span>
              </div>
              <div className="space-y-3">
                {([30, 20, 10] as const).map((threshold) => {
                  const needed = xpToTop(threshold);
                  const threshEntry = leaders[threshold - 1];
                  if (!threshEntry) return null;
                  const myXp = myEntry?.total_xp ?? 0;
                  const progress = Math.min(100, (myXp / threshEntry.total_xp) * 100);
                  const unlocked = needed !== null && needed <= 0;
                  const labels: Record<number, string> = { 30: "Top 30 · 1mo FREE", 20: "Top 20 · 2mo FREE", 10: "Top 10 · 3mo FREE" };
                  return (
                    <div key={threshold}>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className={`font-semibold flex items-center gap-1 ${unlocked ? "text-success-600 dark:text-success-400" : "text-gray-600 dark:text-gray-300"}`}>
                          {unlocked && <Unlock className="w-2.5 h-2.5" />}{labels[threshold]}
                        </span>
                        <span className="text-gray-400">{unlocked ? "Unlocked" : `+${needed?.toLocaleString()} XP`}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* CTA */}
          {myRank && leaders[29] && (
            <div className="rounded-2xl bg-primary-600 p-4 text-white relative overflow-hidden">
              <Trophy className="absolute right-3 top-3 w-16 h-16 text-white/10 pointer-events-none" />
              <div className="relative z-10">
                <p className="font-bold text-sm flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> {t("keepStreak")}
                </p>
                {xpToTop(30) !== null && xpToTop(30)! > 0 && (
                  <p className="text-white/80 text-xs mt-1.5 leading-snug">
                    You're #{myRank} — earn <strong className="text-white">{xpToTop(30)!.toLocaleString()} more XP</strong> to reach Top 30 and unlock 1 month FREE Premium.
                  </p>
                )}
                {xpToTop(30) !== null && xpToTop(30)! <= 0 && xpToTop(10)! > 0 && (
                  <p className="text-white/80 text-xs mt-1.5 leading-snug">
                    You're in Top 30! Earn <strong className="text-white">{xpToTop(10)!.toLocaleString()} more XP</strong> to unlock 3 months FREE Premium.
                  </p>
                )}
                <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    style={{ width: `${Math.min(100, ((myEntry?.total_xp ?? 0) / leaders[29].total_xp) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </aside>

      </div>

      {challenging && (
        <ChallengeFriendModal friend={challenging} onClose={() => setChallenging(null)} />
      )}
    </div>
  );
}
