import { useQuery, useQueryClient } from "@tanstack/react-query";
import { paymentApi, parentApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatDateTime } from "@/lib/dates";
import { useAppSelector } from "@/store";
import { Check, Download, Gift, Zap, Crown, Star, ShieldCheck } from "lucide-react";
import BackButton from "@/components/ui/BackButton";
import { Button, Card, Input, Alert } from "@/components/ui";
import StatusChip from "@/components/parent/StatusChip";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useState } from "react";
import { openCashfreeCheckout } from "@/lib/cashfree";
import PaymentMethodSheet from "@/components/payment/PaymentMethodSheet";

interface ApprovalRequest {
  id: string;
  kind: string;
  reference: string;
  title: string;
  amount: number | null;
  status: "pending" | "approved" | "rejected" | "consumed";
  note: string | null;
  created_at: string;
  decided_at: string | null;
}

function isParentApprovalError(err: unknown): boolean {
  const e = err as { response?: { status?: number; data?: { detail?: unknown } } } | null;
  const detail = e?.response?.data?.detail;
  return e?.response?.status === 403 && typeof detail === "string" && detail.startsWith("Parent approval required");
}

// A re-verify of an already-paid order is benign (the backend treats a paid
// order as terminal and won't double-charge or double-extend). It comes back
// as 409 "already processed" — show it as success, not a scary failure.
function isAlreadyProcessed(err: unknown): boolean {
  const e = err as { response?: { status?: number } } | null;
  return e?.response?.status === 409;
}

interface Plan {
  plan_key: string;
  name: string;
  price: number;
  currency: string;
  duration_days: number;
  badge: string | null;
  description: string | null;
  features: string[];
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
}

const FREE_FEATURES = [
  "3 AI Study Chat queries / day", "5 video lessons / day", "3 quiz attempts / day",
  "XP & streak system", "Leaderboard access",
];

function planIcon(plan: Plan) {
  if (plan.is_popular) return Crown;
  if (plan.badge) return Star;
  return Zap;
}

function planAccentClass(plan: Plan) {
  if (plan.is_popular) return "border-primary-400 ring-2 ring-primary-400";
  if (plan.badge) return "border-primary-300 ring-1 ring-primary-300";
  return "border-gray-200 dark:border-gray-700";
}

function planBtnVariant(plan: Plan): "primary" | "secondary" {
  if (plan.is_popular) return "primary";
  if (plan.badge) return "primary";
  return "secondary";
}

function periodLabel(days: number) {
  if (days % 365 === 0 && days / 365 >= 1) return days === 365 ? "/ year" : `/ ${days / 365} years`;
  if (days % 30 === 0 && days / 30 > 1) return `/ ${days / 30} months`;
  if (days === 30) return "/ month";
  return `/ ${days} days`;
}

