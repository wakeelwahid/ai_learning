import { Card, CardHeader, CardTitle, Badge, Avatar, Button } from "@/components/ui";
import { CalendarCheck, Check, X, Clock3 } from "lucide-react";

/** STATIC PREVIEW — no backend yet. There is no attendance-tracking system
 * or teacher→student roster in this platform today; this section previews
 * what daily attendance-marking would look like once that ownership model
 * is built. Every value here is a fixed mock. */
const TODAY_ROSTER = [
  { name: "Aarav Sharma", roll: "10-A-01", status: "present" as const },
  { name: "Priya Patel", roll: "10-A-02", status: "present" as const },
  { name: "Rohan Gupta", roll: "10-A-03", status: "absent" as const },
  { name: "Ananya Singh", roll: "10-A-04", status: "present" as const },
  { name: "Vikram Rao", roll: "10-A-05", status: "late" as const },
  { name: "Ishita Verma", roll: "10-A-06", status: "present" as const },
];

const WEEKLY_TREND = [
  { day: "Mon", pct: 94 },
  { day: "Tue", pct: 88 },
  { day: "Wed", pct: 91 },
  { day: "Thu", pct: 97 },
  { day: "Fri", pct: 84 },
];

const STATUS_META = {
  present: { variant: "success" as const, label: "Present", icon: Check },
  absent: { variant: "danger" as const, label: "Absent", icon: X },
  late: { variant: "warning" as const, label: "Late", icon: Clock3 },
};

export default function AttendanceSection() {
  const presentCount = TODAY_ROSTER.filter((s) => s.status === "present").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="warning">Coming Soon</Badge>
          <p className="text-sm text-gray-500 dark:text-gray-400">Preview of daily attendance tracking — not yet functional</p>
        </div>
        <Button variant="primary" disabled>
          <CalendarCheck className="w-4 h-4" /> Mark Today's Attendance
        </Button>
      </div>

      <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Present Today</p>
          <p className="text-xl font-bold text-success-600 dark:text-success-400 mt-1">{presentCount}/{TODAY_ROSTER.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">This Week's Avg</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">91%</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Chronically Absent</p>
          <p className="text-xl font-bold text-danger-600 dark:text-danger-400 mt-1">1 student</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="w-4 h-4 text-indigo-500" /> Today · Class 10-A
          </CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {TODAY_ROSTER.map((s) => {
            const meta = STATUS_META[s.status];
            const Icon = meta.icon;
            return (
              <div key={s.roll} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={s.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.roll}</p>
                  </div>
                </div>
                <Badge variant={meta.variant} className="flex items-center gap-1 flex-shrink-0">
                  <Icon className="w-3 h-3" /> {meta.label}
                </Badge>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly Attendance Trend</CardTitle>
        </CardHeader>
        <div className="flex items-end gap-3 h-28 pt-2">
          {WEEKLY_TREND.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full rounded-t-md bg-indigo-500"
                  style={{ height: `${d.pct}%` }}
                  title={`${d.pct}%`}
                />
              </div>
              <span className="text-xs text-gray-400">{d.day}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
