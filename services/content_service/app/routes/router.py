from fastapi import APIRouter

from app.routes.assignments import router as assignments_router
from app.routes.bookmarks import router as bookmarks_router
from app.routes.certificates import router as certificates_router
from app.routes.curriculum import router as curriculum_router
from app.routes.curriculum_admin import router as curriculum_admin_router
from app.routes.exercises import router as exercises_router
from app.routes.info_pages import router as info_pages_router
from app.routes.knowledge_hub import router as knowledge_hub_router
from app.routes.login_backgrounds import router as login_backgrounds_router
from app.routes.progress import router as progress_router
from app.routes.pyp import router as pyp_router
from app.routes.search import router as search_router
from app.routes.videos import router as videos_router

api_router = APIRouter()
api_router.include_router(search_router)
api_router.include_router(curriculum_router)
api_router.include_router(curriculum_admin_router)
api_router.include_router(videos_router)
api_router.include_router(progress_router)
api_router.include_router(bookmarks_router)
api_router.include_router(assignments_router)
api_router.include_router(exercises_router)
api_router.include_router(info_pages_router)
api_router.include_router(certificates_router)
api_router.include_router(pyp_router)
api_router.include_router(knowledge_hub_router)
api_router.include_router(login_backgrounds_router)
