import { Card, CardHeader, CardTitle, Badge, Avatar, Button } from "@/components/ui";
import { School, TrendingUp, TrendingDown, Copy, Share2, UserPlus, RefreshCw } from "lucide-react";

/** STATIC PREVIEW — no backend yet. There is no teacher→student roster or
 * classroom-assignment system in this platform today (a teacher only sees
 * an anonymous board+class aggregate, see the Analytics tab); this section
 * previews what a real assigned-classroom roster — and the class-code join
 * flow that would populate it — would look like once that ownership model
 * is built. Every value here is a fixed mock. */
const CLASS_CODE = "MATH10A-X7K2";

const ROSTER = [
  { name: "Aarav Sharma", roll: "10-A-01", avgScore: 87, trend: "up" as const },
  { name: "Priya Patel", roll: "10-A-02", avgScore: 92, trend: "up" as const },
  { name: "Rohan Gupta", roll: "10-A-03", avgScore: 64, trend: "down" as const },
  { name: "Ananya Singh", roll: "10-A-04", avgScore: 78, trend: "up" as const },
  { name: "Vikram Rao", roll: "10-A-05", avgScore: 55, trend: "down" as const },
  { name: "Ishita Verma", roll: "10-A-06", avgScore: 81, trend: "up" as const },
];

const PENDING_JOINS = [
  { name: "Karan Mehta", joinedVia: "Class Code", time: "10 min ago" },
  { name: "Sanya Kapoor", joinedVia: "Class Code", time: "2 hours ago" },
];

export default function MyClassroomSection() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Coming Soon</Badge>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Preview of a real assigned classroom roster — not yet functional
        </p>
      </div>

      <Card className="bg-gradient-to-br from-indigo-500 to-primary-600 border-none text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium text-white/80 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" /> Class Join Code
            </p>
            <p className="text-2xl font-bold tracking-wide mt-1">{CLASS_CODE}</p>
            <p className="text-xs text-white/70 mt-1">Share this code — students enter it to join your class instantly</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled className="!bg-white/20 !text-white">
              <Copy className="w-3.5 h-3.5" /> Copy
            </Button>
            <Button variant="secondary" disabled className="!bg-white/20 !text-white">
              <Share2 className="w-3.5 h-3.5" /> Share
            </Button>
            <Button variant="secondary" disabled className="!bg-white/20 !text-white">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {PENDING_JOINS.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="w-4 h-4 text-success-500" /> Recently Joined
            </CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {PENDING_JOINS.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={p.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">via {p.joinedVia}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{p.time}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <CardTitle className="flex items-center gap-2 text-base">
              <School className="w-4 h-4 text-indigo-500" /> Class 10-A · CBSE
            </CardTitle>
            <span className="text-sm text-gray-400">{ROSTER.length} students</span>
          </div>
        </CardHeader>

        <div className="space-y-2">
          {ROSTER.map((s) => (
            <div
              key={s.roll}
              className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={s.name} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.roll}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{s.avgScore}%</span>
                {s.trend === "up" ? (
                  <TrendingUp className="w-4 h-4 text-success-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-danger-500" />
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
