import { Navigate } from "react-router-dom";

// Email/password login (and reset-password with it) is disabled for
// students/parents — the backend route is commented out too (see
// auth_service/app/routes/auth.py). Kept as a redirect, not deleted,
// so old links/bookmarks still resolve somewhere sensible.
export default function ResetPasswordPage() {
  return <Navigate to="/login" replace />;
}
