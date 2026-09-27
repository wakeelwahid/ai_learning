import { useQuery } from "@tanstack/react-query";
import { Shield, Star, Lock, Unlock, ChevronRight, Trophy } from "lucide-react";
import BackButton from "@/components/ui/BackButton";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { gamificationApi } from "@/lib/api";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";

const LEVEL_NAMES = [
  "Novice", "Explorer", "Scholar", "Achiever", "Expert",
  "Champion", "Master", "Legend", "Elite", "Grand Master",
];

export default function LevelProgressPage() {
  const { t } = useLanguage();
  const userId = useAppSelector((s) => s.auth.user?.id ?? "");

  const { data, isLoading } = useQuery({
    queryKey: ["level-info", userId],
    queryFn: () => gamificationApi.levelInfo(userId).then((r) => r.data),
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <div className="w-full flex items-center justify-center py-24">
        <div className="w-10 h-10 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
        <span className="sr-only">{t("loading")}</span>
      </div>
    );
  }

  const level: number = data?.level ?? 1;
  const totalXp: number = data?.total_xp ?? 0;
  const xpToNext: number = data?.xp_to_next_level ?? 100;
  const progress: number = data?.progress_percent ?? 0;
  const unlockedFeatures: string[] = data?.unlocked_features ?? [];
  const nextFeatures: string[] = data?.next_level_features ?? [];
  const seasonStart: string | null = data?.season_start ?? null;
  const allUnlocks: Record<string, string[]> = data?.all_unlocks ?? {};

  // Compute season end (3 months after start)
  const seasonEnd = seasonStart
    ? (() => {
        const d = new Date(seasonStart);
        d.setMonth(d.getMonth() + 3);
        return d;
      })()
    : null;

  const daysRemaining = seasonEnd
    ? Math.max(0, Math.floor((seasonEnd.getTime() - Date.now()) / 86_400_000))
    : null;

  const levelName = LEVEL_NAMES[Math.min(level - 1, 9)];

  return (
    <div className="w-full space-y-6">
      <BackButton label="Back" />

      {/* Header — current level card */}
      <Card className="bg-primary-600 border-primary-600 p-4 sm:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_white_0%,_transparent_70%)]" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-3 sm:gap-5 min-w-0 w-full sm:w-auto">
            <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-white/20 flex items-center justify-center border-4 border-white/30 shrink-0">
              <span className="text-xl sm:text-3xl font-bold text-white">{level}</span>
            </div>
            <div className="min-w-0">
              <div className="text-white/70 text-xs font-semibold uppercase tracking-wide truncate">
                {t("level")} {level}
              </div>
              <div className="text-lg sm:text-2xl font-bold text-white truncate">{levelName}</div>
              <div className="text-white/70 text-sm mt-0.5 flex items-center gap-1 truncate">
                <Star className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{totalXp.toLocaleString()} {t("totalXP")}</span>
              </div>
            </div>
          </div>

          {/* Season timer */}
          {daysRemaining !== null && (
            <div className="bg-black/15 rounded-xl px-4 py-3 text-center border border-white/10 shrink-0">
              <div className="text-white text-xl font-bold">{daysRemaining}d</div>
              <div className="text-white/70 text-xs">Season resets</div>
            </div>
          )}
        </div>

        {/* XP progress bar */}
        <div className="relative mt-6">
          <div className="flex justify-between text-xs text-white/70 mb-1.5">
            <span>{t("nextLevelLabel")} {level < 10 ? level + 1 : "MAX"}</span>
            <span>
              {level < 10 ? `${xpToNext} ${t("xpNeeded")}` : "Max Level Reached!"}
            </span>
          </div>
          <div className="h-2.5 bg-black/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-700"
              style={{ width: `${level >= 10 ? 100 : progress}%` }}
            />
          </div>
          {level < 10 && (
            <div className="text-right text-xs text-white/70 mt-1">{Math.round(progress)}%</div>
          )}
        </div>
      </Card>

      {/* Current unlocks */}
      {unlockedFeatures.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Unlock className="w-5 h-5 text-success-500" /> Your Unlocked Features
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unlockedFeatures.map((f) => (
              <div key={f} className="flex items-center gap-2 text-success-700 dark:text-success-400 text-sm">
                <ChevronRight className="w-4 h-4 text-success-500 shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Next level preview */}
      {level < 10 && nextFeatures.length > 0 && (
        <Card className="border-l-4 border-l-primary-500">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary-500" /> Unlock at {t("level")} {level + 1}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {nextFeatures.map((f) => (
              <div key={f} className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
                <ChevronRight className="w-4 h-4 text-primary-400 shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* All levels roadmap */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-warning-500" /> Level Roadmap
        </h2>
        <div className="space-y-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((lvl) => {
            const isCompleted = lvl < level;
            const isCurrent   = lvl === level;
            const features    = allUnlocks[String(lvl)] ?? [];
            const name        = LEVEL_NAMES[lvl - 1];

            return (
              <div
                key={lvl}
                className={`flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl transition-colors ${
                  isCurrent
                    ? "bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800"
                    : isCompleted
                    ? "bg-gray-50 dark:bg-gray-800/60"
                    : "bg-gray-50/50 dark:bg-gray-900/30 opacity-60"
                }`}
              >
                {/* Level badge */}
                <div
                  className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white ${
                    isCurrent || isCompleted ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-700"
                  }`}
                >
                  {isCompleted ? (
                    <Shield className="w-4 h-4" />
                  ) : (
                    <span className="text-sm">{lvl}</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-semibold text-sm truncate min-w-0 ${isCurrent ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>
                      {t("level")} {lvl} — {name}
                    </span>
                    {isCurrent && <Badge variant="primary">Current</Badge>}
                    {isCompleted && <Badge variant="success">Complete</Badge>}
                  </div>
                  {features.length > 0 && (
                    <div className="text-xs text-gray-400 mt-1 truncate">
                      {features.slice(0, 3).join(" · ")}
                      {features.length > 3 && ` +${features.length - 3} more`}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Season info */}
      {seasonStart && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Season Info</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Current season started{" "}
            <span className="text-gray-800 dark:text-gray-200 font-medium">
              {new Date(seasonStart).toLocaleDateString(undefined, {
                year: "numeric", month: "long", day: "numeric",
              })}
            </span>
            . XP resets every 3 months — EduPoints never reset.
            {daysRemaining !== null && (
              <> <span className="text-primary-600 dark:text-primary-400 font-medium">{daysRemaining} days</span> left in this season.</>
            )}
          </p>
        </Card>
      )}

    </div>
  );
}
