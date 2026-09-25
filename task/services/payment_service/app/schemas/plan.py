import uuid

from pydantic import BaseModel, Field, field_validator

from app.schemas.limits import PLAN_KEY_MAX_LEN


class PlanResponse(BaseModel):
    id: uuid.UUID
    plan_key: str
    name: str
    price: int             # rupees (price_paise // 100) — matches the shape clients already expect
    price_paise: int
    currency: str
    duration_days: int
    badge: str | None
    description: str | None
    features: list[str]
    limits: dict
    is_popular: bool
    is_active: bool
    sort_order: int

    @staticmethod
    def from_model(p) -> "PlanResponse":
        return PlanResponse(
            id=p.id, plan_key=p.plan_key, name=p.name,
            price=p.price_paise // 100, price_paise=p.price_paise,
            currency=p.currency, duration_days=p.duration_days,
            badge=p.badge, description=p.description,
            features=p.features or [], limits=p.limits or {},
            is_popular=p.is_popular, is_active=p.is_active, sort_order=p.sort_order,
        )


class PlanCreateRequest(BaseModel):
    plan_key: str = Field(min_length=1, max_length=PLAN_KEY_MAX_LEN, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=100)
    price: int = Field(ge=0, description="Price in rupees")
    currency: str = Field(default="INR", max_length=10)
    duration_days: int = Field(gt=0, le=3650)
    badge: str | None = Field(default=None, max_length=50)
    description: str | None = None
    features: list[str] = Field(default_factory=list)
    limits: dict[str, int] = Field(default_factory=dict)
    is_popular: bool = False
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0, le=1000)

    @field_validator("limits")
    @classmethod
    def _validate_limits(cls, v: dict[str, int]) -> dict[str, int]:
        # limits represents non-negative usage caps (e.g. daily_quizzes) —
        # a negative value was accepted with no complaint before this.
        for key, value in v.items():
            if value < 0:
                raise ValueError(f"limits.{key} cannot be negative")
        return v


class PlanUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    price: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=10)
    duration_days: int | None = Field(default=None, gt=0, le=3650)
    badge: str | None = None
    description: str | None = None
    features: list[str] | None = None
    limits: dict[str, int] | None = None
    is_popular: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None
