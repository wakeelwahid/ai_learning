import client from "./client";

export const paymentApi = {
  // Plans are fully dynamic (admin-managed) — plan_key is whatever the admin
  // configured under Admin → Plans, not a fixed set of literals.
  plans:           () => client.get("/v1/payments/plans"),
  getSubscription: (userId: string) => client.get(`/v1/payments/subscription/${userId}`),
  getEffectiveSubscription: (userId: string) => client.get(`/v1/payments/subscription/${userId}/effective`),
  createOrder:     (userId: string, plan: string) => client.post("/v1/payments/orders", { user_id: userId, plan }),
  invoices:        (userId: string) => client.get(`/v1/payments/invoices/${userId}`),
  validateCoupon:  (code: string, plan: string) => client.post("/v1/payments/coupons/validate", { code, plan }),
  // Every payment flow on mobile MUST call verifyPayment() with the Cashfree
  // order_id once checkout completes — /orders alone never activates a
  // subscription server-side.
  verifyPayment:   (data: object) => client.post("/v1/payments/verify", data),
  retryPayment:    (paymentId: string, userId: string) =>
    client.post("/v1/payments/retry", { payment_id: paymentId, user_id: userId }),
  downloadReceipt: (paymentId: string) => client.get(`/v1/payments/payments/${paymentId}/receipt`, { responseType: "blob" }),
  // Parent payment endpoints
  parentStudentSubscription: (studentId: string) =>
    client.get("/v1/payments/parent/student-subscription", { params: { student_id: studentId } }),
  parentCreateOrder: (studentId: string, plan: string, couponCode?: string) =>
    client.post("/v1/payments/parent/create-order", { student_id: studentId, plan, coupon_code: couponCode ?? null }),
  parentVerifyPayment: (data: object) => client.post("/v1/payments/parent/verify", data),
};
