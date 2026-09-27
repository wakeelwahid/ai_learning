# Coupon.code column is String(50) — request fields must not exceed it or an
# oversized value would fail at the DB layer with an opaque 500 instead of a
# clean 422.
COUPON_CODE_MAX_LEN = 50
# Subscription.plan / Plan.plan_key are String(50).
PLAN_KEY_MAX_LEN = 50
# Payment.cashfree_order_id / cashfree_payment_id are String(100).
CF_ID_MAX_LEN = 100
