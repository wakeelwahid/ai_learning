import { useNavigate } from "react-router-dom";
import { useAppSelector } from "@/store";
import { ShieldOff, Home } from "lucide-react";
import Button from "@/components/ui/Button";

export default function ForbiddenPage() {
  const navigate  = useNavigate();
  const role      = useAppSelector(s => s.auth.user?.role?.toLowerCase() ?? "");
  const homePath  = role === "parent" ? "/parent/dashboard" : "/dashboard";

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-32 h-32 bg-danger-50 dark:bg-danger-900/20 rounded-3xl flex items-center justify-center mb-6">
        <ShieldOff className="w-14 h-14 text-danger-500 dark:text-danger-400" />
      </div>
      <span className="text-xs font-semibold text-danger-600 dark:text-danger-400 uppercase tracking-widest mb-2">403 Forbidden</span>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access denied</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-sm">
        Your account role (<strong>{role || "unknown"}</strong>) does not have permission to view this page.
      </p>
      <Button onClick={() => navigate(homePath, { replace: true })}>
        <Home className="w-4 h-4" /> Go to my dashboard
      </Button>
    </div>
  );
}
