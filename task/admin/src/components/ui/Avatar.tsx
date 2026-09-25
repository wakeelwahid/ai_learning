import { useState } from "react";
import clsx from "clsx";

export interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASS = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-16 h-16 text-lg",
};

/** Avatar primitive — image with a deterministic initials-circle fallback (single brand tint). */
export default function Avatar({ src, name, size = "md", className }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const label = (name || "?").trim().charAt(0).toUpperCase();

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name || "avatar"}
        onError={() => setBroken(true)}
        className={clsx("rounded-full object-cover", SIZE_CLASS[size], className)}
      />
    );
  }

  return (
    <div
      className={clsx(
        "rounded-full flex items-center justify-center font-semibold bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300",
        SIZE_CLASS[size],
        className
      )}
    >
      {label}
    </div>
  );
}
