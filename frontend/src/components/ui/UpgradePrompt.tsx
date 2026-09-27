import { Sparkles, Clock } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  /** The backend's ready-to-show message (gamification_service's
      FeatureUsageService always sets this on a feature_limit_reached 429)
      — rendered verbatim, never a client-authored fallback string. */
  message: string;
  /** Compact = inline strip (fits inside a card/panel); full = standalone
      block with more breathing room (fits where an error used to occupy
      the whole content area). */
  variant?: "compact" | "full";
}

// Shown wherever a gated feature's daily quota is hit (429 from
// gamification_service's FeatureUsageService) — same visual language as
// SubscriptionGate's "Upgrade Now" CTA, but reactive (after a real use
// is blocked) rather than a pre-emptive blur overlay.
export default function UpgradePrompt({ message, variant = "full" }: Props) {
  const text = message;

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 rounded-xl px-4 py-3">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-600 flex-shrink-0">
          <Clock className="w-4 h-4 text-white" />
        </span>
        <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 min-w-0">{text}</p>
        <Link
          to="/subscription"
          className="flex-shrink-0 flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" /> Upgrade
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary-100 dark:border-primary-900/40 bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/10 dark:to-gray-900 p-6 text-center">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-600 shadow-md mb-3">
        <Clock className="w-6 h-6 text-white" />
      </span>
      <p className="font-semibold text-gray-900 dark:text-white text-sm max-w-sm mx-auto">{text}</p>
      <Link
        to="/subscription"
        className="mt-4 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
      >
        <Sparkles className="w-4 h-4" /> Upgrade to Premium
      </Link>
    </div>
  );
}
