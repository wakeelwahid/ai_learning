from fastapi import Request, Response, APIRouter

from app.core.rest_router import rest_router
from app.services import content_svc
from app.schemas import (
    BoardResponse, BoardCreateRequest,
    ChapterResponse, ChapterCreateRequest,
    VideoResponse, VideoCreateRequest,
)

router = APIRouter(prefix="/api/v1/content", tags=["Content"])


# ── Global search ────────────────────────────────────────────────────────────
# Must be registered BEFORE path-param routes to avoid being caught by them

@rest_router(router.get, path="/search", proxy=content_svc,
    summary="Global search across chapters, videos, notes")
async def search_content(request: Request, response: Response):
    pass

@rest_router(router.get, path="/video-feed", proxy=content_svc,
    summary="Dashboard video feed (recent/popular)")
async def video_feed(request: Request, response: Response):
    pass

@rest_router(router.get, path="/continue-watching", proxy=content_svc,
    summary="A user's in-progress videos (Continue Watching)")
async def continue_watching(request: Request, response: Response):
    pass


# ── Completion Certificates ───────────────────────────────────────────────────
# NOTE: register the /user/ and static sub-paths BEFORE the {certificate_number}
# catch-all so they are not shadowed by the dynamic segment.

@rest_router(router.post, path="/certificates", proxy=content_svc,
    summary="Issue a completion certificate (chapter/subject 100%)")
async def issue_certificate(request: Request, response: Response):
    pass

@rest_router(router.get, path="/certificates/user/{user_id}", proxy=content_svc,
    summary="List a user's earned certificates")
async def list_user_certificates(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/certificates/{certificate_number}", proxy=content_svc,
    summary="Public certificate lookup (for share links)")
async def get_certificate(request: Request, response: Response, certificate_number: str):
    pass


# ── Curriculum hierarchy (read) ───────────────────────────────────────────────

@rest_router(router.get, path="/my-catalog", proxy=content_svc,
    summary="Subjects for the caller's own board & class (profile-driven)")
async def get_my_catalog(request: Request, response: Response):
    pass

@rest_router(router.get, path="/boards", proxy=content_svc,
    summary="List all boards (CBSE, HBSE, …)")
async def get_boards(request: Request, response: Response):
    pass

@rest_router(router.get, path="/boards/{board_id}/classes", proxy=content_svc,
    summary="List classes for a board")
async def get_classes(request: Request, response: Response, board_id: str):
    pass

@rest_router(router.get, path="/classes/{class_id}/subjects", proxy=content_svc,
    summary="List subjects for a class")
async def get_subjects(request: Request, response: Response, class_id: str):
    pass

@rest_router(router.get, path="/subjects/{subject_id}/chapters", proxy=content_svc,
    summary="List chapters for a subject")
async def get_chapters(request: Request, response: Response, subject_id: str):
    pass

@rest_router(router.get, path="/chapters/{chapter_id}", proxy=content_svc,
    summary="Get a single chapter")
async def get_chapter(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.get, path="/chapters/{chapter_id}/topics", proxy=content_svc,
    summary="List topics in a chapter")
async def get_topics(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.get, path="/chapters/{chapter_id}/notes", proxy=content_svc,
    summary="Get notes for a chapter")
async def get_notes(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.get, path="/topics/{topic_id}/videos", proxy=content_svc,
    summary="List videos for a topic")
async def get_videos(request: Request, response: Response, topic_id: str):
    pass

@rest_router(router.get, path="/videos/by-youtube/{youtube_id}", proxy=content_svc,
    summary="Get a video by YouTube ID")
async def get_video_by_youtube_id(request: Request, response: Response, youtube_id: str):
    pass

@rest_router(router.get, path="/videos/popular", proxy=content_svc,
    summary="Popular videos feed")
async def get_popular_videos(request: Request, response: Response):
    pass

@rest_router(router.get, path="/videos/recommended", proxy=content_svc,
    summary="Recommended videos for a user")
async def get_recommended_videos(request: Request, response: Response):
    pass

@rest_router(router.get, path="/videos/continue-watching", proxy=content_svc,
    summary="Continue watching list (alias)")
async def continue_watching_alias(request: Request, response: Response):
    pass

@rest_router(router.get, path="/videos/{video_id}", proxy=content_svc,
    summary="Get a single video")
async def get_video(request: Request, response: Response, video_id: str):
    pass


