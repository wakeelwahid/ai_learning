import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator, TextInput, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { paymentApi } from "@/api/payment";
import { parentApi, type ApprovalRequest, type ApprovalStatus } from "@/api/parent";
import { errorDetail } from "@/api/errorDetail";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import type { TranslationKey } from "@/i18n/translations";
import { formatDayMonYear } from "@/utils/dates";
import CashfreeCheckout, { CashfreeMode } from "@/components/CashfreeCheckout";
import PaymentMethodSheet from "@/components/PaymentMethodSheet";
import { Badge } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { palette, semantic, radius, spacing, typography } from "@/theme/colors";

const APPROVAL_STATUS_META: Record<ApprovalStatus, { key: TranslationKey; variant: BadgeVariant }> = {
  pending:  { key: "statusPending",  variant: "warning" },
  approved: { key: "statusApproved", variant: "success" },
  rejected: { key: "statusRejected", variant: "danger" },
  consumed: { key: "statusConsumed", variant: "gray" },
};

const PARENT_APPROVAL_PREFIX = "Parent approval required";

// ── Plan data ─────────────────────────────────────────────────────────────────
// The free tier is a client-only pseudo-plan (never purchasable, never
// returned by the backend). Paid plans are fetched live from
// GET /v1/payments/plans — fully admin-managed via Admin → Plans, so no
// plan id/price/feature list is hardcoded here any more.
const FREE_PLAN = {
  id: "free",
  name: "Free",
  price: "₹0",
  period: "/forever",
  color: palette.success600,
  features: [
    "3 AI queries / day", "5 video lessons / day", "3 quiz attempts / day",
    "XP, streaks & leaderboard", "Completion certificates",
  ],
};

interface Plan {
  plan_key: string;
  name: string;
  price: number;
  duration_days: number;
  badge: string | null;
  description: string | null;
  features: string[];
  is_popular: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  onBack: () => void;
}

// A re-verify of an already-paid order returns 409 — it's benign (the backend
// won't double-charge or double-extend), so treat it as success, not failure.
function isAlreadyProcessed(err: any): boolean {
  return err?.response?.status === 409;
}