export default function SubscriptionPage() {
  const { t } = useLanguage();
  const user = useAppSelector((s) => s.auth.user);
  const qc = useQueryClient();
  const isStudent = user?.role?.toLowerCase() === "student";

  const [approvalNeededPlan, setApprovalNeededPlan] = useState<string | null>(null);
  const [requestingPlan, setRequestingPlan] = useState<string | null>(null);

  const { data: approvalRequests = [] } = useQuery({
    queryKey: ["my-approval-requests", user?.id],
    queryFn: () => parentApi.myApprovalRequests().then((r) => (r.data ?? []) as ApprovalRequest[]),
    enabled: !!user?.id && isStudent,
    refetchInterval: 60_000,
    retry: 0,
  });
  const requestFor = (planKey: string, status: ApprovalRequest["status"]) =>
    approvalRequests.find((r) => r.kind === "purchase" && r.reference === planKey && r.status === status);

  const requestApproval = async (plan: Plan) => {
    setRequestingPlan(plan.plan_key);
    try {
      await parentApi.createApprovalRequest({ kind: "purchase", reference: plan.plan_key, title: plan.name, amount: plan.price });
      toast.success(t("parentApprovalRequestSent"));
      qc.invalidateQueries({ queryKey: ["my-approval-requests"] });
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setRequestingPlan(null);
    }
  };

  const [couponCode, setCouponCode]     = useState("");
  const [couponResult, setCouponResult] = useState<{ valid: boolean; discount: number; finalPrice: number; message: string } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [activeCouponPlan, setActiveCouponPlan] = useState<string | null>(null);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
  const [payingPlan, setPayingPlan] = useState<string | null>(null);
  const [methodSheetOrder, setMethodSheetOrder] = useState<{ plan: Plan; orderId: string; paymentId: string; couponCode?: string } | null>(null);

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["plans"],
    queryFn: () => paymentApi.plans().then((r) => r.data),
  });

  const { data: subscription, refetch: refetchSub } = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: () => paymentApi.getSubscription(user!.id).then((r) => r.data),
    enabled: !!user?.id,
    retry: 0,
  });

  // Only relevant when the student has no subscription of their own — a
  // linked parent's active premium subscription covers them too.
  const { data: effective } = useQuery({
    queryKey: ["subscription-effective", user?.id],
    queryFn: () => paymentApi.getEffectiveSubscription(user!.id).then((r) => r.data),
    enabled: !!user?.id && subscription?.status !== "active",
    retry: 0,
  });
  const inheritedFromParent = effective?.has_own_subscription === false ? effective?.inherited_from_parent : null;
  const inheritedExpiresAt = effective?.expires_at ? new Date(effective.expires_at) : null;

  const isActive  = subscription?.status === "active";
  const planId    = subscription?.plan ?? "free";
  const expiresAt = subscription?.expires_at ? new Date(subscription.expires_at) : null;
  const startsAt  = subscription?.starts_at  ? new Date(subscription.starts_at)  : null;
  const deactivatedAt = subscription?.deactivated_at ? new Date(subscription.deactivated_at) : null;

  const applyCoupon = async (plan: string) => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setActiveCouponPlan(plan);
    try {
      const { data } = await paymentApi.validateCoupon(couponCode, plan);
      setCouponResult(data);
      if (data.valid) toast.success(`Coupon applied! Save ₹${(data.discount_amount / 100).toFixed(0)}`);
      else toast.error(data.message);
    } catch { toast.error("Could not validate coupon"); }
    finally { setCouponLoading(false); }
  };

  const handleSubscribe = async (plan: Plan) => {
    const appliedCoupon = couponResult?.valid && activeCouponPlan === plan.plan_key ? couponCode : undefined;
    setPayingPlan(plan.plan_key);
    let createdPaymentId: string | undefined;
    try {
      const { data } = await paymentApi.createOrder(user!.id, plan.plan_key, appliedCoupon);
      createdPaymentId = data.payment_id;

      if (data.key === "test_mode") {
        // No real Cashfree account configured — show the same "choose a
        // payment method" step Cashfree's own hosted checkout would render,
        // using a fake session id doesn't work against the real SDK.
        setMethodSheetOrder({ plan, orderId: data.order_id, paymentId: data.payment_id, couponCode: appliedCoupon });
        return;
      }

      await openCashfreeCheckout(data.payment_session_id, data.key);

      // Cashfree's client-side checkout result is never treated as
      // authoritative — always re-verify against the server, which
      // re-fetches the order's true status directly from Cashfree.
      const { data: verifyData } = await paymentApi.verifyPayment({
        order_id: data.order_id,
        user_id: user!.id,
        plan: plan.plan_key,
        coupon_code: appliedCoupon ?? null,
      });
      setLastPaymentId(data.payment_id);
      const carryOver: number = verifyData?.carry_over_days ?? 0;
      const expiresStr = verifyData?.expires_at
        ? new Date(verifyData.expires_at).toLocaleDateString("en-IN", { dateStyle: "medium" })
        : "";
      toast.success(
        carryOver > 0
          ? `Plan activated! +${carryOver} carry-over day${carryOver !== 1 ? "s" : ""} added.\nExpires: ${expiresStr}`
          : `Subscription activated!${expiresStr ? ` Expires ${expiresStr}` : ""}`,
        { duration: 6000 }
      );
      refetchSub();
      qc.invalidateQueries({ queryKey: ["my-approval-requests"] });
    } catch (err) {
      if (isParentApprovalError(err)) {
        setApprovalNeededPlan(plan.plan_key);
        qc.invalidateQueries({ queryKey: ["my-approval-requests"] });
        return;
      }
      if (isAlreadyProcessed(err)) {
        toast.success("This payment was already processed — your subscription is active.");
        refetchSub();
        return;
      }
      const retry = createdPaymentId
        ? () => retryFailedPayment(createdPaymentId!, plan)
        : () => handleSubscribe(plan);
      toast.error(
        <span>
          Payment failed or was cancelled.{" "}
          <button className="underline font-semibold" onClick={retry}>Retry</button>
        </span>
      );
    } finally {
      setPayingPlan(null);
    }
  };

  const retryFailedPayment = async (paymentId: string, plan: Plan) => {
    setPayingPlan(plan.plan_key);
    try {
      const { data } = await paymentApi.retryPayment(paymentId, user!.id);

      if (data.key === "test_mode") {
        setMethodSheetOrder({ plan, orderId: data.order_id, paymentId: data.payment_id });
        return;
      }

      await openCashfreeCheckout(data.payment_session_id, data.key);
      const { data: verifyData } = await paymentApi.verifyPayment({
        order_id: data.order_id,
        user_id: user!.id,
        plan: plan.plan_key,
      });
      setLastPaymentId(data.payment_id);
      const carryOver: number = verifyData?.carry_over_days ?? 0;
      const expiresStr = verifyData?.expires_at
        ? new Date(verifyData.expires_at).toLocaleDateString("en-IN", { dateStyle: "medium" })
        : "";
      toast.success(
        carryOver > 0
          ? `Plan activated! +${carryOver} carry-over day${carryOver !== 1 ? "s" : ""} added.\nExpires: ${expiresStr}`
          : `Subscription activated!${expiresStr ? ` Expires ${expiresStr}` : ""}`,
        { duration: 6000 }
      );
      refetchSub();
    } catch (err) {
      if (isAlreadyProcessed(err)) {
        toast.success("This payment was already processed — your subscription is active.");
        refetchSub();
        return;
      }
      toast.error(
        <span>
          Retry failed too.{" "}
          <button className="underline font-semibold" onClick={() => retryFailedPayment(paymentId, plan)}>Retry again</button>
        </span>
      );
    } finally {
      setPayingPlan(null);
    }
  };

  const handleMethodSelected = async (method: string) => {
    const order = methodSheetOrder;
    setMethodSheetOrder(null);
    if (!order) return;
    try {
      const { data: verifyData } = await paymentApi.verifyPayment({
        order_id: order.orderId,
        user_id: user!.id,
        plan: order.plan.plan_key,
        coupon_code: order.couponCode ?? null,
      });
      setLastPaymentId(order.paymentId);
      const expiresStr = verifyData?.expires_at
        ? new Date(verifyData.expires_at).toLocaleDateString("en-IN", { dateStyle: "medium" })
        : "";
      toast.success(`Paid via ${method}! ${order.plan.name} plan activated. (test mode)${expiresStr ? ` Expires ${expiresStr}` : ""}`);
      refetchSub();
    } catch (err) {
      if (isAlreadyProcessed(err)) {
        toast.success("This payment was already processed — your subscription is active.");
        refetchSub();
        return;
      }
      toast.error("Payment verification failed. Please try again.");
    }
  };

  const [cancelling, setCancelling] = useState(false);
  const isCancelledButActive = isActive && !!subscription?.deactivated_at;

  const handleCancelSubscription = async () => {
    if (!user?.id) return;
    setCancelling(true);
    try {
      await paymentApi.cancelSubscription(user.id);
      toast.success("Subscription cancelled. You'll keep access until it expires.");
      refetchSub();
    } catch {
      toast.error("Could not cancel right now. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { dateStyle: "medium" });

  return (
    <div className="w-full space-y-8 animate-fade-in">
      <BackButton label="Back" />

      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("choosePlan")}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2 text-base">Every plan unlocks all features — choose your duration</p>
      </div>

      {/* Family-inherited premium banner — the student has no subscription
          of their own, but a linked parent's active plan covers them */}
      {!isActive && inheritedFromParent && (
        <Alert variant="success" title="Premium unlocked via your parent's subscription" className="max-w-3xl mx-auto">
          <div className="space-y-0.5">
            <p>Your parent's premium subscription covers your account — all features are unlocked.</p>
            {inheritedExpiresAt && <p>Covered until: <span className="font-medium">{fmt(inheritedExpiresAt)}</span></p>}
          </div>
        </Alert>
      )}

      {/* Active subscription banner */}
      {isActive && !isCancelledButActive && (
        <Alert variant="success" title="Active subscription — all features unlocked" className="max-w-3xl mx-auto">
          <div className="space-y-0.5">
            {startsAt  && <p>Subscribed: <span className="font-medium">{fmt(startsAt)}</span></p>}
            {expiresAt && <p>Expires: <span className="font-medium">{fmt(expiresAt)}</span></p>}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={handleCancelSubscription}
            disabled={cancelling}
          >
            {cancelling ? "Cancelling…" : "Cancel subscription"}
          </Button>
        </Alert>
      )}
      {isCancelledButActive && (
        <Alert variant="warning" title="Subscription cancelled" className="max-w-3xl mx-auto">
          <div className="space-y-0.5">
            {expiresAt && <p>You'll keep access until <span className="font-medium">{fmt(expiresAt)}</span>.</p>}
          </div>
        </Alert>
      )}
      {!isActive && deactivatedAt && (
        <Alert variant="warning" className="max-w-3xl mx-auto">
          Your previous plan was deactivated on <span className="font-medium">{fmt(deactivatedAt)}</span>. Subscribe again to restore access.
        </Alert>
      )}

      {/* Plans grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start max-w-6xl mx-auto">
        {/* Free tier — always shown first, not part of the admin-managed plan list */}
        <Card className="border-2 border-gray-200 dark:border-gray-700 relative flex flex-col">
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="w-5 h-5 text-success-500" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Free</h3>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-gray-900 dark:text-white">₹0</span>
              <span className="text-gray-500 dark:text-gray-400 text-sm">forever</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try EduLearn — no card needed</p>
          </div>
          <ul className="flex-1 space-y-2 mb-5">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <span className="text-gray-500 dark:text-gray-400">{f}</span>
              </li>
            ))}
          </ul>
          <div className={`text-center text-sm font-semibold py-2 rounded-lg ${!isActive ? "bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"}`}>
            {!isActive ? "✓ Your current plan" : "No subscription needed"}
          </div>
        </Card>

        {plans.map((plan) => {
          const Icon = planIcon(plan);
          const isCurrent = isActive && planId === plan.plan_key;
          const isPaying = payingPlan === plan.plan_key;
          const approvedReq = requestFor(plan.plan_key, "approved");
          const pendingReq = requestFor(plan.plan_key, "pending");
          const needsApproval = approvalNeededPlan === plan.plan_key && !approvedReq;

          return (
            <Card key={plan.plan_key} className={`border-2 relative flex flex-col ${planAccentClass(plan)}`}>
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  {plan.badge}
                </span>
              )}
              {isCurrent && (
                <span className="absolute -top-3 right-4 bg-success-500 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  Active
                </span>
              )}

              {/* Price */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-5 h-5 ${plan.is_popular || plan.badge ? "text-primary-600 dark:text-primary-400" : "text-gray-500 dark:text-gray-400"}`} />
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">₹{plan.price}</span>
                  <span className="text-gray-500 dark:text-gray-400 text-sm">{periodLabel(plan.duration_days)}</span>
                </div>
                {plan.description && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{plan.description}</p>
                )}
              </div>

              {/* Features */}
              <ul className="flex-1 space-y-2 mb-5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-success-500 shrink-0 mt-0.5" />
                    <span className="text-gray-700 dark:text-gray-300">{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="space-y-3">
                {/* Coupon */}
                <div className="flex gap-2">
                  <Input
                    className="flex-1 text-sm"
                    placeholder="Promo code"
                    value={activeCouponPlan === plan.plan_key ? couponCode : ""}
                    onChange={e => { setCouponCode(e.target.value.toUpperCase()); setActiveCouponPlan(plan.plan_key); setCouponResult(null); }}
                  />
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => applyCoupon(plan.plan_key)}
                    disabled={couponLoading}
                  >
                    Apply
                  </Button>
                </div>
                {couponResult?.valid && activeCouponPlan === plan.plan_key && (
                  <div className="flex items-center justify-between gap-2 flex-wrap bg-success-50 dark:bg-success-900/20 border border-success-100 dark:border-success-900/40 rounded-lg px-3 py-2 text-sm">
                    <span className="text-success-700 dark:text-success-400 font-medium">Discount applied!</span>
                    <span className="text-success-700 dark:text-success-400 font-semibold">₹{(couponResult.finalPrice / 100).toFixed(0)}</span>
                  </div>
                )}
                {needsApproval && (
                  <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-100 dark:border-warning-800 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-semibold text-warning-700 dark:text-warning-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 flex-shrink-0" /> {t("parentApprovalNeededTitle")}
                    </p>
                    <p className="text-xs text-warning-700/80 dark:text-warning-300/80">{t("parentApprovalNeededDesc")}</p>
                    {pendingReq ? (
                      <p className="text-xs font-medium text-warning-700 dark:text-warning-300">{t("parentApprovalWaiting")}</p>
                    ) : (
                      <Button
                        size="sm"
                        fullWidth
                        onClick={() => requestApproval(plan)}
                        disabled={requestingPlan === plan.plan_key}
                        isLoading={requestingPlan === plan.plan_key}
                      >
                        {t("parentRequestApproval")}
                      </Button>
                    )}
                  </div>
                )}
                {approvedReq && !isCurrent && (
                  <div className="flex items-center gap-1.5 bg-success-50 dark:bg-success-900/20 border border-success-100 dark:border-success-900/40 rounded-lg px-3 py-2 text-sm font-medium text-success-700 dark:text-success-400">
                    <Check className="w-4 h-4 flex-shrink-0" /> {t("parentApprovedBuyNow")}
                  </div>
                )}
                <Button
                  variant={planBtnVariant(plan)}
                  fullWidth
                  onClick={() => handleSubscribe(plan)}
                  disabled={isCurrent || isPaying || needsApproval}
                >
                  {isCurrent ? "✓ Current Plan" : isPaying ? "Processing…" : t("getStarted")}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {isStudent && approvalRequests.length > 0 && (
        <Card className="max-w-3xl mx-auto">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary-500" /> {t("parentMyApprovalRequests")}
          </h3>
          <div className="space-y-2">
            {approvalRequests.map((r) => (
              <div key={r.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                    {r.title}{r.amount !== null ? ` · ₹${r.amount}` : ""}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{formatDateTime(r.created_at)}</p>
                  {r.status === "rejected" && r.note && (
                    <p className="text-xs text-danger-600 dark:text-danger-400 break-words">{r.note}</p>
                  )}
                </div>
                <StatusChip status={r.status} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Receipt download */}
      {lastPaymentId && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 max-w-3xl mx-auto bg-info-50 dark:bg-info-900/20 border border-info-100 dark:border-info-900/40 rounded-xl p-4">
          <span className="text-info-700 dark:text-info-400 font-medium text-sm">Payment successful! Download your receipt.</span>
          <a href={`/api/v1/payments/${lastPaymentId}/receipt`} target="_blank" rel="noreferrer"
            className="btn-secondary text-sm flex items-center gap-2 shrink-0">
            <Download className="w-4 h-4" /> Receipt
          </a>
        </div>
      )}

      {/* Policy note */}
      <div className="max-w-5xl mx-auto border-t border-gray-100 dark:border-gray-800 pt-6 space-y-1 text-xs text-gray-400 dark:text-gray-500">
        <p className="font-medium text-gray-500 dark:text-gray-400">Cancellation &amp; Refund Policy</p>
        <p>
          Cancel anytime from Profile → Subscription. Access continues until the end of the billing period.
          Refunds eligible within 7 days of purchase if content hasn't been substantially used.{" "}
          <a href="/refund-policy" className="text-primary-600 dark:text-primary-400 underline">View full policy</a>.
        </p>
      </div>
      <p className="text-center text-xs text-gray-400 dark:text-gray-500">Payments secured by Cashfree · GST included · Cancel anytime</p>

      <PaymentMethodSheet
        visible={!!methodSheetOrder}
        amountLabel={methodSheetOrder ? `₹${methodSheetOrder.plan.price}` : ""}
        planName={methodSheetOrder?.plan.name ?? ""}
        onSelect={handleMethodSelected}
        onCancel={() => setMethodSheetOrder(null)}
      />
    </div>
  );
}
