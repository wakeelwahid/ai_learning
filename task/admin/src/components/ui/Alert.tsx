import { HTMLAttributes } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import clsx from "clsx";

export type AlertVariant = "success" | "warning" | "danger" | "info";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  onDismiss?: () => void;
}

const VARIANT_CLASS: Record<AlertVariant, string> = {
  success: "alert-success",
  warning: "alert-warning",
  danger: "alert-danger",
  info: "alert-info",
};

const VARIANT_ICON: Record<AlertVariant, typeof Info> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
};

/** Alert / banner primitive for inline feedback — one of the four semantic variants. */
export default function Alert({ variant = "info", title, onDismiss, className, children, ...rest }: AlertProps) {
  const Icon = VARIANT_ICON[variant];
  return (
    <div className={clsx(VARIANT_CLASS[variant], className)} {...rest}>
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
