import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { useSubscription, hasPlan, type PlanTier } from "@/contexts/SubscriptionContext";

interface Props {
  required: PlanTier;
  children: React.ReactNode;
  featureName?: string;
}

export default function SubscriptionGate({ required, children, featureName }: Props) {
  const { plan, loading } = useSubscription();

  if (loading) return <>{children}</>;
  if (hasPlan(plan, required)) return <>{children}</>;

  const label = required === "premium" ? "Premium (₹149/mo)" : "Basic (₹99/mo)";

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Blurred preview */}
      <div className="pointer-events-none select-none blur-sm opacity-40">
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          {featureName && (
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{featureName}</p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
            This feature requires a <span className="font-semibold text-primary-600">{label}</span> subscription.
          </p>
          <Link
            to="/subscription"
            className="mt-1 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            Upgrade Now
          </Link>
        </div>
      </div>
    </div>
  );
}
