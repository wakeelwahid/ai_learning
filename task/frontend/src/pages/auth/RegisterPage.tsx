import { Navigate } from "react-router-dom";

// Email/password registration has been removed entirely (no backend
// /register route exists anymore) — signup now happens through the Mobile
// Number + OTP flow on the Login page: verifying an OTP for a number with
// no existing account creates one automatically, then routes to mandatory
// profile completion. This page is kept only so old /register links and
// bookmarks still resolve somewhere sensible.
export default function RegisterPage() {
  return <Navigate to="/login" replace />;
}
