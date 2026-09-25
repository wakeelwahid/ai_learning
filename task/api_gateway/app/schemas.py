"""
Gateway-level Pydantic schemas for OpenAPI documentation.
These mirror the service schemas so the gateway Swagger UI shows full API contracts.
"""
import uuid
from datetime import datetime
from pydantic import BaseModel, Field


# ── Auth ──────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    identifier: str = Field(description="Email address or phone number")
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime

class RefreshRequest(BaseModel):
    refresh_token: str


# ── Content ───────────────────────────────────────────────────────────────────
class BoardResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str

class BoardCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=20)

class ChapterResponse(BaseModel):
    id: uuid.UUID
    title: str
    sequence: int

class ChapterCreateRequest(BaseModel):
    subject_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    sequence: int = 0

class VideoResponse(BaseModel):
    id: uuid.UUID
    title: str
    youtube_id: str
    duration_seconds: int
    is_premium: bool

class VideoCreateRequest(BaseModel):
    topic_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    youtube_id: str = Field(min_length=1, max_length=50)
    youtube_id_hi: str | None = None
    youtube_id_pa: str | None = None
    youtube_id_bho: str | None = None
    duration_seconds: int = 0
    thumbnail_url: str | None = None
    notes_url: str | None = None
    sequence: int = 0
    is_premium: bool = False


# ── Quiz ─────────────────────────────────────────────────────────────────────
class QuizResponse(BaseModel):
    id: uuid.UUID
    title: str
    duration_minutes: int
    total_marks: int
    is_premium: bool

class QuizCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    chapter_id: uuid.UUID | None = None
    subject_id: uuid.UUID | None = None
    quiz_type: str
    duration_minutes: int = Field(default=30, ge=1, le=600)
    total_marks: int = Field(default=0, ge=0, le=1000)
    passing_marks: int = Field(default=0, ge=0, le=1000)
    is_premium: bool = False
    board: str | None = None
    class_num: int | None = Field(default=None, ge=1, le=12)
    subject_name: str | None = None
    chapter_name: str | None = None

class StartAttemptRequest(BaseModel):
    quiz_id: uuid.UUID

class AttemptResponse(BaseModel):
    id: uuid.UUID
    quiz_id: uuid.UUID
    status: str
    score: float
    percentage: float


# ── Payments (Cashfree) ────────────────────────────────────────────────────────
class CreateOrderRequest(BaseModel):
    user_id: uuid.UUID
    plan: str
    coupon_code: str | None = None

class CreateOrderResponse(BaseModel):
    order_id: str
    payment_session_id: str
    amount: int
    currency: str
    key: str
    discount_amount: int = 0
    original_amount: int = 0

class VerifyPaymentRequest(BaseModel):
    order_id: str
    user_id: uuid.UUID
    plan: str
    coupon_code: str | None = None

class ParentCreateOrderRequest(BaseModel):
    student_id: uuid.UUID
    plan: str
    coupon_code: str | None = None

class ParentVerifyPaymentRequest(BaseModel):
    order_id: str
    student_id: uuid.UUID
    plan: str
    coupon_code: str | None = None

class PlanCreateRequest(BaseModel):
    plan_key: str
    name: str
    price: int
    currency: str = "INR"
    duration_days: int
    badge: str | None = None
    description: str | None = None
    features: list[str] = []
    limits: dict[str, int] = {}
    is_popular: bool = False
    is_active: bool = True
    sort_order: int = 0

class PlanUpdateRequest(BaseModel):
    name: str | None = None
    price: int | None = None
    currency: str | None = None
    duration_days: int | None = None
    badge: str | None = None
    description: str | None = None
    features: list[str] | None = None
    limits: dict[str, int] | None = None
    is_popular: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None

class SubscriptionResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    plan: str
    status: str
    expires_at: datetime | None

class CouponValidateRequest(BaseModel):
    code: str
    plan: str
    user_id: str | None = None

class CouponValidateResponse(BaseModel):
    valid: bool
    discount_amount: int = 0
    final_price: int = 0
    original_price: int = 0
    message: str

class CouponCreateRequest(BaseModel):
    code: str
    discount_type: str
    discount_value: int
    applicable_plans: list[str] = []
    max_uses: int = 0
    expires_at: datetime | None = None


class CouponToggleRequest(BaseModel):
    is_active: bool

class CouponResponse(BaseModel):
    id: uuid.UUID
    code: str
    discount_type: str
    discount_value: int
    applicable_plans: list
    max_uses: int
    used_count: int
    expires_at: datetime | None
    is_active: bool
    created_at: datetime

class ReceiptResponse(BaseModel):
    receipt_number: str
    payment_id: uuid.UUID
    cashfree_payment_id: str | None
    cashfree_order_id: str | None
    user_id: uuid.UUID
    plan: str | None
    amount_paise: int
    discount_amount_paise: int
    coupon_code_used: str | None
    currency: str
    status: str
    paid_at: datetime

class RetryPaymentRequest(BaseModel):
    payment_id: uuid.UUID
    user_id: uuid.UUID

class RefundPaymentRequest(BaseModel):
    reason: str | None = None


# ── Notifications ─────────────────────────────────────────────────────────────
class ContactMessageRequest(BaseModel):
    name: str
    email: str
    subject: str
    message: str

class ContactMessageMarkReadRequest(BaseModel):
    is_read: bool = True

class SendEmailRequest(BaseModel):
    user_id: uuid.UUID
    to_email: str
    subject: str
    html_body: str

class QueuedResponse(BaseModel):
    queued: bool
    notification_id: str | None = None


# ── AI ───────────────────────────────────────────────────────────────────────
class StudyQueryRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    chapter_id: str | None = None

class AIResponse(BaseModel):
    answer: str
    sources: list[dict] | None = None
    from_cache: bool = False
    mode: str

class ContentUploadRequest(BaseModel):
    chapter_id: str
    title: str
    content: str
    ingest_qdrant: bool = True

class ContentUploadResponse(BaseModel):
    id: str
    chapter_id: str
    content_type: str
    message: str


# ── Analytics ────────────────────────────────────────────────────────────────
class UpdateProgressRequest(BaseModel):
    user_id: uuid.UUID
    chapter_id: uuid.UUID
    videos_watched: int = 0
    quizzes_completed: int = 0


# ── Gamification ─────────────────────────────────────────────────────────────
class AwardXPRequest(BaseModel):
    user_id: uuid.UUID
    event: str
    reference_id: str | None = None


# ── Referral ─────────────────────────────────────────────────────────────────
class RegisterReferralRequest(BaseModel):
    referral_code: str
    referred_user_id: uuid.UUID


# ── User Profiles ─────────────────────────────────────────────────────────────
class CreateProfileRequest(BaseModel):
    user_id: uuid.UUID
    full_name: str = Field(min_length=1, max_length=200)
    class_number: int | None = None
    board: str | None = None
    school_name: str | None = None
    city: str | None = None
    state: str | None = None
    gender: str | None = None

class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    bio: str | None = None
    school_name: str | None = None
    city: str | None = None
    state: str | None = None
    class_number: int | None = None
    board: str | None = None
    avatar_url: str | None = None
