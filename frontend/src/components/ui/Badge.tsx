import { HTMLAttributes } from "react";
import clsx from "clsx";

export type BadgeVariant = "primary" | "success" | "warning" | "danger" | "info" | "gray";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  primary: "badge-primary",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  info: "badge-info",
  gray: "badge-gray",
};

/** Pill badge — semantic variants only (status/feedback), never decorative. */
export default function Badge({ variant = "gray", className, children, ...rest }: BadgeProps) {
  return (
    <span className={clsx(VARIANT_CLASS[variant], className)} {...rest}>
      {children}
    </span>
  );
}
