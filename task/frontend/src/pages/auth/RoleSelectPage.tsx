import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { useAppSelector, useAppDispatch } from "@/store";
import { setUser } from "@/store/auth";
import { GraduationCap, Users } from "lucide-react";
import { Alert } from "@/components/ui";

/**
 * One-time role choice for a brand-new phone-OTP account (role=pending until
 * this runs). Redirect target for ProfileGuard when the logged-in user's
 * role is still "pending" — see ProfileGuard.tsx. Calls PATCH /auth/role
 * exactly once; the backend locks it permanently after that (403 on retry),
 * so this page is unreachable again once a real role is set.
 */
export default function RoleSelectPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [loading, setLoading] = useState<"student" | "parent" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(role: "student" | "parent") {
    if (loading) return;
    setError(null);
    setLoading(role);
    try {
      await authApi.setRole(role);
      if (user) dispatch(setUser({ ...user, role }));
      navigate("/profile-complete", { replace: true });
    } catch (err) {
      setError(parseApiError(err));
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">How will you use EduAI?</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Choose one — this can't be changed later.
          </p>
        </div>

        {error && <Alert variant="danger" className="mb-5">{error}</Alert>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => choose("student")}
            disabled={loading !== null}
            className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-primary-400 dark:hover:border-primary-500 transition-colors disabled:opacity-60 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">I'm a Student</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Learn, practice, and track my own progress</p>
            </div>
            {loading === "student" && <span className="text-xs text-primary-600 dark:text-primary-400">Setting up…</span>}
          </button>

          <button
            type="button"
            onClick={() => choose("parent")}
            disabled={loading !== null}
            className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-primary-400 dark:hover:border-primary-500 transition-colors disabled:opacity-60 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
              <Users className="w-7 h-7 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">I'm a Parent</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Monitor and support my child's learning</p>
            </div>
            {loading === "parent" && <span className="text-xs text-primary-600 dark:text-primary-400">Setting up…</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
