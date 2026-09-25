import { Clock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useStudyTime } from "@/hooks/useStudyTime";
import { interpolate } from "@/lib/interpolate";

export default function StudyLimitBanner({ className = "" }: { className?: string }) {
  const { t } = useLanguage();
  const { isEnabled, limitReached, usedToday, limitMinutes } = useStudyTime();
  if (!isEnabled || !limitReached) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-warning-50 dark:bg-warning-900/20 text-warning-700 dark:text-warning-300 border border-warning-100 dark:border-warning-800 ${className}`}
    >
      <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span className="min-w-0 break-words">
        {interpolate(t("parentStudyLimitReachedBanner"), { used: usedToday, limit: limitMinutes ?? 0 })}
      </span>
    </div>
  );
}
