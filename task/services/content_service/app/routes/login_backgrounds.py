import base64
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.core.dependencies import require_admin
from app.crud import login_backgrounds_crud
from app.database.session import get_db

router = APIRouter(prefix="/content", tags=["content"])

_ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
_MIME_BY_EXT = {
    "jpg": {"image/jpeg"}, "jpeg": {"image/jpeg"},
    "png": {"image/png"}, "webp": {"image/webp"},
}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB — a login-screen background, not a raw camera photo

IMAGE_CACHE_TTL = 600
IMAGE_CACHE_HEADERS = {"Cache-Control": "public, max-age=600"}


def ser_login_background(row) -> dict:
    return {
        "id": str(row.id),
        "is_active": row.is_active,
        "uploaded_by": str(row.uploaded_by),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "image_path": f"/api/v1/content/login-backgrounds/{row.id}/image",
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Login screen background images — admin-uploaded, one active at a time
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/login-backgrounds/active", summary="Get the currently active login-screen background")
async def get_active_login_background(db: AsyncSession = Depends(get_db)):
    """Public (no auth) — the mobile app and web frontend both call this
    before the user has signed in, to know which image path to render."""
    row = await login_backgrounds_crud.get_active_login_background(db)
    return {"image_path": f"/api/v1/content/login-backgrounds/{row.id}/image" if row else None}


@router.get("/login-backgrounds/{background_id}/image", summary="Serve a login background's raw image bytes")
async def get_login_background_image(background_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Public (no auth) so a plain <img>/Image source works before login.
    Redis read-through, same convention as user_service's avatar serving."""
    cache_key = f"login_bg:{background_id}"
    redis = None
    try:
        redis = get_redis()
        raw = await redis.get(cache_key)
        if raw:
            doc = json.loads(raw)
            return Response(
                content=base64.b64decode(doc["b"]),
                media_type=doc.get("m") or "image/jpeg",
                headers=IMAGE_CACHE_HEADERS,
            )
    except Exception:
        redis = None  # Redis down — serve from DB, never fail the image

    row = await login_backgrounds_crud.get_login_background_bytes(db, background_id)
    if not row:
        raise HTTPException(status_code=404, detail="Login background not found")

    if redis is not None:
        try:
            await redis.set(
                cache_key,
                json.dumps({"m": row.image_mime, "b": base64.b64encode(row.image_bytes).decode()}),
                ex=IMAGE_CACHE_TTL,
            )
        except Exception:
            pass

    return Response(content=row.image_bytes, media_type=row.image_mime, headers=IMAGE_CACHE_HEADERS)


@router.get("/login-backgrounds", summary="[Admin] List all uploaded login-screen backgrounds", dependencies=[Depends(require_admin)])
async def list_login_backgrounds(db: AsyncSession = Depends(get_db)):
    rows = await login_backgrounds_crud.list_login_backgrounds(db)
    return [ser_login_background(r) for r in rows]


@router.post("/login-backgrounds", summary="[Admin] Upload a new login-screen background (max 4)")
async def upload_login_background(
    file: UploadFile = File(...),
    admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing_count = await login_backgrounds_crud.count_login_backgrounds(db)
    if existing_count >= login_backgrounds_crud.MAX_LOGIN_BACKGROUNDS:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum of {login_backgrounds_crud.MAX_LOGIN_BACKGROUNDS} login backgrounds already uploaded. Delete one first.",
        )

    safe_filename = Path(file.filename or "background").name
    ext = safe_filename.rsplit(".", 1)[-1].lower() if "." in safe_filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}. Allowed: {sorted(_ALLOWED_EXTENSIONS)}")
    if file.content_type and file.content_type not in _MIME_BY_EXT.get(ext, set()):
        raise HTTPException(status_code=400, detail=f"File content type '{file.content_type}' doesn't match the .{ext} extension.")

    file_bytes = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large — max {MAX_UPLOAD_BYTES // (1024*1024)}MB.")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    row = await login_backgrounds_crud.create_login_background(
        db, file_bytes, file.content_type or "image/jpeg", admin_id,
    )
    return ser_login_background(row)


@router.patch("/login-backgrounds/{background_id}/activate", summary="[Admin] Set a login background as the active one", dependencies=[Depends(require_admin)])
async def activate_login_background(background_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    row = await login_backgrounds_crud.set_active_login_background(db, background_id)
    if not row:
        raise HTTPException(status_code=404, detail="Login background not found")
    return ser_login_background(row)


@router.delete("/login-backgrounds/{background_id}", summary="[Admin] Delete a login background", dependencies=[Depends(require_admin)])
async def delete_login_background(background_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    row = await login_backgrounds_crud.delete_login_background(db, background_id)
    if not row:
        raise HTTPException(status_code=404, detail="Login background not found")
    return {"deleted": True}
