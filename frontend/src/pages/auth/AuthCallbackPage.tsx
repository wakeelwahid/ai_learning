import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "@/lib/api";
import { useAppDispatch } from "@/store";
import { setTokens, setUser } from "@/store/auth";
import { Loader } from "lucide-react";

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  useEffect(() => {
    const code = searchParams.get("code");

    if (!code) {
      navigate("/login", { state: { message: "Social login failed. Please try again." } });
      return;
    }

    (async () => {
      try {
        // The callback redirect carries only a one-time exchange code, never
        // the real tokens — redeem it here over a POST body instead of ever
        // reading credentials out of the URL.
        const { data: tokens } = await authApi.oauthExchange(code);
        dispatch(setTokens({ access: tokens.access_token, refresh: tokens.refresh_token }));
        const { data } = await authApi.me();
        const userData = { ...data, role: (data.role as string).toLowerCase() };
        dispatch(setUser(userData));
        const dest = userData.role === "parent" ? "/parent/dashboard" : "/dashboard";
        navigate(dest);
      } catch {
        navigate("/login", { state: { message: "Social login failed. Please try again." } });
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <Loader className="w-8 h-8 animate-spin text-primary-600 dark:text-primary-400 mx-auto mb-4" />
        <p className="text-sm text-gray-600 dark:text-gray-400">Signing you in…</p>
      </div>
    </div>
  );
}
