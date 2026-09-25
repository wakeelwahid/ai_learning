import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "@/lib/api";
import { useAppDispatch } from "@/store";
import { setTokens, setUser, logout } from "@/store/auth";
import { ShieldCheck, Eye, EyeOff, Loader, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const emailRef    = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [status,  setStatus]  = useState("");

  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const email = emailRef.current?.value?.trim() ?? "";
    const pw    = passwordRef.current?.value ?? "";

    console.log("[ADMIN] submit — email:", email, "pw len:", pw.length);

    if (!email || !pw) {
      setError("Please enter email and password.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      setStatus("Signing in…");
      const { data: loginData } = await authApi.login(email, pw);
      console.log("[ADMIN] login OK — got tokens");

      // Step 2 — store tokens
      dispatch(setTokens({ access: loginData.access_token, refresh: loginData.refresh_token }));

      // Step 3 — fetch user
      setStatus("Loading profile…");
      console.log("[ADMIN] GET /auth/me");
      const { data: me } = await authApi.me();
      console.log("[ADMIN] /me =", JSON.stringify(me));

      const role = (me.role ?? "").toLowerCase();
      if (!["admin", "super_admin"].includes(role)) {
        dispatch(logout());
        setError(`Access denied — role "${me.role}" is not admin.`);
        return;
      }

      dispatch(setUser({ ...me, role: role as "admin" | "super_admin" }));
      console.log("[ADMIN] SUCCESS — navigating to /dashboard");
      navigate("/dashboard", { replace: true });

    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? err?.message ?? "Login failed.";
      console.error("[ADMIN] error:", err?.response?.status, msg, err);
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
          <p className="text-white/40 text-sm mt-1">EdTech Platform — Restricted Access</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-7 shadow-2xl">

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 mb-5 bg-danger-50 border border-danger-100 rounded-xl text-sm text-danger-700 dark:bg-danger-900/20 dark:border-danger-900/40 dark:text-danger-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Admin email</label>
              <input
                ref={emailRef}
                type="email"
                className="input"
                defaultValue=""
                placeholder="admin@edtech.com"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  type={showPw ? "text" : "password"}
                  className="input pr-10"
                  defaultValue=""
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 text-sm font-semibold rounded-xl"
            >
              {loading
                ? <><Loader className="w-4 h-4 animate-spin" /> {status}</>
                : "Sign in to Admin Panel"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-5">
            Protected by JWT · Admin accounts only
          </p>
        </div>
      </div>
    </div>
  );
}
