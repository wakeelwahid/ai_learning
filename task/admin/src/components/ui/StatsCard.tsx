import { clsx } from "clsx";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: { value: number; label: string };
  color: string;
}

export default function StatsCard({ label, value, icon: Icon, trend, color }: StatsCardProps) {
  return (
    <div className="card p-5 flex items-start justify-between">
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
        {trend && (
          <p className={clsx("text-xs mt-1.5 font-medium", trend.value >= 0 ? "text-success-600 dark:text-success-400" : "text-danger-600 dark:text-danger-400")}>
            {trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value)}% {trend.label}
          </p>
        )}
      </div>
      <div className={clsx("w-11 h-11 rounded-xl flex items-center justify-center", color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  );
}
