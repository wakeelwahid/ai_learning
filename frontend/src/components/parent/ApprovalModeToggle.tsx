import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { parentApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { useLanguage } from "@/contexts/LanguageContext";
import { interpolate } from "@/lib/interpolate";
import type { StudentLink } from "@/hooks/useSelectedChild";
import { firstNameOf } from "./ChildSelector";

export function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${on ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-600"}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function ApprovalModeToggle({ link, showHelp = true, className = "" }: {
  link: StudentLink; showHelp?: boolean; className?: string;
}) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const on = !!link.approval_required;
  const name = firstNameOf(link, t("parentYourChild"));

  const change = async (next: boolean) => {
    setSaving(true);
    try {
      await parentApi.updateLink(link.id, { approval_required: next });
      toast.success(t("parentApprovalModeUpdated"));
      qc.invalidateQueries({ queryKey: ["parent-students"] });
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{t("parentApprovalMode")}</p>
        {showHelp && (
          <p className="text-xs text-gray-400 mt-0.5 break-words">{interpolate(t("parentApprovalModeHelp"), { name })}</p>
        )}
      </div>
      <Switch on={on} onChange={change} disabled={saving} />
    </div>
  );
}