# ── Video progress ────────────────────────────────────────────────────────────

@rest_router(router.put, path="/videos/{video_id}/progress", proxy=content_svc,
    summary="Update watch progress for a video")
async def update_progress(request: Request, response: Response, video_id: str):
    pass

@rest_router(router.get, path="/videos/{video_id}/progress", proxy=content_svc,
    summary="Get watch progress for a video")
async def get_progress(request: Request, response: Response, video_id: str):
    pass


# ── Admin: content creation ───────────────────────────────────────────────────

@rest_router(router.post, path="/boards", proxy=content_svc,
    summary="[Admin] Create a board")
async def create_board(request: Request, response: Response, data: BoardCreateRequest):
    pass

@rest_router(router.post, path="/classes", proxy=content_svc,
    summary="[Admin] Create a class")
async def create_class(request: Request, response: Response):
    pass

@rest_router(router.post, path="/subjects", proxy=content_svc,
    summary="[Admin] Create a subject")
async def create_subject(request: Request, response: Response):
    pass

@rest_router(router.post, path="/chapters", proxy=content_svc,
    summary="[Admin] Create a new chapter")
async def create_chapter(request: Request, response: Response, data: ChapterCreateRequest):
    pass

@rest_router(router.post, path="/topics", proxy=content_svc,
    summary="[Admin] Create a new topic")
async def create_topic(request: Request, response: Response):
    pass

@rest_router(router.post, path="/videos", proxy=content_svc,
    summary="[Admin] Add a new video")
async def create_video(request: Request, response: Response, data: VideoCreateRequest):
    pass

@rest_router(router.put, path="/chapters/{chapter_id}", proxy=content_svc,
    summary="[Admin] Update a chapter")
async def update_chapter(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.delete, path="/chapters/{chapter_id}", proxy=content_svc,
    summary="[Admin] Delete a chapter")
async def delete_chapter(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.delete, path="/videos/{video_id}", proxy=content_svc,
    summary="[Admin] Delete a video")
async def delete_video(request: Request, response: Response, video_id: str):
    pass

@rest_router(router.post, path="/bookmarks/toggle", proxy=content_svc,
    summary="Save or un-save a video/note for the current user")
async def toggle_bookmark(request: Request, response: Response):
    pass

@rest_router(router.post, path="/notes/{note_id}/bookmark", proxy=content_svc, status_code=201,
    summary="Bookmark a note for a user (legacy path — same as /bookmarks/toggle)")
async def bookmark_note(request: Request, response: Response, note_id: str):
    pass

@rest_router(router.get, path="/bookmarks/{user_id}", proxy=content_svc,
    summary="Get all bookmarked videos and notes for a user")
async def get_bookmarks(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.post, path="/assignments", proxy=content_svc, status_code=201,
    summary="[Admin] Assign a chapter or exercise to one or more students")
async def create_assignment(request: Request, response: Response):
    pass

@rest_router(router.get, path="/assignments", proxy=content_svc,
    summary="[Admin] List assignments")
async def list_assignments(request: Request, response: Response):
    pass

@rest_router(router.get, path="/assignments/student/{student_id}", proxy=content_svc,
    summary="A student's (or their linked parent's) real assignment completion")
async def get_student_assignments(request: Request, response: Response, student_id: str):
    pass


# ── Chapter-level video management ───────────────────────────────────────────

@rest_router(router.get, path="/chapters/{chapter_id}/all-videos", proxy=content_svc,
    summary="List all videos in a chapter (across topics)")
async def get_chapter_all_videos(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.post, path="/chapters/{chapter_id}/videos", proxy=content_svc, status_code=201,
    summary="[Admin] Add a video to a chapter")
async def create_chapter_video(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.post, path="/seed-demo", proxy=content_svc,
    summary="[Admin] Seed demo CBSE Class 10 content")
async def seed_demo(request: Request, response: Response):
    pass

@rest_router(router.post, path="/seed-exercises", proxy=content_svc,
    summary="[Admin] Seed exercise→question→video→practice demo data")
async def seed_exercises(request: Request, response: Response):
    pass


# ── Exercise management ───────────────────────────────────────────────────────

@rest_router(router.get, path="/chapters/{chapter_id}/exercises", proxy=content_svc,
    summary="List exercises in a chapter")
