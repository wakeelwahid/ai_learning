"""Past payments (invoices) for a user."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id_and_role
from app.crud import invoice_crud
from app.database.session import get_db

router = APIRouter(prefix="/payments", tags=["payments"])


# ── User invoices ──────────────────────────────────────────────────────────────

@router.get("/invoices/{user_id}", summary="List past payments (invoices) for a user")
async def get_user_invoices(
    user_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    caller: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
):
    current_user_id, role = caller
    if user_id != current_user_id and role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Access denied: you can only view your own invoices.")

    payments, sub_plan_map = await invoice_crud.get_user_invoices_data(db, user_id, page=page, limit=limit)

    invoices = []
    for p in payments:
        amount_rupees = p.amount_paise // 100
        invoices.append(
            {
                "id": str(p.id),
                "amount_paise": p.amount_paise,
                "amount_display": f"₹{amount_rupees}",
                "status": p.status.value,
                "created_at": p.created_at.isoformat(),
                "plan": sub_plan_map.get(p.subscription_id) if p.subscription_id else p.plan_key,
                "cashfree_order_id": p.cashfree_order_id,
            }
        )

    return invoices
