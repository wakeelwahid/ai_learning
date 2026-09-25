import { Card, CardHeader, CardTitle, Badge, Avatar, Button } from "@/components/ui";
import { LifeBuoy, MessageCircleQuestion, Flag, Check } from "lucide-react";

/** STATIC PREVIEW — no backend yet. Every value here is a fixed mock so the
 * layout/flow can be reviewed before the real "needs support" flagging and
 * doubt-queue feature is built. */
const NEEDS_SUPPORT = [
  { name: "Rohan Gupta", roll: "10-A-03", reason: "Score dropped 18% this week in Mathematics", severity: "high" as const },
  { name: "Vikram Rao", roll: "10-A-05", reason: "No activity in the last 4 days", severity: "medium" as const },
  { name: "Meera Joshi", roll: "10-A-11", reason: "Struggling with Trigonometry (3 attempts, avg 32%)", severity: "high" as const },
];

const DOUBT_QUEUE = [
  { student: "Ananya Singh", question: "Why does sin(90°) = 1? I don't understand the unit circle.", subject: "Mathematics", time: "23 min ago" },
  { student: "Ishita Verma", question: "What's the difference between mitosis and meiosis?", subject: "Biology", time: "1h ago" },
];

const SEVERITY_BADGE = { high: "danger" as const, medium: "warning" as const };

export default function StudentSupportSection() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Coming Soon</Badge>
        <p className="text-sm text-gray-500 dark:text-gray-400">Preview of student-support flags & the doubt queue — not yet functional</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LifeBuoy className="w-4 h-4 text-danger-500" /> Needs Support
          </CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {NEEDS_SUPPORT.map((s) => (
            <div key={s.roll} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={s.name} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                    <Badge variant={SEVERITY_BADGE[s.severity]}>{s.severity}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.reason}</p>
                </div>
              </div>
              <Button size="sm" variant="secondary" disabled className="flex-shrink-0">
                <Flag className="w-3.5 h-3.5" /> Follow Up
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircleQuestion className="w-4 h-4 text-indigo-500" /> Doubt Queue
          </CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {DOUBT_QUEUE.map((d, i) => (
            <div key={i} className="p-3 rounded-xl border border-gray-100 dark:border-gray-700 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{d.student}</p>
                <span className="text-xs text-gray-400 flex-shrink-0">{d.time}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">{d.question}</p>
              <div className="flex items-center justify-between">
                <Badge variant="info">{d.subject}</Badge>
                <Button size="sm" variant="secondary" disabled>
                  <Check className="w-3.5 h-3.5" /> Resolve
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
