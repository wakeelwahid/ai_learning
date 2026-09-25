import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { Clock, Plus, UserPlus } from "lucide-react";
import { Avatar, Button, EmptyState } from "@/components/ui";
import { parentApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { interpolate } from "@/lib/interpolate";
import { useLanguage } from "@/contexts/LanguageContext";
import type { StudentLink } from "@/hooks/useSelectedChild";

export function firstNameOf(child: StudentLink | null | undefined, fallback = "your child") {
  const n = child?.student_name?.trim();
  return n ? n.split(" ")[0] : fallback;
}

export function PendingBadge({ className = "" }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide text-warning-700 bg-warning-100 dark:bg-warning-900/30 dark:text-warning-300 px-1.5 py-0.5 rounded ${className}`}>
      {t("parentPendingBadge")}
    </span>
  );
}

export function ChildSelector({
  children,
  selectedChildId,
  onSelect,
  showAdd = true,
  compact = false,
  className = "",
}: {
  children: StudentLink[];
  selectedChildId: string | null;
  onSelect: (id: string) => void;
  showAdd?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useLanguage();
  if (children.length === 0) return null;
  return (
    <div className={`flex items-center gap-0 overflow-x-auto no-scrollbar border-b border-gray-100 dark:border-gray-700 ${className}`}>
      {children.map((child, i) => {
        const active = child.student_user_id === selectedChildId;
        return (
          <button
            key={child.id}
            type="button"
            onClick={() => onSelect(child.student_user_id)}
            className={`flex items-center gap-2 ${compact ? "px-3 py-2.5" : "px-5 py-3.5"} text-sm font-medium transition-all border-b-2 flex-shrink-0 ${
              active
                ? "border-primary-500 text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <Avatar name={child.student_name ?? "S"} size="sm" className="!w-7 !h-7 !text-xs" />
            <div className="text-left">
              <p className="leading-tight flex items-center gap-1.5">
                {child.student_name ?? `${t("parentStudentFallback")} ${i + 1}`}
                {!child.is_approved && <PendingBadge />}
              </p>
              {!compact && (
                <p className="text-xs text-gray-400 font-normal">
                  {interpolate(t("parentClassBoard"), { cls: child.student_class ?? "–", board: child.student_board ?? "–" })}
                </p>
              )}
            </div>
          </button>
        );
      })}
      {showAdd && (
        <Link to="/parent/link-student" className="flex items-center gap-1.5 px-4 py-3.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex-shrink-0 ml-auto border-b-2 border-transparent">
          <Plus className="w-3.5 h-3.5" /> {t("parentAddChild")}
        </Link>
      )}
    </div>
  );
}

export function PendingChildState({ child, className = "" }: { child: StudentLink; className?: string }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const name = firstNameOf(child, t("parentYourChild"));

  const cancel = async () => {
    if (!window.confirm(interpolate(t("parentCancelLinkConfirm"), { name }))) return;
    setCancelling(true);
    try {
      await parentApi.removeLink(child.id);
      toast.success(t("parentLinkRequestCancelled"));
      qc.invalidateQueries({ queryKey: ["parent-students"] });
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 ${className}`}>
      <EmptyState
        icon={Clock}
        title={interpolate(t("parentAwaitingApprovalTitle"), { name })}
        description={interpolate(t("parentAwaitingApprovalDesc"), { name })}
      />
      <div className="flex justify-center pb-6 -mt-8">
        <Button variant="secondary" size="sm" onClick={cancel} disabled={cancelling} isLoading={cancelling}>
          {t("parentCancelRequest")}
        </Button>
      </div>
    </div>
  );
}

export function NoChildrenState({ className = "" }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 ${className}`}>
      <EmptyState
        icon={UserPlus}
        title={t("parentNoChildrenTitle")}
        description={t("parentNoChildrenDesc")}
      />
      <div className="flex justify-center pb-6 -mt-8">
        <Link to="/parent/link-student" className="btn-primary text-sm">{t("parentLinkAStudent")}</Link>
      </div>
    </div>
  );
}
