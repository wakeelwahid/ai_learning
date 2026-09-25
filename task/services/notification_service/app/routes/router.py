"""
Router aggregator for notification_service.

The six route modules use inconsistent internal prefixes (a pre-existing
condition, not something this aggregator changes), so each is mounted here
with whatever additional prefix reproduces its original effective path from
main.py:

    notification_router    (self-prefix /notifications)            -> /api/v1/notifications/...
    message_router          (self-prefix /notifications/messages)   -> /api/v1/notifications/messages/...
    admin_triggers_router   (self-prefix /api/v1/notifications/admin, already absolute) -> /api/v1/notifications/admin/...
    push_router             (self-prefix /push)                     -> /api/v1/notifications/push/...
    announcement_router     (self-prefix /announcements)            -> /api/v1/notifications/announcements/...
    maintenance_router      (self-prefix /maintenance)              -> /api/v1/notifications/maintenance/...

api_router itself carries no prefix — main.py mounts sub-routers directly at
their final paths (admin_triggers_router already has "/api/v1/notifications/admin"
baked in, so it must NOT also receive the "/api/v1" prefix main.py used to add
to the others).
"""
from fastapi import APIRouter

from app.routes.notification import router as notification_router
from app.routes.message import router as message_router
from app.routes.admin_triggers import router as admin_triggers_router
from app.routes.push import router as push_router
from app.routes.announcement import router as announcement_router
from app.routes.maintenance import router as maintenance_router

api_router = APIRouter()
api_router.include_router(notification_router, prefix="/api/v1")
api_router.include_router(message_router, prefix="/api/v1")
api_router.include_router(admin_triggers_router)
api_router.include_router(push_router, prefix="/api/v1/notifications")
api_router.include_router(announcement_router, prefix="/api/v1/notifications")
api_router.include_router(maintenance_router, prefix="/api/v1/notifications")