async def get_exercises(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.post, path="/exercises", proxy=content_svc, status_code=201,
    summary="[Admin] Create an exercise")
async def create_exercise(request: Request, response: Response):
    pass

@rest_router(router.delete, path="/exercises/{exercise_id}", proxy=content_svc, status_code=204,
    summary="[Admin] Delete an exercise")
async def delete_exercise(request: Request, response: Response, exercise_id: str):
    pass


# ── Question management ───────────────────────────────────────────────────────

@rest_router(router.get, path="/exercises/{exercise_id}/questions", proxy=content_svc,
    summary="List questions in an exercise (Mode 1)")
async def get_exercise_questions(request: Request, response: Response, exercise_id: str):
    pass

@rest_router(router.get, path="/chapters/{chapter_id}/questions", proxy=content_svc,
    summary="List direct questions in a chapter (Mode 2)")
async def get_chapter_questions(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.post, path="/questions", proxy=content_svc, status_code=201,
    summary="[Admin] Create a question")
async def create_question(request: Request, response: Response):
    pass

@rest_router(router.delete, path="/questions/{question_id}", proxy=content_svc, status_code=204,
    summary="[Admin] Delete a question")
async def delete_question(request: Request, response: Response, question_id: str):
    pass


# ── Question Video management ─────────────────────────────────────────────────

@rest_router(router.get, path="/questions/{question_id}/video", proxy=content_svc,
    summary="Get video for a question")
async def get_question_video(request: Request, response: Response, question_id: str):
    pass

@rest_router(router.post, path="/questions/{question_id}/video", proxy=content_svc, status_code=201,
    summary="[Admin] Set/replace video for a question")
async def set_question_video(request: Request, response: Response, question_id: str):
    pass

@rest_router(router.delete, path="/questions/{question_id}/video", proxy=content_svc, status_code=204,
    summary="[Admin] Remove video from a question")
async def delete_question_video(request: Request, response: Response, question_id: str):
    pass


# ── Practice Question management ──────────────────────────────────────────────

@rest_router(router.get, path="/questions/{question_id}/practice", proxy=content_svc,
    summary="List practice questions for a question")
async def get_practice_questions(request: Request, response: Response, question_id: str):
    pass

@rest_router(router.get, path="/exercises/{exercise_id}/practice", proxy=content_svc,
    summary="All practice questions across an exercise")
async def get_exercise_practice(request: Request, response: Response, exercise_id: str):
    pass

@rest_router(router.get, path="/chapters/{chapter_id}/practice", proxy=content_svc,
    summary="All practice questions across a chapter")
async def get_chapter_practice(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.get, path="/subjects/{subject_id}/practice", proxy=content_svc,
    summary="All practice questions across a subject (course test)")
async def get_subject_practice(request: Request, response: Response, subject_id: str):
    pass

@rest_router(router.post, path="/practice-questions", proxy=content_svc, status_code=201,
    summary="[Admin] Create a practice question")
async def create_practice_question(request: Request, response: Response):
    pass

@rest_router(router.delete, path="/practice-questions/{pq_id}", proxy=content_svc, status_code=204,
    summary="[Admin] Delete a practice question")
async def delete_practice_question(request: Request, response: Response, pq_id: str):
    pass


# ── User Learning Progress ────────────────────────────────────────────────────

@rest_router(router.put, path="/videos/{video_id}/complete", proxy=content_svc,
    summary="Mark video as completed by user")
async def mark_video_complete(request: Request, response: Response, video_id: str):
    pass

@rest_router(router.put, path="/exercises/{exercise_id}/complete", proxy=content_svc,
    summary="Mark exercise as completed by user")
async def mark_exercise_complete(request: Request, response: Response, exercise_id: str):
    pass

@rest_router(router.put, path="/chapters/{chapter_id}/complete", proxy=content_svc,
    summary="Mark chapter as completed by user")
async def mark_chapter_complete(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.put, path="/subjects/{subject_id}/complete", proxy=content_svc,
    summary="Mark subject/course as completed by user")
async def mark_subject_complete(request: Request, response: Response, subject_id: str):
    pass

@rest_router(router.get, path="/exercises/{exercise_id}/my-progress", proxy=content_svc,
    summary="Get user progress for an exercise")
async def get_exercise_progress(request: Request, response: Response, exercise_id: str):
    pass

