import { ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

export interface ModalProps {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  footer?: ReactNode;
}

const SIZE_CLASS = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

/** Base modal/dialog primitive — centered card over a blurred backdrop. */
export default function Modal({ title, onClose, children, size = "md", footer }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className={clsx(
          "bg-white dark:bg-gray-800 rounded-2xl shadow-md w-full max-h-[90vh] flex flex-col animate-scale-in",
          SIZE_CLASS[size]
        )}
      >
        {title && (
          <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 min-w-0 truncate">{title}</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6">{children}</div>
        {footer && (
          <div className="px-4 sm:px-6 py-4 border-t border-gray-100 dark:border-gray-700 shrink-0 flex flex-wrap items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
