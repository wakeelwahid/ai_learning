import { Card, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import { ClipboardList, Plus, CheckCircle2, Clock, AlertOctagon } from "lucide-react";

/** STATIC PREVIEW — no backend yet. Every value here is a fixed mock so the
 * layout/flow can be reviewed before the real assignment-creation and
 * submission-tracking feature is built. */
const ASSIGNMENTS = [
  { id: "1", title: "Chapter 5 Practice — Quadratic Equations", subject: "Mathematics", due: "Due tomorrow", submitted: 24, total: 32, status: "active" as const },
  { id: "2", title: "Lab Report: Photosynthesis Experiment", subject: "Biology", due: "Due in 3 days", submitted: 12, total: 28, status: "active" as const },
  { id: "3", title: "Essay: Industrial Revolution", subject: "History", due: "Overdue by 1 day", submitted: 18, total: 30, status: "overdue" as const },
  { id: "4", title: "Unit 3 Vocabulary Quiz", subject: "English", due: "Completed", submitted: 32, total: 32, status: "done" as const },
];

const STATUS_BADGE: Record<string, { variant: "warning" | "danger" | "success"; label: string; icon: typeof Clock }> = {
  active: { variant: "warning", label: "In Progress", icon: Clock },
  overdue: { variant: "danger", label: "Overdue", icon: AlertOctagon },
  done: { variant: "success", label: "Completed", icon: CheckCircle2 },
};

export default function AssignmentsSection() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="warning">Coming Soon</Badge>
          <p className="text-sm text-gray-500 dark:text-gray-400">Preview of assignment creation & tracking — not yet functional</p>
        </div>
        <Button variant="primary" disabled>
          <Plus className="w-4 h-4" /> New Assignment
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="w-4 h-4 text-indigo-500" /> Assignments
          </CardTitle>
        </CardHeader>
        <div className="space-y-3">
          {ASSIGNMENTS.map((a) => {
            const status = STATUS_BADGE[a.status];
            const Icon = status.icon;
            const pct = Math.round((a.submitted / a.total) * 100);
            return (
              <div key={a.id} className="p-3 rounded-xl border border-gray-100 dark:border-gray-700 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{a.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.subject} · {a.due}</p>
                  </div>
                  <Badge variant={status.variant} className="flex items-center gap-1 flex-shrink-0">
                    <Icon className="w-3 h-3" /> {status.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{a.submitted}/{a.total} submitted</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
