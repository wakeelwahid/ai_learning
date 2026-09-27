import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { battleApi } from "@/lib/api";
import { ArrowLeft, Trophy, Swords, Star, Clock, CheckCircle2, XCircle, Minus, RefreshCcw, BookOpen, Users, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Card, Badge, EmptyState, Pagination } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";

interface Props {
  userId: string;
  displayName: string;
  user: { id: string } | null;
  onBack: () => void;
}

// Battle type is a category label, not a status — use one neutral badge
// treatment for all types instead of a rainbow of decorative colors.
const TYPE_BADGE_VARIANT: BadgeVariant = "gray";

const PAGE_SIZE = 10;

const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  waiting:   "warning",
  starting:  "warning",
  active:    "success",
  completed: "gray",
  cancelled: "danger",
  abandoned: "danger",
};

export default function BattleHistory({ userId, displayName, user, onBack }: Props) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"played" | "created">("played");
  const [reviewBattle, setReviewBattle] = useState<any>(null);
  const [reviewData, setReviewData] = useState<any>(null);
  const [myPage, setMyPage] = useState(0);
  const [expandedBattle, setExpandedBattle] = useState<string | null>(null);

  const handleRematch = async (battleId: string) => {
    try {
      const { data } = await battleApi.rematch(battleId, user!.id, displayName);
      navigate(`/battle?join=${data.id}`);
      toast.success("Rematch created! Sharing battle code...");
    } catch { toast.error("Could not create rematch"); }
  };

  const handleReview = async (battleId: string) => {
    try {
      const { data } = await battleApi.getReplay(battleId, user!.id);
      setReviewData(data);
      setReviewBattle(battleId);
    } catch { toast.error("Review not available"); }
  };

  const { data: historyData, isLoading } = useQuery({
    queryKey: ["battle-history", userId],
    queryFn: () => battleApi.history(userId).then((r) => r.data),
  });

  const { data: myBattlesData, isLoading: myLoading } = useQuery({
    queryKey: ["my-battles", userId, myPage],
    queryFn: () => battleApi.myBattles(userId, PAGE_SIZE, myPage * PAGE_SIZE).then((r) => r.data),
    enabled: tab === "created",
  });

  const { data: lbData } = useQuery({
    queryKey: ["battle-leaderboard"],
    queryFn: () => battleApi.leaderboard().then((r) => r.data),
  });

  // API returns {history: [...]}
  const history: any[] = historyData?.history ?? [];
  const leaderboard: any[] = lbData?.leaderboard ?? [];
  const myBattles: any[] = myBattlesData?.battles ?? [];
  const myTotal: number = myBattlesData?.total ?? 0;
  const myTotalPages = Math.ceil(myTotal / PAGE_SIZE);

  // ── Battle Review Modal ───────────────────────────────────────────────────────
  if (reviewBattle && reviewData) {
    const questions: any[] = reviewData.questions ?? reviewData.replay ?? [];
    return (
      <div className="w-full space-y-4 animate-fade-in">
        <button
          onClick={() => { setReviewBattle(null); setReviewData(null); }}
          className="flex items-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h2 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" /> Battle Review
        </h2>
        <div className="space-y-4 overflow-y-auto max-h-[70vh] pr-1">
          {questions.length === 0 && (
            <EmptyState icon={BookOpen} title="No question data available for this battle." />
          )}
          {questions.map((item: any, idx: number) => {
            const userCorrect = item.is_correct ?? item.correct ?? false;
            return (
              <Card key={idx} className="space-y-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  <span className="text-gray-400 dark:text-gray-500 mr-2">Q{idx + 1}.</span>{item.question_text ?? item.text ?? item.question}
                </p>
                <div className="flex flex-col gap-1 text-sm">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${userCorrect ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300" : "bg-danger-50 text-danger-600 dark:bg-danger-900/20 dark:text-danger-300"}`}>
                    {userCorrect
                      ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      : <XCircle className="w-4 h-4 flex-shrink-0" />}
                    <span className="font-medium">Your answer:</span>
                    <span>{item.user_answer ?? item.selected_answer ?? "—"}</span>
                  </div>
                  {!userCorrect && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium">Correct answer:</span>
                      <span>{item.correct_answer ?? "—"}</span>
                    </div>
                  )}
                  {item.explanation && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 px-1 italic">{item.explanation}</p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Arena
      </button>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("played")}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === "played" ? "bg-white dark:bg-gray-700 text-primary-700 dark:text-primary-300 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
        >
          <span className="flex items-center gap-1.5"><Swords className="w-3.5 h-3.5" /> Played</span>
        </button>
        <button
          onClick={() => setTab("created")}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === "created" ? "bg-white dark:bg-gray-700 text-primary-700 dark:text-primary-300 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
        >
          <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> My Battles</span>
        </button>
      </div>

      {/* My Created Battles tab */}
      {tab === "created" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary-600 dark:text-primary-400" /> Battles I Created
              {myTotal > 0 && <span className="text-sm font-normal text-gray-400 dark:text-gray-500">({myTotal} total)</span>}
            </h2>
          </div>
          {myLoading && <p className="text-sm text-gray-400 dark:text-gray-500">{t("loading")}</p>}
          {!myLoading && myBattles.length === 0 && (
            <EmptyState icon={Swords} title="You haven't created any battles yet." />
          )}
          {myBattles.map((b: any) => {
            const isExpanded = expandedBattle === b.id;
            const isCompleted = b.status === "completed";
            const hasScore = b.my_score > 0 || b.my_correct > 0;
            return (
              <Card key={b.id} hover>
                {/* Main row */}
                <div className="flex items-start gap-3 flex-wrap xs:flex-nowrap">
                  <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0 text-primary-600 dark:text-primary-400 mt-0.5">
                    <Swords className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{b.subject || "General"}</span>
                      <Badge variant={TYPE_BADGE_VARIANT} className="capitalize">
                        {b.battle_type?.replace("_", " ")}
                      </Badge>
                      <Badge variant={STATUS_BADGE_VARIANT[b.status] ?? "gray"} className="capitalize">
                        {b.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                      <span>{b.difficulty}</span>
                      <span>{b.question_count}Q</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{b.time_limit_sec / 60}min</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{b.participant_count}/{b.max_players}</span>
                      <span>{new Date(b.created_at).toLocaleDateString()}</span>
                    </div>
                    {/* Score row — shown if participated */}
                    {hasScore && (
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="flex items-center gap-1 text-xs font-bold text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-lg">
                          <Star className="w-3 h-3" /> {b.my_score} pts
                        </span>
                        <span className="flex items-center gap-1 text-xs text-success-700 dark:text-success-300 bg-success-50 dark:bg-success-900/20 px-2 py-0.5 rounded-lg">
                          <CheckCircle2 className="w-3 h-3" /> {b.my_correct} correct
                        </span>
                        <span className="flex items-center gap-1 text-xs text-danger-600 dark:text-danger-300 bg-danger-50 dark:bg-danger-900/20 px-2 py-0.5 rounded-lg">
                          <XCircle className="w-3 h-3" /> {b.my_wrong} wrong
                        </span>
                        {b.my_rank && (
                          <span className="text-xs text-warning-700 dark:text-warning-300 bg-warning-50 dark:bg-warning-900/20 px-2 py-0.5 rounded-lg font-semibold">
                            Rank #{b.my_rank}
                          </span>
                        )}
                        {b.my_xp > 0 && (
                          <span className="flex items-center gap-1 text-xs text-warning-600 dark:text-warning-400 font-semibold">
                            <Zap className="w-3 h-3" />+{b.my_xp} XP
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-row xs:flex-col items-center xs:items-end gap-1.5 flex-shrink-0 w-full xs:w-auto flex-wrap">
                    {b.invite_code && (
                      <span className="font-mono text-[10px] bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-2 py-0.5 rounded-lg">{b.invite_code}</span>
                    )}
                    <div className="flex items-center gap-1 flex-wrap">
                      {isCompleted && (
                        <button
                          onClick={() => handleReview(b.id)}
                          className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 px-2 py-1 rounded-lg transition-colors"
                        >
                          <BookOpen className="w-3 h-3" /> Review
                        </button>
                      )}
                      {(b.standings?.length > 0 || hasScore) && (
                        <button
                          onClick={() => setExpandedBattle(isExpanded ? null : b.id)}
                          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded-lg transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          Details
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded standings */}
                {isExpanded && b.standings?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Trophy className="w-3 h-3 text-warning-500" /> Final Standings
                    </p>
                    <div className="space-y-1.5">
                      {b.standings.map((p: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs flex-wrap">
                          <span className={`w-5 text-center font-bold flex-shrink-0 ${i === 0 ? "text-warning-500" : i === 1 ? "text-gray-400 dark:text-gray-500" : i === 2 ? "text-orange-400" : "text-gray-400 dark:text-gray-500"}`}>
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${(p.rank ?? i + 1)}`}
                          </span>
                          <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
                            {p.is_ai ? "🤖" : (p.display_name?.charAt(0) ?? "?").toUpperCase()}
                          </div>
                          <span className="min-w-[60px] flex-1 text-gray-700 dark:text-gray-300 font-medium truncate">{p.display_name}{p.is_ai ? " (AI)" : ""}</span>
                          <span className="font-bold text-primary-700 dark:text-primary-300 text-right flex-shrink-0">{p.score} pts</span>
                          <span className="text-success-600 dark:text-success-400 text-right flex-shrink-0">{p.correct}✓</span>
                          <span className="text-danger-500 dark:text-danger-400 text-right flex-shrink-0">{p.wrong}✗</span>
                          <span className="text-gray-400 dark:text-gray-500 text-right flex-shrink-0">{p.accuracy}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Pagination */}
          <Pagination
            page={myPage}
            totalPages={myTotalPages}
            onPageChange={setMyPage}
            summary={`Page ${myPage + 1} of ${myTotalPages}`}
          />
        </div>
      )}

      {/* Played Battles tab */}
      {tab === "played" && <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Battle history */}
        <div className="space-y-3">
          <h2 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary-600 dark:text-primary-400" /> {t("battleHistory")}
          </h2>
          {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">{t("loading")}</p>}
          {!isLoading && history.length === 0 && (
            <EmptyState icon={Swords} title={t("noData")} />
          )}
          {history.map((b: any) => {
            // History entries have result/score/rank/xp_earned directly
            const won  = b.result === "won";
            const draw = b.result === "draw";
            return (
              <Card key={b.battle_id} className="flex items-start gap-3 flex-wrap xs:flex-nowrap">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${won ? "bg-warning-100 dark:bg-warning-900/30" : "bg-gray-100 dark:bg-gray-700"}`}>
                  {won ? <Trophy className="w-5 h-5 text-warning-500" /> : draw ? <Minus className="w-5 h-5 text-gray-400 dark:text-gray-500" /> : <Swords className="w-5 h-5 text-gray-400 dark:text-gray-500" />}
                </div>
                <div className="flex-1 min-w-[140px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{b.subject || "General"}</span>
                    <Badge variant={TYPE_BADGE_VARIANT} className="capitalize">
                      {b.battle_type?.replace("_", " ")}
                    </Badge>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{b.difficulty}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1"><Star className="w-3 h-3 text-primary-400" />{b.score} pts</span>
                    {b.rank && <span className="text-xs text-gray-500 dark:text-gray-400">Rank #{b.rank}</span>}
                    <span className="flex items-center gap-1 font-semibold text-warning-600 dark:text-warning-400">+{b.xp_earned} XP</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{b.played_at ? new Date(b.played_at).toLocaleDateString() : "—"}</span>
                  </div>
                </div>
                <div className="flex flex-row xs:flex-col items-center xs:items-end gap-1.5 flex-shrink-0 w-full xs:w-auto flex-wrap">
                  {won
                    ? <Badge variant="success"><CheckCircle2 className="w-3 h-3 mr-1" />Win</Badge>
                    : draw
                    ? <Badge variant="gray"><Minus className="w-3 h-3 mr-1" />Draw</Badge>
                    : <Badge variant="danger"><XCircle className="w-3 h-3 mr-1" />Loss</Badge>
                  }
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      onClick={() => handleReview(b.battle_id)}
                      className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 px-2 py-1 rounded-lg transition-colors"
                    >
                      <BookOpen className="w-3 h-3" /> Review
                    </button>
                    <button
                      onClick={() => handleRematch(b.battle_id)}
                      className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded-lg transition-colors"
                    >
                      <RefreshCcw className="w-3 h-3" /> Rematch
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Global leaderboard */}
        <div className="space-y-3">
          <h2 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
            <Trophy className="w-5 h-5 text-warning-500" /> Global Leaderboard
          </h2>
          <Card className="space-y-2">
            {leaderboard.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No entries yet.</p>
            )}
            {leaderboard.slice(0, 15).map((p: any, i: number) => (
              <div key={p.user_id} className={`flex items-center gap-2 sm:gap-3 py-1.5 flex-wrap ${p.user_id === userId ? "bg-primary-50 dark:bg-primary-900/20 rounded-xl px-2" : ""}`}>
                <span className={`text-sm font-bold w-6 text-center flex-shrink-0 ${i === 0 ? "text-warning-500" : i === 1 ? "text-gray-400 dark:text-gray-500" : i === 2 ? "text-orange-400" : "text-gray-400 dark:text-gray-500"}`}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {(p.display_name || "?").charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 min-w-[60px] text-sm text-gray-800 dark:text-gray-200 font-medium truncate">
                  {p.display_name || "Player"}{p.user_id === userId ? " (You)" : ""}
                </span>
                <span className="text-xs font-bold text-primary-600 dark:text-primary-400 flex-shrink-0">{p.battles_won}W</span>
                {/* API returns total_xp_earned */}
                <span className="text-xs text-warning-600 dark:text-warning-400 font-semibold flex-shrink-0">{p.total_xp_earned ?? p.total_xp ?? 0} XP</span>
              </div>
            ))}
          </Card>
        </div>
      </div>}
    </div>
  );
}
