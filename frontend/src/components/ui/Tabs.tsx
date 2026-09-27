import clsx from "clsx";

export interface TabItem {
  key: string;
  label: string;
}

export interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

/** Underline tab primitive — pass tabs + active key + onChange. */
export default function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div
      className={clsx(
        "flex gap-1 border-b border-gray-100 dark:border-gray-700 overflow-x-auto no-scrollbar",
        className
      )}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={clsx("tab shrink-0", active === tab.key && "tab-active")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
