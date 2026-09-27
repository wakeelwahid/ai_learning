import uuid

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import curriculum_admin_crud
from app.crud import curriculum_crud
from app.crud import search_crud
from app.crud import seed_crud
from app.crud import videos_crud
from app.models.content import Chapter, ContentBoard, ContentClass, Note, Subject, Topic, Video, VideoProgress
from app.schemas.content import (
    BoardCreate,
    BoardUpdate,
    ChapterCreate,
    ChapterUpdate,
    ChapterVideoCreate,
    ClassCreate,
    ClassUpdate,
    SubjectCreate,
    SubjectUpdate,
    TopicCreate,
    TopicUpdate,
    VideoCreate,
    VideoProgressResponse,
    VideoProgressUpdate,
)


class ContentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_boards(self) -> list[ContentBoard]:
        return await curriculum_crud.get_boards(self.db)

    async def list_classes(self, board_id: uuid.UUID) -> list[ContentClass]:
        return await curriculum_crud.get_classes(self.db, board_id)

    async def list_subjects(self, class_id: uuid.UUID) -> list[Subject]:
        return await curriculum_crud.get_subjects(self.db, class_id)

    async def list_chapters(self, subject_id: uuid.UUID, limit: int = 200, offset: int = 0) -> list[Chapter]:
        return await curriculum_crud.get_chapters(self.db, subject_id, limit=limit, offset=offset)

    async def list_topics(self, chapter_id: uuid.UUID, limit: int = 200, offset: int = 0) -> list[Topic]:
        return await curriculum_crud.get_topics(self.db, chapter_id, limit=limit, offset=offset)

    async def list_videos(
        self,
        topic_id: uuid.UUID,
        limit: int = 200,
        offset: int = 0,
        viewer_board: str | None = None,
        viewer_class: int | None = None,
    ) -> list[Video]:
        return await videos_crud.get_videos(
            self.db, topic_id, limit=limit, offset=offset,
            viewer_board=viewer_board, viewer_class=viewer_class,
        )

    async def list_notes(
        self,
        chapter_id: uuid.UUID,
        limit: int = 200,
        offset: int = 0,
        viewer_board: str | None = None,
        viewer_class: int | None = None,
    ) -> list[Note]:
        return await curriculum_crud.get_notes(
            self.db, chapter_id, limit=limit, offset=offset,
            viewer_board=viewer_board, viewer_class=viewer_class,
        )

    async def search(self, q: str) -> dict:
        return await search_crud.search_content(self.db, q.strip())

    async def create_board(self, data: BoardCreate) -> ContentBoard:
        return await curriculum_crud.create_board(self.db, data)

    async def create_class(self, data: ClassCreate) -> ContentClass:
        return await curriculum_crud.create_class(self.db, data)

    async def create_subject(self, data: SubjectCreate) -> Subject:
        return await curriculum_crud.create_subject(self.db, data)

    async def create_chapter(self, data: ChapterCreate) -> Chapter:
        return await curriculum_crud.create_chapter(self.db, data)

    async def create_topic(self, data: TopicCreate) -> Topic:
        return await curriculum_crud.create_topic(self.db, data)

    async def create_video(self, data: VideoCreate) -> Video:
        return await videos_crud.create_video(self.db, data)

    async def get_chapter_all_videos(self, chapter_id: uuid.UUID) -> list[Video]:
        return await videos_crud.get_chapter_all_videos(self.db, chapter_id)

    async def create_chapter_video(self, chapter_id: uuid.UUID, data: ChapterVideoCreate) -> Video:
        return await videos_crud.create_chapter_video(self.db, chapter_id, data)

    async def seed_demo_data(self, user_id: uuid.UUID | None = None) -> dict:
        return await seed_crud.seed_demo_data(self.db, user_id)

    async def seed_exercise_demo(self) -> dict:
        return await seed_crud.seed_exercise_demo(self.db)

    async def seed_demo_catalog(self) -> dict:
        return await seed_crud.seed_demo_catalog(self.db)

    async def admin_list_boards(self, include_inactive: bool = False) -> list[ContentBoard]:
        return await curriculum_admin_crud.admin_get_boards(self.db, include_inactive)

    async def admin_update_board(self, board_id: uuid.UUID, body: BoardUpdate) -> ContentBoard:
        board = await curriculum_admin_crud.get_board(self.db, board_id)
        if not board:
            raise HTTPException(status_code=404, detail="Board not found")
        return await curriculum_admin_crud.update_board(self.db, board, body)

    async def admin_delete_board(self, board_id: uuid.UUID) -> None:
        board = await curriculum_admin_crud.get_board(self.db, board_id)
        if not board:
            raise HTTPException(status_code=404, detail="Board not found")
        await curriculum_admin_crud.deactivate_board(self.db, board)

    async def admin_list_classes(
        self, board_id: uuid.UUID | None = None, include_inactive: bool = False
    ) -> list[ContentClass]:
        return await curriculum_admin_crud.admin_get_classes(self.db, board_id, include_inactive)

    async def admin_update_class(self, class_id: uuid.UUID, body: ClassUpdate) -> ContentClass:
        cls = await curriculum_admin_crud.get_class(self.db, class_id)
        if not cls:
            raise HTTPException(status_code=404, detail="Class not found")
        return await curriculum_admin_crud.update_class(self.db, cls, body)

    async def admin_delete_class(self, class_id: uuid.UUID) -> None:
        cls = await curriculum_admin_crud.get_class(self.db, class_id)
        if not cls:
            raise HTTPException(status_code=404, detail="Class not found")
        await curriculum_admin_crud.deactivate_class(self.db, cls)

    async def admin_list_subjects(
        self, class_id: uuid.UUID | None = None, include_inactive: bool = False
    ) -> list[Subject]:
        return await curriculum_admin_crud.admin_get_subjects(self.db, class_id, include_inactive)

    async def admin_update_subject(self, subject_id: uuid.UUID, body: SubjectUpdate) -> Subject:
        subject = await curriculum_admin_crud.get_subject(self.db, subject_id)
        if not subject:
            raise HTTPException(status_code=404, detail="Subject not found")
        return await curriculum_admin_crud.update_subject(self.db, subject, body)

    async def admin_delete_subject(self, subject_id: uuid.UUID) -> None:
        subject = await curriculum_admin_crud.get_subject(self.db, subject_id)
        if not subject:
            raise HTTPException(status_code=404, detail="Subject not found")
        await curriculum_admin_crud.deactivate_subject(self.db, subject)

    async def admin_list_chapters(
        self,
        subject_id: uuid.UUID | None = None,
        include_inactive: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Chapter]:
        return await curriculum_admin_crud.admin_get_chapters(self.db, subject_id, include_inactive, limit, offset)

    async def admin_update_chapter(self, chapter_id: uuid.UUID, body: ChapterUpdate) -> Chapter:
        chapter = await curriculum_admin_crud.get_chapter(self.db, chapter_id)
        if not chapter:
            raise HTTPException(status_code=404, detail="Chapter not found")
        return await curriculum_admin_crud.update_chapter(self.db, chapter, body)

    async def admin_delete_chapter(self, chapter_id: uuid.UUID) -> None:
        chapter = await curriculum_admin_crud.get_chapter(self.db, chapter_id)
        if not chapter:
            raise HTTPException(status_code=404, detail="Chapter not found")
        await curriculum_admin_crud.deactivate_chapter(self.db, chapter)

    async def admin_list_topics(
        self,
        chapter_id: uuid.UUID | None = None,
        include_inactive: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Topic]:
        return await curriculum_admin_crud.admin_get_topics(self.db, chapter_id, include_inactive, limit, offset)

    async def admin_update_topic(self, topic_id: uuid.UUID, body: TopicUpdate) -> Topic:
        topic = await curriculum_admin_crud.get_topic(self.db, topic_id)
        if not topic:
            raise HTTPException(status_code=404, detail="Topic not found")
        return await curriculum_admin_crud.update_topic(self.db, topic, body)

    async def admin_delete_topic(self, topic_id: uuid.UUID) -> None:
        topic = await curriculum_admin_crud.get_topic(self.db, topic_id)
        if not topic:
            raise HTTPException(status_code=404, detail="Topic not found")
        await curriculum_admin_crud.deactivate_topic(self.db, topic)

    async def upsert_video_progress(
        self,
        video_id: uuid.UUID,
        user_id: uuid.UUID,
        data: VideoProgressUpdate,
    ) -> VideoProgressResponse:
        video = await videos_crud.get_video(self.db, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        progress = await videos_crud.upsert_video_progress(self.db, user_id, video_id, data, video)
        resp = VideoProgressResponse.model_validate(progress)
        if video.duration_seconds > 0:
            resp.notes_unlocked = (progress.actual_watched_seconds / video.duration_seconds) >= 0.70
        return resp
