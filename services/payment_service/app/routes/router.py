from fastapi import APIRouter

from app.routes.admin import router as admin_router
from app.routes.checkout import router as checkout_router
from app.routes.coupons import router as coupons_router
from app.routes.invoices import router as invoices_router
from app.routes.parent import router as parent_router
from app.routes.plans import router as plans_router
from app.routes.subscription import router as subscription_router
from app.routes.webhooks import router as webhooks_router

api_router = APIRouter()
# Include order reproduces the original single-file route registration order
# exactly. It is load-bearing: /payments/subscription/{user_id} (in
# subscription_router) is registered before /payments/subscription/status/{user_id}
# (also in subscription_router, after it), and checkout's wildcard
# /payments/{payment_id}/receipt must stay ahead of nothing it would shadow.
# Do not reorder these includes.
api_router.include_router(checkout_router)      # /orders, /verify, /retry, /{payment_id}/receipt
api_router.include_router(coupons_router)       # /coupons/validate + admin-panel /coupons CRUD
api_router.include_router(subscription_router)  # /subscription/{user_id} then /subscription/status/{user_id}
api_router.include_router(admin_router)         # /admin/*
api_router.include_router(parent_router)        # /parent/*
api_router.include_router(plans_router)         # /plans
api_router.include_router(invoices_router)      # /invoices/{user_id}
api_router.include_router(webhooks_router)      # /webhook
