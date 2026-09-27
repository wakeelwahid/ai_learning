import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { gamificationApi } from "@/lib/api";
import { Gauge, Crown } from "lucide-react";

interface FeatureUsage {
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
}

interface UsageStatusResponse {
  tier: "free" | "premium";
  features: Record<string, FeatureUsage>;
}

/** "Usage Today" widget — a proactive daily-quota snapshot, distinct from
 * UpgradePrompt (which only appears reactively once a limit is already
 * hit). Shows nothing for a premium user (every limit is null/unlimited)
 * and nothing at all if the student has no limited features configured. */
export default function UsageTodayCard({ userId }: { userId?: string }) {
  const { data } = useQuery<UsageStatusResponse>({
    queryKey: ["usage-status", userId],
    queryFn: () => gamificationApi.usageStatus(userId!).then((r) => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });

  if (!data || data.tier === "premium") return null;

  const limited = Object.entries(data.features).filter(([, f]) => f.limit !== null);
  if (limited.length === 0) return null;

  return (
    <div className="card h-full flex flex-col !p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary-50 dark:bg-primary-900/20">
            <Gauge className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          </span>
          Usage Today
        </h3>
        <Link to="/subscription" className="text-xs font-medium text-primary-600 dark:text-primary-400 flex items-center gap-1 hover:underline">
          <Crown className="w-3.5 h-3.5" />
          Upgrade
        </Link>
      </div>

      <div className="space-y-2.5">
        {limited.map(([key, f]) => {
          const limit = f.limit as number;
          const pct = limit > 0 ? Math.min(100, (f.used / limit) * 100) : 0;
          const atLimit = f.remaining === 0;
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-300 truncate">{f.label}</span>
                <span className={`font-medium ${atLimit ? "text-danger-600 dark:text-danger-400" : "text-gray-500 dark:text-gray-400"}`}>
                  {f.used}/{limit}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${atLimit ? "bg-danger-500" : "bg-primary-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
