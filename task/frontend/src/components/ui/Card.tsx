import { HTMLAttributes } from "react";
import clsx from "clsx";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover elevation + pointer cursor for genuinely interactive cards. */
  hover?: boolean;
  /** Removes the default padding, for cards that manage their own inner layout (e.g. tables). */
  noPadding?: boolean;
}

/** Base card primitive — white surface, thin neutral border, small radius, minimal shadow. */
export default function Card({ hover = false, noPadding = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={clsx(hover ? "card-hover" : "card", noPadding && "p-0", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("flex items-center justify-between gap-2 flex-wrap mb-4", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={clsx("text-lg font-semibold text-gray-900 dark:text-gray-100 min-w-0 break-words", className)} {...rest}>
      {children}
    </h3>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("mt-4 pt-4 border-t border-gray-100 dark:border-gray-700", className)} {...rest}>
      {children}
    </div>
  );
}