export default function SubscriptionScreen({ onBack }: Props) {
  const { t } = useLanguage();
  const user = useAppSelector(s => s.auth.user);

  const [subscription,   setSubscription]   = useState<any>(null);
  const [subLoading,     setSubLoading]     = useState(true);
  const [effective,      setEffective]      = useState<any>(null);
  const [plans,          setPlans]          = useState<Plan[]>([]);
  const [orderLoading,   setOrderLoading]   = useState<string | null>(null); // plan_key
  const [couponCode,     setCouponCode]     = useState("");
  const [couponLoading,  setCouponLoading]  = useState(false);
  const [couponResult,   setCouponResult]   = useState<{ valid: boolean; discount_amount: number; final_price: number; message: string } | null>(null);
  const [lastPaymentId,  setLastPaymentId]  = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  // In-app Cashfree checkout (WebView-based — see components/CashfreeCheckout.tsx)
  const [checkoutSession, setCheckoutSession] = useState<{ paymentSessionId: string; mode: CashfreeMode } | null>(null);
  const [checkoutOrderId, setCheckoutOrderId] = useState<string | null>(null);
  const [checkoutPlan,    setCheckoutPlan]    = useState<string | null>(null);
  const [checkoutPaymentId, setCheckoutPaymentId] = useState<string | null>(null);

  // Test-mode "choose a payment method" sheet (see components/PaymentMethodSheet.tsx)
  const [methodSheetOrder, setMethodSheetOrder] = useState<{ planKey: string; orderId: string; paymentId: string } | null>(null);

  // Parental approval gate (F1) — set when a purchase 403s with "Parent approval required…"
  const [approvalNeededPlan, setApprovalNeededPlan] = useState<string | null>(null);
  const [requestingApproval, setRequestingApproval] = useState<string | null>(null);
  const qc = useQueryClient();
  const isStudent = (user?.role ?? "").toLowerCase() === "student";
  const { data: myApprovals = [] } = useQuery<ApprovalRequest[]>({
    queryKey: ["my-approval-requests", user?.id ?? ""],
    queryFn: () => parentApi.myApprovalRequests().then((r) => (Array.isArray(r.data) ? r.data : [])),
    enabled: !!user?.id && isStudent,
    refetchInterval: 60_000,
  });
  const approvalFor = (planKey: string, status: ApprovalStatus) =>
    myApprovals.some((r) => r.kind === "purchase" && r.reference === planKey && r.status === status);

  const requestApproval = async (plan: Plan) => {
    if (requestingApproval) return;
    setRequestingApproval(plan.plan_key);
    try {
      await parentApi.createApprovalRequest({ kind: "purchase", reference: plan.plan_key, title: plan.name, amount: plan.price });
      Toast.show({ type: "success", text1: t("approvalRequestSent"), text2: t("approvalRequestSentBody") });
      qc.invalidateQueries({ queryKey: ["my-approval-requests", user?.id ?? ""] });
    } catch (err: any) {
      Toast.show({ type: "error", text1: t("couldNotRequestApproval"), text2: errorDetail(err, t("pleaseTryAgain")) });
      qc.invalidateQueries({ queryKey: ["my-approval-requests", user?.id ?? ""] });
    } finally {
      setRequestingApproval(null);
    }
  };

  // ── Fetch plans ─────────────────────────────────────────────────────────────
  const fetchPlans = useCallback(async () => {
    try {
      const { data } = await paymentApi.plans();
      setPlans(Array.isArray(data) ? data : []);
    } catch {
      setPlans([]);
    }
  }, []);

  // ── Fetch current subscription ─────────────────────────────────────────────
  const fetchSubscription = useCallback(async () => {
    if (!user?.id) { setSubLoading(false); return; }
    setSubLoading(true);
    try {
      const { data } = await paymentApi.getSubscription(user.id);
      setSubscription(data);
      if (data?.status !== "active") {
        try {
          const { data: eff } = await paymentApi.getEffectiveSubscription(user.id);
          setEffective(eff);
        } catch {
          setEffective(null);
        }
      } else {
        setEffective(null);
      }
    } catch {
      setSubscription(null);
    } finally {
      setSubLoading(false);
    }
  }, [user?.id]);

  // ── Fetch most recent payment (for the receipt-download action) ───────────
  const fetchLastPayment = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await paymentApi.invoices(user.id);
      const latest = Array.isArray(data) && data.length > 0 ? data[0] : null;
      setLastPaymentId(latest?.id ?? null);
    } catch {
      setLastPaymentId(null);
    }
  }, [user?.id]);

  useEffect(() => { fetchPlans(); fetchSubscription(); fetchLastPayment(); }, [fetchPlans, fetchSubscription, fetchLastPayment]);

  // ── Coupon handler ──────────────────────────────────────────────────────────
  const applyCoupon = async (planKey: string) => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const { data } = await paymentApi.validateCoupon(couponCode, planKey);
      setCouponResult(data);
      if (data.valid) {
        Toast.show({
          type:  "success",
          text1: "Coupon applied!",
          text2: `Save ₹${(data.discount_amount / 100).toFixed(0)} — final price ₹${(data.final_price / 100).toFixed(0)}`,
        });
      } else {
        Toast.show({ type: "error", text1: "Invalid coupon", text2: data.message });
      }
    } catch {
      setCouponResult(null);
      Toast.show({ type: "error", text1: "Could not validate coupon", text2: "Please try again." });
    } finally {
      setCouponLoading(false);
    }
  };

  // ── Receipt download handler ───────────────────────────────────────────────
  const handleDownloadReceipt = async () => {
    if (!lastPaymentId) return;
    setReceiptLoading(true);
    try {
      await paymentApi.downloadReceipt(lastPaymentId);
      Toast.show({ type: "success", text1: "Receipt ready", text2: "Your payment receipt was fetched successfully." });
    } catch {
      Toast.show({ type: "error", text1: "Couldn't fetch receipt", text2: "Please try again later." });
    } finally {
      setReceiptLoading(false);
    }
  };

  // ── Subscribe handler ──────────────────────────────────────────────────────
  // Mirrors frontend/src/pages/payment/SubscriptionPage.tsx's handleSubscribe:
  // test_mode -> simulate activation directly; otherwise open the in-app
  // Cashfree checkout (WebView) and verify server-side once it completes.
  const handleSubscribe = async (planKey: string) => {
    if (!user?.id) {
      Toast.show({ type: "error", text1: "Not logged in", text2: "Please log in to subscribe." });
      return;
    }
    setOrderLoading(planKey);
    try {
      const { data } = await paymentApi.createOrder(user.id, planKey);

      if (data.key === "test_mode") {
        // No real Cashfree account configured — show the same "choose a
        // payment method" step Cashfree's own hosted checkout would render.
        setMethodSheetOrder({ planKey, orderId: data.order_id, paymentId: data.payment_id });
        setOrderLoading(null);
        return;
      }

      setCheckoutPlan(planKey);
      setCheckoutOrderId(data.order_id);
      setCheckoutPaymentId(data.payment_id);
      setCheckoutSession({ paymentSessionId: data.payment_session_id, mode: data.key as CashfreeMode });
    } catch (err: any) {
      const detail = errorDetail(err, "");
      if (err?.response?.status === 403 && detail.startsWith(PARENT_APPROVAL_PREFIX)) {
        setApprovalNeededPlan(planKey);
        qc.invalidateQueries({ queryKey: ["my-approval-requests", user?.id ?? ""] });
        Toast.show({ type: "info", text1: t("parentApprovalNeeded"), text2: detail });
      } else {
        Toast.show({ type: "error", text1: t("couldNotStartPayment"), text2: errorDetail(err, t("pleaseTryAgain")) });
      }
    } finally {
      setOrderLoading(null);
    }
  };

  const handleMethodSelected = async (method: string) => {
    const order = methodSheetOrder;
    setMethodSheetOrder(null);
    if (!user?.id || !order) return;
    try {
      await paymentApi.verifyPayment({
        order_id: order.orderId,
        user_id: user.id,
        plan: order.planKey,
      });
      Toast.show({ type: "success", text1: `Paid via ${method}!`, text2: "Plan activated. (test mode)" });
      setLastPaymentId(order.paymentId);
      fetchSubscription();
      fetchLastPayment();
    } catch (err: any) {
      if (isAlreadyProcessed(err)) {
        Toast.show({ type: "success", text1: "Already processed", text2: "Your subscription is active." });
        fetchSubscription();
        return;
      }
      Toast.show({ type: "error", text1: "Payment verification failed", text2: "Please try again." });
    }
  };

  const handleCheckoutComplete = async () => {
    const orderId = checkoutOrderId;
    const planKey = checkoutPlan;
    setCheckoutSession(null);
    setCheckoutOrderId(null);
    setCheckoutPlan(null);
    setCheckoutPaymentId(null);
    if (!user?.id || !orderId || !planKey) return;
    try {
      const { data: verifyData } = await paymentApi.verifyPayment({
        order_id: orderId,
        user_id: user.id,
        plan: planKey,
      });
      const carryOver: number = verifyData?.carry_over_days ?? 0;
      const expiresStr = verifyData?.expires_at
        ? new Date(verifyData.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : "";
      Toast.show({
        type:  "success",
        text1: "Subscription activated!",
        text2: carryOver > 0
          ? `+${carryOver} carry-over day${carryOver !== 1 ? "s" : ""} added.${expiresStr ? ` Expires ${expiresStr}` : ""}`
          : (expiresStr ? `Expires ${expiresStr}` : undefined),
      });
      fetchSubscription();
      fetchLastPayment();
    } catch (err: any) {
      if (isAlreadyProcessed(err)) {
        Toast.show({ type: "success", text1: "Already processed", text2: "Your subscription is active." });
        fetchSubscription();
        return;
      }
      Toast.show({
        type:  "error",
        text1: "Payment received, verification failed",
        text2: "Contact support with your payment ID if this doesn't resolve after a refresh.",
      });
    }
  };

  const handleCheckoutDismiss = () => {
    setCheckoutSession(null);
    setCheckoutOrderId(null);
    setCheckoutPlan(null);
    setCheckoutPaymentId(null);
  };

  const handleCheckoutError = (message: string) => {
    const planKey = checkoutPlan;
    const paymentId = checkoutPaymentId;
    setCheckoutSession(null);
    setCheckoutOrderId(null);
    setCheckoutPlan(null);
    setCheckoutPaymentId(null);
    if (planKey && paymentId) {
      Alert.alert("Payment failed", message, [
        { text: "Cancel", style: "cancel" },
        { text: "Retry", onPress: () => retryFailedPayment(paymentId, planKey) },
      ]);
    } else {
      Toast.show({ type: "error", text1: "Payment failed", text2: message });
    }
  };

  const retryFailedPayment = async (paymentId: string, planKey: string) => {
    if (!user?.id) return;
    setOrderLoading(planKey);
    try {
      const { data } = await paymentApi.retryPayment(paymentId, user.id);

      if (data.key === "test_mode") {
        setMethodSheetOrder({ planKey, orderId: data.order_id, paymentId: data.payment_id });
        return;
      }

      setCheckoutPlan(planKey);
      setCheckoutOrderId(data.order_id);
      setCheckoutPaymentId(data.payment_id);
      setCheckoutSession({ paymentSessionId: data.payment_session_id, mode: data.key as CashfreeMode });
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Retry failed", text2: errorDetail(err, "Please try again.") });
    } finally {
      setOrderLoading(null);
    }
  };

  const currentPlan   = subscription?.plan ?? "free";
  const isActive      = subscription?.status === "active";
  const expiresAt     = subscription?.expires_at
    ? new Date(subscription.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const deactivatedAt = subscription?.deactivated_at
    ? new Date(subscription.deactivated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.primary600 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="diamond" size={22} color="#fff" />
          <Text style={styles.headerTitle}>Upgrade</Text>
        </View>
        <Text style={styles.headerSub}>Unlock your full potential</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>

        {/* Current subscription status */}
        <View style={styles.statusCard}>
          {subLoading ? (
            <ActivityIndicator color={palette.primary600} />
          ) : (
            <>
              <View style={styles.statusLeft}>
                <View style={[styles.statusDot, { backgroundColor: isActive ? palette.success600 : palette.gray400 }]} />
                <View>
                  <Text style={styles.statusLabel}>Current Plan</Text>
                  <Text style={styles.statusPlan}>
                    {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                    {isActive ? " (Active)" : " (Inactive)"}
                  </Text>
                  {expiresAt && (
                    <Text style={styles.statusExpiry}>Renews {expiresAt}</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={fetchSubscription} style={styles.refreshBtn} activeOpacity={0.7}>
                <Ionicons name="refresh-outline" size={16} color={palette.primary600} />
                <Text style={styles.refreshBtnTxt}>Refresh</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Family-inherited premium banner — no subscription of your own,
            but a linked parent's active plan covers this account */}
        {!isActive && !subLoading && effective?.has_own_subscription === false && effective?.inherited_from_parent && (
          <View style={styles.inheritedBanner}>
            <Ionicons name="checkmark-circle" size={18} color={palette.success700} />
            <View style={{ flex: 1 }}>
              <Text style={styles.inheritedTxt}>
                <Text style={styles.inheritedTxtBold}>Premium unlocked</Text> via your parent's subscription — all features are available to you.
                {effective?.expires_at ? ` Covered until ${new Date(effective.expires_at).toLocaleDateString()}.` : ""}
              </Text>
            </View>
          </View>
        )}

        {/* Deactivated subscription banner */}
        {!isActive && !subLoading && deactivatedAt && (
          <View style={styles.deactivatedBanner}>
            <Ionicons name="alert-circle" size={18} color={palette.warning700} />
            <View style={{ flex: 1 }}>
              <Text style={styles.deactivatedTxt}>
                Your plan was deactivated on <Text style={styles.deactivatedTxtBold}>{deactivatedAt}</Text>. Resubscribe below to restore full access.
              </Text>
            </View>
          </View>
        )}

        {/* Plan cards */}
        <Text style={styles.plansTitle}>Choose a plan</Text>

        {/* Free tier — always shown first, not part of the admin-managed plan list */}
        <View style={styles.planCard}>
          <View style={styles.planTop}>
            <View>
              <Text style={[styles.planName, { color: FREE_PLAN.color }]}>{FREE_PLAN.name}</Text>
              <View style={styles.planPriceRow}>
                <Text style={[styles.planPrice, { color: FREE_PLAN.color }]}>{FREE_PLAN.price}</Text>
                <Text style={styles.planPeriod}>{FREE_PLAN.period}</Text>
              </View>
            </View>
            <View style={[styles.planIconWrap, { backgroundColor: FREE_PLAN.color + "15" }]}>
              <Ionicons name="gift-outline" size={28} color={FREE_PLAN.color} />
            </View>
          </View>
          <View style={styles.featureList}>
            {FREE_PLAN.features.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color={FREE_PLAN.color} />
                <Text style={styles.featureTxt}>{f}</Text>
              </View>
            ))}
          </View>
          {currentPlan === "free" || !isActive ? (
            <View style={[styles.currentPlanBtn, { borderColor: palette.gray200 }]}>
              <Ionicons name="gift-outline" size={16} color={palette.success600} />
              <Text style={[styles.currentPlanBtnTxt, { color: palette.gray500 }]}>No sign-up needed</Text>
            </View>
          ) : null}
        </View>

        {plans.map(plan => {
          const isCurrent = currentPlan === plan.plan_key && isActive;
          const isLoading = orderLoading === plan.plan_key;
          // Single brand accent for every plan — "popular" is communicated via
          // the badge + border below, not a different hue (no gradients/second
          // accent color per the design system).
          const color = palette.primary600;

          return (
            <View key={plan.plan_key} style={[styles.planCard, plan.is_popular && styles.planCardPopular]}>
              {plan.is_popular && (
                <View style={styles.popularBadge}>
                  <Ionicons name="star" size={11} color="#fff" />
                  <Text style={styles.popularBadgeTxt}>{plan.badge ?? "Most Popular"}</Text>
                </View>
              )}
              {!plan.is_popular && plan.badge && (
                <View style={[styles.popularBadge, { backgroundColor: palette.primary600 }]}>
                  <Text style={styles.popularBadgeTxt}>{plan.badge}</Text>
                </View>
              )}

              <View style={styles.planTop}>
                <View>
                  <Text style={[styles.planName, { color }]}>{plan.name}</Text>
                  <View style={styles.planPriceRow}>
                    <Text style={[styles.planPrice, { color }]}>₹{plan.price}</Text>
                    <Text style={styles.planPeriod}>/{plan.duration_days}d</Text>
                  </View>
                  {plan.description && <Text style={styles.planDesc}>{plan.description}</Text>}
                </View>
                <View style={[styles.planIconWrap, { backgroundColor: color + "15" }]}>
                  <Ionicons name={plan.is_popular ? "diamond-outline" : "ribbon-outline"} size={28} color={color} />
                </View>
              </View>

              {/* Features */}
              <View style={styles.featureList}>
                {plan.features.map((f, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={16} color={color} />
                    <Text style={styles.featureTxt}>{f}</Text>
                  </View>
                ))}
              </View>

              {/* Coupon code input */}
              {!isCurrent && (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <TextInput
                      style={{ flex: 1, minWidth: "60%", borderWidth: 1, borderColor: palette.gray200, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, backgroundColor: palette.gray50, minHeight: 44 }}
                      placeholder="Promo code"
                      value={couponCode}
                      onChangeText={text => { setCouponCode(text.toUpperCase()); setCouponResult(null); }}
                      autoCapitalize="characters"
                    />
                    <TouchableOpacity
                      onPress={() => applyCoupon(plan.plan_key)}
                      disabled={couponLoading || !couponCode.trim()}
                      style={{ flexGrow: 1, minWidth: 72, minHeight: 44, backgroundColor: palette.primary600, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: "center", justifyContent: "center", opacity: couponLoading || !couponCode.trim() ? 0.6 : 1 }}
                    >
                      {couponLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }} numberOfLines={1} ellipsizeMode="tail">Apply</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {couponResult?.valid && (
                    <View style={styles.couponResultRow}>
                      <Ionicons name="pricetag" size={14} color={semantic.success.text} />
                      <Text style={styles.couponResultTxt}>
                        Save ₹{(couponResult.discount_amount / 100).toFixed(0)} — final price ₹{(couponResult.final_price / 100).toFixed(0)}
                      </Text>
                    </View>
                  )}
                  {couponResult && !couponResult.valid && (
                    <View style={styles.couponErrorRow}>
                      <Ionicons name="close-circle" size={14} color={semantic.danger.text} />
                      <Text style={styles.couponErrorTxt}>{couponResult.message}</Text>
                    </View>
                  )}
                </View>
              )}

              {(() => {
                const approved = approvalFor(plan.plan_key, "approved");
                const pendingApproval = approvalFor(plan.plan_key, "pending");
                const needsApproval = approvalNeededPlan === plan.plan_key && !approved;
                if (isCurrent) {
                  return (
                    <View style={[styles.currentPlanBtn, { borderColor: color }]}>
                      <Ionicons name="checkmark-circle" size={16} color={color} />
                      <Text style={[styles.currentPlanBtnTxt, { color }]}>Current Plan</Text>
                    </View>
                  );
                }
                if (needsApproval) {
                  return (
                    <View style={styles.approvalPanel}>
                      <View style={styles.approvalPanelHead}>
                        <Ionicons name="shield-checkmark-outline" size={18} color={semantic.warning.text} />
                        <Text style={styles.approvalPanelTitle}>{t("parentApprovalNeeded")}</Text>
                      </View>
                      <Text style={styles.approvalPanelBody}>{t("parentApprovalNeededBody")}</Text>
                      {pendingApproval ? (
                        <Badge label={t("approvalPendingChip")} variant="warning" style={{ marginTop: spacing.sm }} />
                      ) : (
                        <TouchableOpacity
                          onPress={() => requestApproval(plan)}
                          disabled={requestingApproval === plan.plan_key}
                          activeOpacity={0.85}
                          style={[styles.subscribeBtn, { backgroundColor: semantic.warning.solid, marginTop: spacing.sm + 2 }]}
                        >
                          {requestingApproval === plan.plan_key ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <>
                              <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                              <Text style={styles.subscribeBtnTxt} numberOfLines={1}>{t("requestApproval")}</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }
                return (
                  <TouchableOpacity
                    onPress={() => handleSubscribe(plan.plan_key)}
                    disabled={isLoading}
                    activeOpacity={0.85}
                    style={[styles.subscribeBtn, { backgroundColor: isLoading ? palette.primary300 : approved ? semantic.success.solid : palette.primary600 }]}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Text style={styles.subscribeBtnTxt} numberOfLines={1}>
                          {approved
                            ? t("approvedBuyNow")
                            : fmt(currentPlan !== "free" ? t("switchTo") : t("subscribeTo"), { plan: plan.name })}
                        </Text>
                        <Ionicons name="arrow-forward" size={16} color="#fff" />
                      </>
                    )}
                  </TouchableOpacity>
                );
              })()}
            </View>
          );
        })}

        {isStudent && (
          <View style={styles.approvalsCard}>
            <Text style={styles.policyTitle}>{t("myApprovalRequests")}</Text>
            {myApprovals.length === 0 ? (
              <Text style={styles.policyTxt}>{t("noApprovalRequests")}</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {myApprovals.map((r) => {
                  const meta = APPROVAL_STATUS_META[r.status] ?? APPROVAL_STATUS_META.pending;
                  return (
                    <View key={r.id} style={styles.approvalRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.approvalRowTitle} numberOfLines={1}>{r.title}</Text>
                        <Text style={styles.approvalRowMeta} numberOfLines={2}>
                          {r.amount !== null && r.amount !== undefined ? `₹${r.amount} · ` : ""}{formatDayMonYear(r.created_at)}
                          {r.note ? ` · ${r.note}` : ""}
                        </Text>
                      </View>
                      <Badge label={t(meta.key)} variant={meta.variant} />
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Payment note */}
        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={18} color={palette.gray500} />
          <Text style={styles.noteTxt}>
            Payments are processed securely via Cashfree, right here in the app.
          </Text>
        </View>

        {/* Receipt download */}
        {lastPaymentId && (
          <View style={styles.receiptCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.receiptTitle}>Payment successful!</Text>
              <Text style={styles.receiptSub}>Download your receipt for this payment.</Text>
            </View>
            <TouchableOpacity
              onPress={handleDownloadReceipt}
              disabled={receiptLoading}
              style={styles.receiptBtn}
              activeOpacity={0.8}
            >
              {receiptLoading ? (
                <ActivityIndicator color={semantic.info.text} size="small" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={15} color={semantic.info.text} />
                  <Text style={styles.receiptBtnTxt}>Receipt</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Cancellation & Refund Policy */}
        <View style={styles.policyCard}>
          <Text style={styles.policyTitle}>Cancellation &amp; Refund Policy</Text>
          <Text style={styles.policyTxt}>
            Cancel anytime from Profile → Subscription — access continues until the end of your billing
            period. Refunds are eligible within 7 days of purchase if content hasn't been substantially used.
          </Text>
          <Text style={styles.policyFooter}>Payments secured by Cashfree · GST included · Cancel anytime</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <CashfreeCheckout
        visible={!!checkoutSession}
        paymentSessionId={checkoutSession?.paymentSessionId ?? null}
        mode={checkoutSession?.mode ?? "sandbox"}
        onComplete={handleCheckoutComplete}
        onDismiss={handleCheckoutDismiss}
        onError={handleCheckoutError}
      />

      <PaymentMethodSheet
        visible={!!methodSheetOrder}
        amountLabel={methodSheetOrder ? `₹${plans.find(p => p.plan_key === methodSheetOrder.planKey)?.price ?? ""}` : ""}
        planName={methodSheetOrder ? (plans.find(p => p.plan_key === methodSheetOrder.planKey)?.name ?? methodSheetOrder.planKey) : ""}
        onSelect={handleMethodSelected}
        onCancel={() => setMethodSheetOrder(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: palette.gray50 },

  // Header
  header:            { paddingTop: spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing["2xl"] + 4 },
  backBtn:           { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  headerCenter:      { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  headerTitle:       { color: "#fff", fontSize: 22, fontWeight: "800" },
  headerSub:         { color: "rgba(255,255,255,0.75)", fontSize: 13 },

  // Body
  body:              { padding: spacing.lg },

  // Status card
  statusCard:        { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  statusLeft:        { flexDirection: "row", alignItems: "center", gap: spacing.md },
  statusDot:         { width: 10, height: 10, borderRadius: 5 },
  statusLabel:       { ...typography.caption, fontSize: 11, color: palette.gray400 },
  statusPlan:        { fontSize: 15, fontWeight: "700", color: palette.gray900, marginTop: 2 },
  statusExpiry:      { fontSize: 11, color: palette.gray500, marginTop: 2 },
  refreshBtn:        { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: palette.primary50, borderRadius: radius.sm, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2, minHeight: 44, justifyContent: "center" },
  refreshBtnTxt:     { fontSize: 12, fontWeight: "600", color: palette.primary600 },

  // Deactivated banner
  deactivatedBanner: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm + 2, backgroundColor: palette.warning50, borderWidth: 1, borderColor: palette.warning100, borderRadius: radius.md + 2, padding: spacing.md + 2, marginBottom: spacing["2xl"] },
  deactivatedTxt:    { flex: 1, fontSize: 12.5, color: palette.warning700, lineHeight: 18 },
  deactivatedTxtBold:{ fontWeight: "700" },
  inheritedBanner:   { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm + 2, backgroundColor: palette.success50, borderWidth: 1, borderColor: palette.success100, borderRadius: radius.md + 2, padding: spacing.md + 2, marginBottom: spacing["2xl"] },
  inheritedTxt:      { flex: 1, fontSize: 12.5, color: palette.success700, lineHeight: 18 },
  inheritedTxtBold:  { fontWeight: "700" },

  // Coupon result
  couponResultRow:   { flexDirection: "row", alignItems: "center", gap: spacing.sm - 2, backgroundColor: semantic.success.bg, borderWidth: 1, borderColor: palette.success100, borderRadius: radius.sm, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm, marginTop: spacing.sm },
  couponResultTxt:   { fontSize: 12.5, fontWeight: "600", color: semantic.success.text, flex: 1 },
  couponErrorRow:    { flexDirection: "row", alignItems: "center", gap: spacing.sm - 2, backgroundColor: semantic.danger.bg, borderWidth: 1, borderColor: palette.danger100, borderRadius: radius.sm, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm, marginTop: spacing.sm },
  couponErrorTxt:    { fontSize: 12.5, fontWeight: "600", color: semantic.danger.text, flex: 1 },

  // Plans
  plansTitle:        { fontSize: 14, fontWeight: "700", color: palette.gray900, marginBottom: spacing.md },
  planCard:          { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, borderWidth: 2, borderColor: palette.gray200 },
  planCardPopular:   { borderColor: palette.primary600 },
  popularBadge:      { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: palette.primary600, alignSelf: "flex-start", borderRadius: radius.sm, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs, marginBottom: spacing.md + 2 },
  popularBadgeTxt:   { color: "#fff", fontSize: 11, fontWeight: "700" },
  planTop:           { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.lg },
  planName:          { fontSize: 18, fontWeight: "800" },
  planPriceRow:      { flexDirection: "row", alignItems: "baseline", gap: 2, marginTop: spacing.xs },
  planPrice:         { fontSize: 28, fontWeight: "900" },
  planPeriod:        { fontSize: 14, color: palette.gray400, fontWeight: "600" },
  planDesc:          { fontSize: 11, color: palette.gray400, marginTop: spacing.xs, maxWidth: 180 },
  planIconWrap:      { width: 52, height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  featureList:       { gap: spacing.sm + 2, marginBottom: spacing["2xl"] },
  featureRow:        { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2 },
  featureTxt:        { fontSize: 13, color: palette.gray700, fontWeight: "500", flex: 1 },
  subscribeBtn:      { borderRadius: radius.md + 2, minHeight: 44, paddingVertical: spacing.md + 2, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  subscribeBtnTxt:   { color: "#fff", fontSize: 15, fontWeight: "700" },
  currentPlanBtn:    { borderRadius: radius.md + 2, minHeight: 44, paddingVertical: spacing.md + 2, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm, borderWidth: 2, backgroundColor: "transparent" },
  currentPlanBtnTxt: { fontSize: 15, fontWeight: "700" },

  // Note
  noteCard:          { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm + 2, backgroundColor: palette.gray100, borderRadius: radius.md + 2, padding: spacing.md + 2, marginTop: spacing.xs },
  noteTxt:           { flex: 1, fontSize: 12, color: palette.gray500, lineHeight: 18 },

  // Receipt download
  receiptCard:       { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2, backgroundColor: semantic.info.bg, borderWidth: 1, borderColor: palette.info100, borderRadius: radius.md + 2, padding: spacing.md + 2, marginTop: spacing.md },
  receiptTitle:      { fontSize: 13, fontWeight: "700", color: semantic.info.text },
  receiptSub:        { fontSize: 11.5, color: palette.info500, marginTop: 2 },
  receiptBtn:        { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2, backgroundColor: "#fff", borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44, justifyContent: "center" },
  receiptBtnTxt:     { fontSize: 13, fontWeight: "700", color: semantic.info.text },

  // Parental approval (F1)
  approvalPanel:     { backgroundColor: semantic.warning.bg, borderWidth: 1, borderColor: semantic.warning.border, borderRadius: radius.md + 2, padding: spacing.md + 2 },
  approvalPanelHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  approvalPanelTitle:{ flex: 1, fontSize: 13, fontWeight: "800", color: semantic.warning.text },
  approvalPanelBody: { fontSize: 12, color: semantic.warning.text, marginTop: 4, lineHeight: 17 },
  approvalsCard:     { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  approvalRow:       { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", backgroundColor: palette.gray50, borderRadius: radius.sm, padding: spacing.sm + 2 },
  approvalRowTitle:  { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  approvalRowMeta:   { fontSize: 11, color: palette.gray500, marginTop: 2 },

  // Cancellation & refund policy
  policyCard:        { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  policyTitle:       { fontSize: 13, fontWeight: "700", color: palette.gray700, marginBottom: spacing.xs + 2 },
  policyTxt:         { fontSize: 12, color: palette.gray500, lineHeight: 18 },
  policyFooter:      { fontSize: 11, color: palette.gray400, marginTop: spacing.sm + 2, textAlign: "center" },
});
