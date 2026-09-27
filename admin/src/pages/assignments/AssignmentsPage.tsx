import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { contentApi, authApi } from "@/lib/api";
import { ClipboardList, Plus, Loader, Users2, Calendar, X } from "lucide-react";

interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  entity_type: "chapter" | "exercise";
  entity_id: string;
  due_at: string | null;
  is_active: boolean;
  created_at: string;
  student_count: number;
}

interface StudentUser {
  id: string;
  email: string | null;
  full_name?: string;
  phone?: string | null;
  role: string;
  is_active: boolean;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function CreateAssignmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [selBoard, setSelBoard] = useState<any>(null);
  const [selClass, setSelClass] = useState<any>(null);
  const [selSubject, setSelSubject] = useState<any>(null);
  const [selChapter, setSelChapter] = useState<any>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState("");

  const { data: boards = [] } = useQuery({ queryKey: ["a-boards"], queryFn: () => contentApi.boards().then((r) => r.data) });
  const { data: classes = [] } = useQuery({
    queryKey: ["a-classes", selBoard?.id],
    queryFn: () => contentApi.classes(selBoard.id).then((r) => r.data),
    enabled: !!selBoard,
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["a-subjects", selClass?.id],
    queryFn: () => contentApi.subjects(selClass.id).then((r) => r.data),
    enabled: !!selClass,
  });
  const { data: chapters = [] } = useQuery({
    queryKey: ["a-chapters", selSubject?.id],
    queryFn: () => contentApi.chapters(selSubject.id).then((r) => r.data),
    enabled: !!selSubject,
  });
  const { data: students = [], isLoading: studentsLoading } = useQuery<StudentUser[]>({
    queryKey: ["a-students"],
    queryFn: () => authApi.getUsers({ role: "student", is_active: true }).then((r) => r.data),
  });

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      (s.full_name ?? "").toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q) ||
      (s.phone ?? "").toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  const createMutation = useMutation({
    mutationFn: () =>
      contentApi.createAssignment({
        title: title.trim(),
        description: description.trim() || undefined,
        entity_type: "chapter",
        entity_id: selChapter.id,
        student_ids: Array.from(selectedStudentIds),
        due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      toast.success("Assignment created");
      onCreated();
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Failed to create assignment"),
  });

  const canSubmit = title.trim().length > 0 && !!selChapter && selectedStudentIds.size > 0;

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">New Assignment</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Complete Light chapter" />
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any instructions for the student" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Board</label>
              <select className="input" value={selBoard?.id ?? ""} onChange={(e) => { setSelBoard(boards.find((b: any) => b.id === e.target.value)); setSelClass(null); setSelSubject(null); setSelChapter(null); }}>
                <option value="">Select board</option>
                {boards.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Class</label>
              <select className="input" value={selClass?.id ?? ""} disabled={!selBoard} onChange={(e) => { setSelClass(classes.find((c: any) => c.id === e.target.value)); setSelSubject(null); setSelChapter(null); }}>
                <option value="">Select class</option>
                {classes.map((c: any) => <option key={c.id} value={c.id}>Class {c.number}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Subject</label>
              <select className="input" value={selSubject?.id ?? ""} disabled={!selClass} onChange={(e) => { setSelSubject(subjects.find((s: any) => s.id === e.target.value)); setSelChapter(null); }}>
                <option value="">Select subject</option>
                {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Chapter</label>
              <select className="input" value={selChapter?.id ?? ""} disabled={!selSubject} onChange={(e) => setSelChapter(chapters.find((c: any) => c.id === e.target.value))}>
                <option value="">Select chapter</option>
                {chapters.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" /> Due date (optional)
            </label>
            <input type="date" className="input" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <Users2 className="w-3.5 h-3.5 text-gray-400" /> Students <span className="text-gray-400 dark:text-gray-500">({selectedStudentIds.size} selected)</span>
            </label>
            <input className="input mb-2" placeholder="Search students…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
              {studentsLoading ? (
                <div className="p-4 flex justify-center"><Loader className="w-4 h-4 animate-spin text-gray-400" /></div>
              ) : filteredStudents.length === 0 ? (
                <p className="p-4 text-sm text-gray-400 dark:text-gray-500 text-center">No students found</p>
              ) : (
                filteredStudents.map((s) => (
                  <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/60 cursor-pointer">
                    <input type="checkbox" checked={selectedStudentIds.has(s.id)} onChange={() => toggleStudent(s.id)} className="checkbox" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{s.full_name || s.email || s.phone || "Unnamed student"}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            className="btn-primary btn-sm"
          >
            {createMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : "Create Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssignmentsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: assignments = [], isLoading } = useQuery<AssignmentRow[]>({
    queryKey: ["admin-assignments"],
    queryFn: () => contentApi.listAssignments().then((r) => r.data),
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary-600" /> Assignments
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Assign chapters to students and track real completion.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary self-start sm:self-auto">
          <Plus className="w-4 h-4" /> New Assignment
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-16 card">
          <ClipboardList className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No assignments yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Create one to assign a chapter to your students.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="table-th">Title</th>
                  <th className="table-th">Students</th>
                  <th className="table-th">Due</th>
                  <th className="table-th">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {assignments.map((a) => (
                  <tr key={a.id} className="table-row-hover">
                    <td className="table-td">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{a.title}</p>
                      {a.description && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">{a.description}</p>}
                    </td>
                    <td className="table-td">{a.student_count}</td>
                    <td className="table-td">{fmtDate(a.due_at)}</td>
                    <td className="table-td text-gray-400 dark:text-gray-500 text-xs">{fmtDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateAssignmentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ["admin-assignments"] })}
        />
      )}
    </div>
  );
}
