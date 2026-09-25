import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import BackButton from "@/components/ui/BackButton";
import { Card, Alert, Avatar, Button } from "@/components/ui";
import { parentApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { interpolate } from "@/lib/interpolate";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSelectedChild, type StudentLink } from "@/hooks/useSelectedChild";
import { NoChildrenState, PendingChildState } from "@/components/parent/ChildSelector";
import {
  CheckCircle, Shield, ToggleLeft, ToggleRight,
} from "lucide-react";

interface StudyLimit {
  daily_limit_minutes: number;
  is_enabled: boolean;
}

interface StudyLimitResponse extends StudyLimit {
  used_today_minutes?: number;
}

const LIMIT_OPTIONS = [
  { minutes: 30 },
  { minutes: 60 },
  { minutes: 120 },
  { minutes: 180 },
  { minutes: 240 },
  { minutes: 0 },
];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`flex items-center gap-1.5 text-sm font-semibold transition-colors flex-shrink-0 ${
        on ? "text-primary-600 dark:text-primary-400" : "text-gray-400 dark:text-gray-500"
      }`}
      aria-pressed={on}
    >
      {on
        ? <ToggleRight className="w-8 h-8 flex-shrink-0" />
        : <ToggleLeft  className="w-8 h-8 flex-shrink-0" />}
      {on ? t("parentEnabled") : t("parentDisabled")}
    </button>
  );
}

export function UsageBar({ used, limit, className = "" }: { used: number; limit: number; className?: string }) {
  const { t } = useLanguage();
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const reached = limit > 0 && used >= limit;
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300 min-w-0">
          {interpolate(t("parentUsedToday"), { used, limit })}
        </span>
        <span className={`text-xs font-semibold flex-shrink-0 ${reached ? "text-danger-600 dark:text-danger-400" : "text-gray-400"}`}>
          {reached ? t("parentLimitReachedToday") : `${pct}%`}
        </span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${reached ? "bg-danger-500" : "bg-primary-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ChildLimitCard({
  child,
  parentId,
}: {
  child: StudentLink;
  parentId: string;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isReal  = child.is_approved === true && UUID_RE.test(child.student_user_id) && UUID_RE.test(parentId);

  const { data: limitData } = useQuery<StudyLimitResponse>({
    queryKey: ["study-limit", child.student_user_id],
    queryFn: () =>
      parentApi.getStudyLimits(child.student_user_id, parentId).then(r => r.data),
    enabled: isReal,
    refetchInterval: 60_000,
  });

  const defaultLimit: StudyLimit = { daily_limit_minutes: 120, is_enabled: false };
  const current: StudyLimit = limitData
    ? { daily_limit_minutes: limitData.daily_limit_minutes, is_enabled: limitData.is_enabled }
    : defaultLimit;
  const usedToday = limitData?.used_today_minutes ?? 0;

  const [localLimit, setLocalLimit] = useState<StudyLimit>(current);
  const [saved, setSaved] = useState(false);

  const serverKey = JSON.stringify(current);
  const [lastServerKey, setLastServerKey] = useState(serverKey);
  if (serverKey !== lastServerKey) {
    setLastServerKey(serverKey);
    setLocalLimit(current);
  }

  const mutation = useMutation({
    mutationFn: (data: StudyLimit) =>
      parentApi.setStudyLimit(child.student_user_id, parentId, data),
    onSuccess: (_res, data) => {
      queryClient.setQueryData(["study-limit", child.student_user_id], { ...(limitData ?? {}), ...data });
      queryClient.invalidateQueries({ queryKey: ["study-limit", child.student_user_id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const isDirty = JSON.stringify(localLimit) !== JSON.stringify(current);
  const optionLabel = (m: number) =>
    m === 0 ? t("parentLimitOptNoLimit")
      : m < 60 ? interpolate(t("parentMinutesShort"), { n: m })
      : interpolate(t("parentHoursShort"), { n: m / 60 });

  return (
    <Card noPadding className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={child.student_name ?? "S"} size="md" className="flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
              {child.student_name ?? t("parentStudentFallback")}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {interpolate(t("parentClassBoard"), { cls: child.student_class ?? "–", board: child.student_board ?? "–" })}
            </p>
          </div>
        </div>
        <Toggle
          on={localLimit.is_enabled}
          onChange={v => setLocalLimit(p => ({ ...p, is_enabled: v }))}
        />
      </div>

      <div className="px-5 py-4 space-y-4">
        {current.is_enabled && current.daily_limit_minutes > 0 && (
          <UsageBar used={usedToday} limit={current.daily_limit_minutes} />
        )}

        {!localLimit.is_enabled && (
          <p className="text-xs text-gray-400 italic">{t("parentNoLimitSet")}</p>
        )}

        {localLimit.is_enabled && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              {t("parentDailyLimit")}
            </p>
            <div className="flex flex-wrap gap-2">
              {LIMIT_OPTIONS.map(opt => (
                <button
                  key={opt.minutes}
                  type="button"
                  onClick={() => setLocalLimit(p => ({ ...p, daily_limit_minutes: opt.minutes }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    localLimit.daily_limit_minutes === opt.minutes
                      ? "bg-primary-500 text-white border-primary-500 shadow-sm"
                      : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-600"
                  }`}
                >
                  {optionLabel(opt.minutes)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {saved ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-success-600">
              <CheckCircle className="w-4 h-4" /> {t("parentSaved")}
            </span>
          ) : (
            <span />
          )}
          <Button
            type="button"
            size="sm"
            disabled={!isDirty || mutation.isPending}
            onClick={() => mutation.mutate(localLimit)}
          >
            {mutation.isPending ? t("parentSaving") : t("parentSave")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function ParentStudyLimitsPage() {
  const { t } = useLanguage();
  const { parentId, children: students, isLoading } = useSelectedChild();
  const approved = students.filter(c => c.is_approved);
  const pending  = students.filter(c => !c.is_approved);

  return (
    <div className="w-full space-y-5 animate-fade-in">
      <BackButton label={t("parentBack")} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary-500" /> {t("parentStudyLimitsTitle")}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t("parentStudyLimitsSubtitle")}
        </p>
      </div>

      <Alert variant="info">{t("parentStudyLimitsInfo")}</Alert>

      {!isLoading && students.length === 0 && <NoChildrenState />}

      <div className="space-y-4">
        {approved.map(child => (
          <ChildLimitCard
            key={child.id}
            child={child}
            parentId={parentId}
          />
        ))}
        {pending.map(child => (
          <PendingChildState key={child.id} child={child} />
        ))}
      </div>
    </div>
  );
}
