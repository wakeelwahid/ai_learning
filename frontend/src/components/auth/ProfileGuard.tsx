import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAppSelector, useAppDispatch } from "@/store";
import { setProfileComplete } from "@/store/auth";
import { authApi } from "@/lib/api";

/**
 * Fourth guard layer, sitting inside PrivateRoute (token) and outside
 * RoleGuard (role) in the route tree: verifies profile completeness against
 * the REAL backend (GET /auth/profile-status) once per mount of the
 * protected route tree — i.e. on every fresh page load / direct URL
 * navigation / browser refresh, since PrivateRoute><ProfileGuard> wraps the
 * entire protected tree as a single persistent element that does NOT
 * remount on internal `<Link>` navigation (React Router keeps it mounted
 * across nested-route changes). This is what makes the gate un-bypassable
 * via a direct URL: typing any protected path re-triggers this check before
 * that route's own element ever renders, without re-querying on every click.
 *
 * ProfileCompletionPage itself is rendered outside this guard in App.tsx so
 * a user who fails the check has somewhere to go.
 */
export default function ProfileGuard({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const role  = useAppSelector((s) => s.auth.user?.role?.toLowerCase());
  const isPending = role === "pending";
  const [status, setStatus] = useState<"checking" | "complete" | "incomplete">("checking");

  useEffect(() => {
    let cancelled = false;
    // A brand-new phone-OTP account starts as role=pending until the user
    // picks Student/Parent on /role-select — skip profile-status entirely
    // for it, since a pending user can never have a real profile yet
    // (ProfileCompletionPage's board/class-vs-parent-fields branch depends
    // on the role already being real).
    if (!token || isPending) return;
    authApi.profileStatus()
      .then((r) => {
        if (cancelled) return;
        const complete = !!r.data?.profile_complete;
        dispatch(setProfileComplete(complete));
        setStatus(complete ? "complete" : "incomplete");
      })
      .catch(() => {
        // Fail open on a transient error (not the same as "incomplete") —
        // PrivateRoute already trusts the JWT alone for the token layer, so
        // an outage here shouldn't lock a fully-set-up user out entirely.
        if (!cancelled) setStatus("complete");
      });
    return () => { cancelled = true; };
  }, [token, isPending, dispatch]);

  if (isPending) return <Navigate to="/role-select" replace />;
  if (status === "checking") return null; // Layout's own suspense fallback covers the flash
  if (status === "incomplete") return <Navigate to="/profile-complete" replace />;
  return <>{children}</>;
}
