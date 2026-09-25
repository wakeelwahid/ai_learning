from fastapi import APIRouter

from app.routes.admin_upload import router as admin_upload_router
from app.routes.jobs import router as jobs_router
from app.routes.learning_loop import router as learning_loop_router
from app.routes.legacy_content import router as legacy_content_router
from app.routes.paper_attempts import router as paper_attempts_router
from app.routes.papers import router as papers_router
from app.routes.qdrant_admin import router as qdrant_admin_router
from app.routes.rag_chat import router as rag_chat_router

api_router = APIRouter()
api_router.include_router(rag_chat_router)
api_router.include_router(learning_loop_router)
api_router.include_router(admin_upload_router)
api_router.include_router(jobs_router)
api_router.include_router(qdrant_admin_router)
# Before papers_router: its GET /papers/{paper_id} would otherwise swallow
# GET /papers/attempts/mine.
api_router.include_router(paper_attempts_router)
api_router.include_router(papers_router)
api_router.include_router(legacy_content_router)
