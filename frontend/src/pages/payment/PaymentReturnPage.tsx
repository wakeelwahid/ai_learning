import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppSelector } from "@/store";
import { Loader } from "lucide-react";

// Cashfree redirects here after checkout completes — used as a fallback for
// payment methods that require a full-page redirect even when checkout was
// opened as a modal (SubscriptionPage/ParentDashboardPage), and as the
// primary landing point for the mobile app's in-WebView checkout (which
// watches for navigation to this route to know the flow is done).
//
// This page does NOT itself verify or activate anything — /verify (called
// from the page the user started checkout on, or by the mobile app after it
// detects this URL) is the single source of truth for payment status. This
// page only bounces the user back to where they can see the result.
export default function PaymentReturnPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);

  useEffect(() => {
    const orderId = searchParams.get("order_id");
    const dest = user?.role === "parent" ? "/parent/dashboard" : "/subscription";
    const t = setTimeout(() => {
      navigate(orderId ? `${dest}?order_id=${orderId}` : dest, { replace: true });
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <Loader className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
        <p className="text-sm text-gray-600 dark:text-gray-400">Finishing up your payment…</p>
      </div>
    </div>
  );
}
