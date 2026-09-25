interface CircularProgressRingProps {
  pct: number; // 0-100
  completed?: boolean;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}

// SVG progress ring wrapping an icon badge — used for Today's Goals buttons
// so completion state reads at a glance without opening the goal.
export default function CircularProgressRing({
  pct,
  completed,
  size = 52,
  strokeWidth = 3,
  children,
}: CircularProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const center = size / 2;

  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`transition-all duration-500 ${completed ? "text-emerald-500" : "text-primary-500"}`}
        />
      </svg>
      {children}
    </span>
  );
}
