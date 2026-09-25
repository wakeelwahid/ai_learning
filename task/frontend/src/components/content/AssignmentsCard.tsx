import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { contentApi } from "@/lib/api";
import { CheckCircle2, ClipboardList, Circle, AlertCircle } from "lucide-react";

interface AssignmentItem {
  assignment_id: string;
  title: string;
  description: string | null;
  entity_type: "chapter" | "exercise";
  entity_id: string;
  entity_title: string | null;
  subject_name: string | null;
  due_at: string | null;
  is_completed: boolean;
  completed_at: string | null;
  is_overdue: boolean;
}

function fmtDue(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Shows a student's real assignments (admin-created, backend-derived
 * completion — never a client-reported flag). Renders nothing when the
 * student has no assignments, so it's safe to drop into any dashboard.
 */
export default function AssignmentsCard({ studentId }: { studentId?: string }) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["student-assignments", studentId],
    queryFn: () => contentApi.studentAssignments(studentId!).then((r) => r.data),
    enabled: !!studentId,
  });

  const assignments: AssignmentItem[] = data?.assignments ?? [];
  if (assignments.length === 0) return null;

  // ContentPage's browser doesn't support deep-linking straight to a
  // specific chapter/exercise today, so this opens the content browser
  // rather than fabricating a query param nothing reads.
  const goTo = () => navigate("/learn");

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
          <ClipboardList className="w-4 h-4 text-primary-600" /> My Assignments
        </h3>
        <span className="text-xs font-semibold text-gray-400">
          {data.completed}/{data.total} done
        </span>
      </div>
      <div className="space-y-2">
        {assignments.slice(0, 6).map((a) => (
          <button
            key={a.assignment_id}
            onClick={goTo}
            className="w-full flex items-start gap-2.5 text-left p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {a.is_completed ? (
              <CheckCircle2 className="w-4.5 h-4.5 text-green-500 flex-shrink-0 mt-0.5" />
            ) : a.is_overdue ? (
              <AlertCircle className="w-4.5 h-4.5 text-red-500 flex-shrink-0 mt-0.5" />
            ) : (
              <Circle className="w-4.5 h-4.5 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium leading-tight ${a.is_completed ? "text-gray-400 line-through" : "text-gray-800 dark:text-gray-200"}`}>
                {a.title}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {[a.subject_name, a.entity_title].filter(Boolean).join(" · ")}
                {a.due_at && !a.is_completed && (
                  <span className={a.is_overdue ? "text-red-500 font-semibold" : ""}> · Due {fmtDue(a.due_at)}</span>
                )}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
