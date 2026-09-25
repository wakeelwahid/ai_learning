import random
import string
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id
from app.crud import certificates_crud
from app.database.session import get_db
from app.schemas.content import CertificateIssueRequest

router = APIRouter(prefix="/content", tags=["content"])


# ── Completion Certificates ───────────────────────────────────────────────────
def build_cert_response(cert, base_url: str) -> dict:
    return {
        "id": cert.id,
        "certificate_number": cert.certificate_number,
        "user_id": cert.user_id,
        "entity_type": cert.entity_type,
        "entity_id": cert.entity_id,
        "student_name": cert.student_name,
        "chapter_name": cert.chapter_name,
        "subject_name": cert.subject_name,
        "board": cert.board,
        "class_num": cert.class_num,
        "issued_at": cert.issued_at.isoformat(),
        "share_url": f"{base_url}/certificates/{cert.certificate_number}",
    }


@router.post("/certificates", status_code=201)
async def issue_certificate(
    body: CertificateIssueRequest,
    request: Request,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Issue a completion certificate after verifying 100% chapter/subject progress.
    Returns existing certificate if already issued for the same (user, entity).

    The certificate is always issued to the authenticated caller — any user_id
    supplied in the request body is ignored to prevent issuing certificates on
    behalf of other users.
    """
    # Check existing to avoid duplicate (idempotent)
    existing = await certificates_crud.get_certificate_by_user_entity(db, current_user_id, body.entity_type, body.entity_id)
    if existing:
        base_url = str(request.base_url).rstrip("/")
        return build_cert_response(existing, base_url)

    # Verify 100% completion in learning progress
    progress = await certificates_crud.get_learning_progress(db, current_user_id, body.entity_type, body.entity_id)

    if not progress or progress.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"User has not completed this {body.entity_type} yet.",
        )

    # Resolve names from curriculum hierarchy
    names = await certificates_crud.resolve_certificate_names(db, body.entity_type, body.entity_id)
    chapter_name = names["chapter_name"]
    subject_name = names["subject_name"]
    board_name = names["board_name"]
    class_num = names["class_num"]

    # Generate unique certificate number: CERT-2026-06-A3B7F2
    now = datetime.now(timezone.utc)
    random_part = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    cert_number = f"CERT-{now.year}-{now.month:02d}-{random_part}"

    cert = await certificates_crud.create_certificate(
        db,
        certificate_number=cert_number,
        user_id=current_user_id,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        student_name=body.student_name,
        chapter_name=chapter_name,
        subject_name=subject_name,
        board_name=board_name,
        class_num=class_num,
    )

    base_url = str(request.base_url).rstrip("/")
    return build_cert_response(cert, base_url)


@router.get("/certificates/{certificate_number}")
async def get_certificate(certificate_number: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Public endpoint (no auth) — used in share links. Returns certificate details for the share page."""
    cert = await certificates_crud.get_certificate_by_number(db, certificate_number)
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    base_url = str(request.base_url).rstrip("/")
    return build_cert_response(cert, base_url)


@router.get("/certificates/user/{user_id}")
async def list_user_certificates(
    user_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    entity_type: str | None = Query(None, pattern="^(chapter|subject)$"),
    limit: int = Query(50, ge=1, le=200),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """List all certificates for a user, optionally filtered by entity_type."""
    if user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Cannot access another user's certificates")

    certs = await certificates_crud.list_certificates_for_user(db, user_id, entity_type, limit)
    base_url = str(request.base_url).rstrip("/") if request else ""
    return [build_cert_response(c, base_url) for c in certs]
