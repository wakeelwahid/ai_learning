import { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import clsx from "clsx";

/** Table primitives (Table/TableHead/TableRow/TableCell) built on the
 * `.table-th` / `.table-td` token classes — compose these instead of
 * writing raw <table> markup per page. */
export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx("w-full", className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={clsx("bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700", className)} {...rest}>
      {children}
    </thead>
  );
}

export function TableBody({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={clsx("divide-y divide-gray-50 dark:divide-gray-800", className)} {...rest}>
      {children}
    </tbody>
  );
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Adds the standard hover treatment for clickable/selectable rows. */
  interactive?: boolean;
  /** Applies alternating row tint — opt-in, off by default. */
  zebra?: boolean;
}

export function TableRow({ interactive = false, zebra = false, className, children, ...rest }: TableRowProps) {
  return (
    <tr
      className={clsx(interactive && "table-row-hover cursor-pointer", zebra && "even:bg-gray-50/60 dark:even:bg-gray-800/30", className)}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TableHeaderCell({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={clsx("table-th", className)} {...rest}>
      {children}
    </th>
  );
}

export function TableCell({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={clsx("table-td", className)} {...rest}>
      {children}
    </td>
  );
}

export interface TableEmptyProps {
  colSpan: number;
  message?: string;
}

export function TableEmpty({ colSpan, message = "No records found" }: TableEmptyProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="table-td text-center text-gray-400 dark:text-gray-500 py-12">
        {message}
      </td>
    </tr>
  );
}