@rest_router(router.get, path="/chapters/{chapter_id}/my-progress", proxy=content_svc,
    summary="Get user progress for a chapter")
async def get_chapter_progress(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.get, path="/subjects/{subject_id}/my-progress", proxy=content_svc,
    summary="Get user progress for a subject/course")
async def get_subject_progress(request: Request, response: Response, subject_id: str):
    pass


# ── Info Pages (CMS: About/Contact/FAQ/Privacy/Terms/Refund/footer) ───────────

@rest_router(router.get, path="/info-pages", proxy=content_svc,
    summary="List all info/CMS pages")
async def list_info_pages(request: Request, response: Response):
    pass

@rest_router(router.get, path="/info-pages/{slug}", proxy=content_svc,
    summary="Get a single info/CMS page")
async def get_info_page(request: Request, response: Response, slug: str):
    pass

@rest_router(router.put, path="/info-pages/{slug}", proxy=content_svc,
    summary="[Admin] Create/update an info/CMS page")
async def upsert_info_page(request: Request, response: Response, slug: str):
    pass

@rest_router(router.delete, path="/info-pages/{slug}", proxy=content_svc, status_code=204,
    summary="[Admin] Delete an info/CMS page")
async def delete_info_page(request: Request, response: Response, slug: str):
    pass


# ── Previous Year Papers ──────────────────────────────────────────────────────

@rest_router(router.get, path="/previous-year-papers", proxy=content_svc,
    summary="List previous year papers (with filters)")
async def list_pyps(request: Request, response: Response):
    pass

@rest_router(router.post, path="/previous-year-papers", proxy=content_svc,
    summary="[Admin] Create a previous year paper")
async def create_pyp(request: Request, response: Response):
    pass

# Attempt routes are registered before the /{paper_id} ones so "attempts" is
# never matched as a paper id.

@rest_router(router.get, path="/previous-year-papers/attempts/mine", proxy=content_svc,
    summary="The caller's own previous-year-paper attempts")
async def list_my_pyp_attempts(request: Request, response: Response):
    pass

@rest_router(router.post, path="/previous-year-papers/{pyp_id}/attempts", proxy=content_svc, status_code=201,
    summary="Start a previous-year-paper attempt")
async def start_pyp_attempt(request: Request, response: Response, pyp_id: str):
    pass

@rest_router(router.patch, path="/previous-year-papers/attempts/{attempt_id}", proxy=content_svc,
    summary="Submit a previous-year-paper attempt")
async def submit_pyp_attempt(request: Request, response: Response, attempt_id: str):
    pass

@rest_router(router.put, path="/previous-year-papers/{paper_id}", proxy=content_svc,
    summary="[Admin] Update a previous year paper")
async def update_pyp(request: Request, response: Response, paper_id: str):
    pass

@rest_router(router.delete, path="/previous-year-papers/{paper_id}", proxy=content_svc,
    summary="[Admin] Delete a previous year paper")
async def delete_pyp(request: Request, response: Response, paper_id: str):
    pass


# ── Knowledge Hub ─────────────────────────────────────────────────────────────

@rest_router(router.get, path="/knowledge-categories", proxy=content_svc,
    summary="List knowledge categories")
async def list_knowledge_cats(request: Request, response: Response):
    pass

@rest_router(router.post, path="/knowledge-categories", proxy=content_svc,
    summary="[Admin] Create knowledge category")
async def create_knowledge_cat(request: Request, response: Response):
    pass

@rest_router(router.put, path="/knowledge-categories/{cat_id}", proxy=content_svc,
    summary="[Admin] Update knowledge category")
async def update_knowledge_cat(request: Request, response: Response, cat_id: str):
    pass

@rest_router(router.delete, path="/knowledge-categories/{cat_id}", proxy=content_svc,
    summary="[Admin] Delete knowledge category")
async def delete_knowledge_cat(request: Request, response: Response, cat_id: str):
    pass

@rest_router(router.get, path="/knowledge-articles", proxy=content_svc,
    summary="List knowledge articles")
async def list_knowledge_articles(request: Request, response: Response):
    pass

@rest_router(router.post, path="/knowledge-articles", proxy=content_svc,
    summary="[Admin] Create knowledge article")
async def create_knowledge_article(request: Request, response: Response):
    pass

@rest_router(router.put, path="/knowledge-articles/{article_id}", proxy=content_svc,
    summary="[Admin] Update knowledge article")
