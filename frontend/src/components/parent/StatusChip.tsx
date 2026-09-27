import { Badge, type BadgeVariant } from "@/components/ui";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/i18n/translations";

const STATUS_META: Record<string, { variant: BadgeVariant; key: TranslationKey }> = {
  pending:   { variant: "warning", key: "parentStatusPending" },
  confirmed: { variant: "success", key: "parentStatusConfirmed" },
  approved:  { variant: "success", key: "parentStatusApproved" },
  declined:  { variant: "danger",  key: "parentStatusDeclined" },
  rejected:  { variant: "danger",  key: "parentStatusDeclined" },
  completed: { variant: "info",    key: "parentStatusCompleted" },
  cancelled: { variant: "gray",    key: "parentStatusCancelled" },
  consumed:  { variant: "gray",    key: "parentStatusConsumed" },
};

export default function StatusChip({ status, className = "" }: { status: string; className?: string }) {
  const { t } = useLanguage();
  const meta = STATUS_META[status] ?? { variant: "gray" as BadgeVariant, key: null };
  return (
    <Badge variant={meta.variant} className={`capitalize flex-shrink-0 ${className}`}>
      {meta.key ? t(meta.key) : status}
    </Badge>
  );
}
