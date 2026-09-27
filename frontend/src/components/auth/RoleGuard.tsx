import { Navigate } from "react-router-dom";
import { useAppSelector } from "@/store";

/**
 * Three-layer guard:
 *   1. JWT presence  → /login if no token
 *   2. Role check    → /403 if role not in allowedRoles
 *   3. Ownership     → enforced by individual route components / API
 */

const ROLE_GROUPS = {
  student: ["student", "admin", "super_admin"],
  parent:  ["parent",  "admin",  "super_admin"],
  teacher: ["teacher", "admin", "super_admin"],
  any:     ["student", "teacher", "parent", "admin", "super_admin"],
} as const;

type RoleGroup = keyof typeof ROLE_GROUPS;

interface RoleGuardProps {
  allow: RoleGroup;
  children: React.ReactNode;
}

export default function RoleGuard({ allow, children }: RoleGuardProps) {
  const token = useAppSelector(s => s.auth.token);
  const role  = useAppSelector(s => s.auth.user?.role?.toLowerCase() ?? "");

  if (!token) return <Navigate to="/login" replace />;
  if (!(ROLE_GROUPS[allow] as readonly string[]).includes(role)) {
    return <Navigate to="/403" replace />;
  }
  return <>{children}</>;
}