async def update_knowledge_article(request: Request, response: Response, article_id: str):
    pass

@rest_router(router.delete, path="/knowledge-articles/{article_id}", proxy=content_svc,
    summary="[Admin] Delete knowledge article")
async def delete_knowledge_article(request: Request, response: Response, article_id: str):
    pass

@rest_router(router.post, path="/knowledge-articles/{article_id}/view", proxy=content_svc,
    summary="Increment article view count")
async def view_knowledge_article(request: Request, response: Response, article_id: str):
    pass


# ── PYP Practice Questions ────────────────────────────────────────────────────

@rest_router(router.get, path="/pyp-practice-questions", proxy=content_svc,
    summary="List PYP practice questions by topic_name")
async def list_pyp_pqs(request: Request, response: Response):
    pass

@rest_router(router.post, path="/pyp-practice-questions", proxy=content_svc,
    summary="[Admin] Create PYP practice question")
async def create_pyp_pq(request: Request, response: Response):
    pass

@rest_router(router.post, path="/pyp-practice-questions/seed", proxy=content_svc,
    summary="[Admin] Seed default PYP practice questions")
async def seed_pyp_pqs(request: Request, response: Response):
    pass

@rest_router(router.put, path="/pyp-practice-questions/{qid}", proxy=content_svc,
    summary="[Admin] Update PYP practice question")
async def update_pyp_pq(request: Request, response: Response, qid: str):
    pass

@rest_router(router.delete, path="/pyp-practice-questions/{qid}", proxy=content_svc,
    summary="[Admin] Delete PYP practice question")
async def delete_pyp_pq(request: Request, response: Response, qid: str):
    pass


# ── Login-screen background images — admin-uploaded, one active at a time.
#    Must be registered BEFORE the /admin/{entity} catch-all below, or
#    "login-backgrounds" would be swallowed as entity="login-backgrounds". ──

@rest_router(router.get, path="/login-backgrounds/active", proxy=content_svc,
    summary="Get the currently active login-screen background")
async def get_active_login_background(request: Request, response: Response):
    pass

@rest_router(router.get, path="/login-backgrounds/{background_id}/image", proxy=content_svc,
    summary="Serve a login background's raw image bytes")
async def get_login_background_image(request: Request, response: Response, background_id: str):
    pass

@rest_router(router.get, path="/login-backgrounds", proxy=content_svc,
    summary="[Admin] List all uploaded login-screen backgrounds")
async def list_login_backgrounds(request: Request, response: Response):
    pass

@rest_router(router.post, path="/login-backgrounds", proxy=content_svc,
    summary="[Admin] Upload a new login-screen background (max 4, multipart)")
async def upload_login_background(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/login-backgrounds/{background_id}/activate", proxy=content_svc,
    summary="[Admin] Set a login background as the active one")
async def activate_login_background(request: Request, response: Response, background_id: str):
    pass

@rest_router(router.delete, path="/login-backgrounds/{background_id}", proxy=content_svc,
    summary="[Admin] Delete a login background")
async def delete_login_background(request: Request, response: Response, background_id: str):
    pass


# ── Admin curriculum management (boards / classes / subjects / chapters /
#    topics — full CRUD used by the admin panel). Catch-all forwarders keep
#    this file from needing an edit for every new admin entity. ─────────────────

@rest_router(router.get, path="/admin/{entity}", proxy=content_svc,
    summary="[Admin] List curriculum entities")
async def admin_list(request: Request, response: Response, entity: str):
    pass

@rest_router(router.post, path="/admin/{entity}", proxy=content_svc,
    summary="[Admin] Create a curriculum entity")
async def admin_create(request: Request, response: Response, entity: str):
    pass

@rest_router(router.put, path="/admin/{entity}/{item_id}", proxy=content_svc,
    summary="[Admin] Update a curriculum entity")
async def admin_update(request: Request, response: Response, entity: str, item_id: str):
    pass

@rest_router(router.delete, path="/admin/{entity}/{item_id}", proxy=content_svc,
    summary="[Admin] Delete a curriculum entity")
async def admin_delete(request: Request, response: Response, entity: str, item_id: str):
    pass

@rest_router(router.post, path="/seed-unlock", proxy=content_svc,
    summary="[Admin] Dev helper: unlock content progression")
async def seed_unlock(request: Request, response: Response):
    pass
