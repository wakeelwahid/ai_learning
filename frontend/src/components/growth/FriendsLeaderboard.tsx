import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { gamificationApi } from "@/lib/api";
import { Trophy, Users, Swords } from "lucide-react";
import ChallengeFriendModal from "./ChallengeFriendModal";

// ── Backend contract ──────────────────────────────────────────────────────────
interface FriendEntry {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  total_xp: number;
  level: number;
  is_me: boolean;
  rank: number;
}

interface FriendsLeaderboardData {
  entries: FriendEntry[];
  friend_count: number;
}

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function displayName(e: FriendEntry) {
  return e.is_me ? "You" : e.full_name || "Student";
}

export default function FriendsLeaderboard({ userId }: { userId?: string }) {
  const [challenging, setChallenging] = useState<{ id: string; name: string; avatarUrl?: string | null } | null>(null);

  const { data } = useQuery<FriendsLeaderboardData>({
    queryKey: ["friends-leaderboard", userId],
    queryFn: () => gamificationApi.friendsLeaderboard(userId!).then((r) => r.data),
    enabled: !!userId,
  });

  if (!data) return null;

  const top5 = (data.entries ?? []).slice(0, 5);

  return (
    <>
      <div className="card h-full flex flex-col !p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
              <Trophy className="w-4 h-4 text-yellow-500" />
            </span>
            Friends Leaderboard
          </h3>
          <Link to="/leaderboard" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
            View all
          </Link>
        </div>

        {data.friend_count === 0 ? (
          /* ── No friends yet ── */
          <div className="mt-3 flex-1 flex flex-col items-center justify-center text-center py-7 rounded-xl bg-gradient-to-b from-violet-50/60 to-transparent dark:from-violet-900/10">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-900/30 ring-1 ring-violet-200/60 dark:ring-violet-800/50 flex items-center justify-center">
              <Users className="w-6 h-6 text-violet-500" />
            </div>
            <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Add friends to compete!</p>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">See how you rank among classmates</p>
            <Link
              to="/messages"
              className="mt-3.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 active:scale-[0.97] transition-all shadow-sm shadow-violet-600/20"
            >
              Find Friends
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-1">
            {top5.map((e) => {
              const isPodium = e.rank <= 3;
              return (
                <div
                  key={e.user_id}
                  className={`group flex items-center gap-2.5 p-2 rounded-xl transition-colors ${
                    e.is_me
                      ? "bg-violet-50 dark:bg-violet-900/20 ring-1 ring-violet-200 dark:ring-violet-800"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  }`}
                >
                  <span
                    className={`w-6 h-6 flex items-center justify-center text-xs font-bold rounded-full flex-shrink-0 ${
                      isPodium
                        ? "text-base bg-transparent"
                        : "text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800"
                    }`}
                  >
                    {isPodium ? MEDALS[e.rank] : `#${e.rank}`}
                  </span>

                  <div className="relative flex-shrink-0">
                    {e.avatar_url ? (
                      <img src={e.avatar_url} alt={displayName(e)} className="w-8 h-8 rounded-full object-cover ring-2 ring-white dark:ring-gray-900" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900">
                        {displayName(e).charAt(0).toUpperCase()}
                      </div>
                    )}
                    {e.is_me && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-violet-600 ring-2 ring-white dark:ring-gray-900" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${e.is_me ? "text-violet-700 dark:text-violet-300" : "text-gray-800 dark:text-gray-200"}`}>
                      {displayName(e)}
                    </p>
                    <p className="text-[11px] text-gray-400 tabular-nums">
                      {e.total_xp.toLocaleString()} XP · Lv {e.level}
                    </p>
                  </div>

                  {!e.is_me && (
                    <button
                      onClick={() => setChallenging({ id: e.user_id, name: displayName(e), avatarUrl: e.avatar_url })}
                      className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 opacity-70 group-hover:opacity-100 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-all"
                      title={`Challenge ${displayName(e)}`}
                    >
                      <Swords className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {challenging && (
        <ChallengeFriendModal friend={challenging} onClose={() => setChallenging(null)} />
      )}
    </>
  );
}
