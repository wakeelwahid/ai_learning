from fastapi import Request, Response, APIRouter

from app.core.rest_router import rest_router
from app.services import quiz_svc
from app.schemas import QuizResponse, QuizCreateRequest, AttemptResponse, StartAttemptRequest

router = APIRouter(prefix="/api/v1/quizzes", tags=["Quizzes"])


# ── Admin routes FIRST (before wildcard /{quiz_id}) ───────────────────────────

@rest_router(router.get, path="/admin/list", proxy=quiz_svc,
    summary="[Admin] List all quizzes")
async def admin_list_quizzes(request: Request, response: Response):
    pass

@rest_router(router.get, path="/admin/stats", proxy=quiz_svc,
    summary="[Admin] Quiz statistics")
async def admin_quiz_stats(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/admin/{quiz_id}", proxy=quiz_svc,
    summary="[Admin] Update quiz metadata by admin path")
async def admin_update_quiz(request: Request, response: Response, quiz_id: str):
    pass

@rest_router(router.delete, path="/admin/{quiz_id}", proxy=quiz_svc,
    summary="[Admin] Delete a quiz by admin path")
async def admin_delete_quiz(request: Request, response: Response, quiz_id: str):
    pass

@rest_router(router.post, path="", proxy=quiz_svc,
    summary="[Admin] Create a new quiz")
async def create_quiz(request: Request, response: Response, data: QuizCreateRequest):
    pass

@rest_router(router.post, path="/questions", proxy=quiz_svc,
    summary="[Admin] Add a single question")
async def create_question(request: Request, response: Response):
    pass

@rest_router(router.post, path="/questions/{question_id}/view", proxy=quiz_svc,
    summary="[Redis] Increment question view count")
async def record_view(request: Request, response: Response, question_id: str):
    pass


# ── Quiz catalog ──────────────────────────────────────────────────────────────

@rest_router(router.get, path="", proxy=quiz_svc,
    summary="List quizzes (admin/general)")
async def list_quizzes(request: Request, response: Response):
    pass

@rest_router(router.get, path="/random", proxy=quiz_svc,
    summary="Pick one quiz for the caller's board & class")
async def random_quiz(request: Request, response: Response):
    pass

@rest_router(router.get, path="/attempts/user/{user_id}", proxy=quiz_svc,
    summary="Get all attempts for a user")
async def user_attempts(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/chapter/{chapter_id}", proxy=quiz_svc,
    summary="List quizzes for a chapter")
async def chapter_quizzes(request: Request, response: Response, chapter_id: str):
    pass

@rest_router(router.get, path="/board/{board}/{class_num}/{subject}/{chapter}", proxy=quiz_svc,
    summary="[Redis] Questions by board/class/subject/chapter")
async def questions_by_board(request: Request, response: Response, board: str, class_num: int, subject: str, chapter: str):
    pass

@rest_router(router.get, path="/popular-questions", proxy=quiz_svc,
    summary="[Redis] Trending questions sorted set")
async def popular_questions(request: Request, response: Response):
    pass

@rest_router(router.get, path="/pyps", proxy=quiz_svc,
    summary="Previous-year (mock-test) quizzes for a chapter")
async def chapter_pyps(request: Request, response: Response):
    pass

@rest_router(router.get, path="/chapter-score", proxy=quiz_svc,
    summary="Caller's best completed quiz score across a chapter")
async def chapter_score(request: Request, response: Response):
    pass

@rest_router(router.get, path="/leaderboard/subject/{board}/{class_num}/{subject_id}", proxy=quiz_svc,
    summary="[Redis] Per-subject leaderboard within one board+class")
async def subject_leaderboard(request: Request, response: Response, board: str, class_num: int, subject_id: str):
    pass

@rest_router(router.get, path="/leaderboard/{class_num}", proxy=quiz_svc,
    summary="[Redis] Class leaderboard sorted set")
async def leaderboard(request: Request, response: Response, class_num: int):
    pass

@rest_router(router.get, path="/student/{student_id}/progress", proxy=quiz_svc,
    summary="[Redis] Student progress summary")
async def student_progress(request: Request, response: Response, student_id: str):
    pass

@rest_router(router.get, path="/student/{student_id}/weak-topics", proxy=quiz_svc,
    summary="[Redis] Student weak topics list")
async def student_weak_topics(request: Request, response: Response, student_id: str):
    pass


# ── Attempt lifecycle (before /{quiz_id} wildcard) ────────────────────────────

@rest_router(router.post, path="/attempts/start", proxy=quiz_svc,
    summary="Start a new quiz attempt")
async def start_attempt(request: Request, response: Response, data: StartAttemptRequest):
    pass

@rest_router(router.post, path="/attempts/answer", proxy=quiz_svc,
    summary="Submit a single answer (Redis-validated)")
async def submit_answer(request: Request, response: Response):
    pass

@rest_router(router.post, path="/attempts/batch-submit", proxy=quiz_svc,
    summary="[Redis-first] Submit all answers at once")
async def batch_submit(request: Request, response: Response):
    pass

@rest_router(router.post, path="/attempts/submit", proxy=quiz_svc,
    summary="Finalize an attempt and receive the score")
async def submit_quiz(request: Request, response: Response):
    pass

@rest_router(router.put, path="/attempts/{attempt_id}/state", proxy=quiz_svc,
    summary="[Redis] Save quiz state (pause)")
async def save_attempt_state(request: Request, response: Response, attempt_id: str):
    pass

@rest_router(router.get, path="/attempts/{attempt_id}/state", proxy=quiz_svc,
    summary="[Redis] Get saved quiz state (resume check)")
async def get_attempt_state(request: Request, response: Response, attempt_id: str):
    pass

@rest_router(router.get, path="/attempts/{attempt_id}", proxy=quiz_svc,
    summary="Get result of a completed attempt")
async def get_attempt(request: Request, response: Response, attempt_id: str):
    pass


# ── Single quiz (wildcard — must come last) ───────────────────────────────────

@rest_router(router.get, path="/{quiz_id}/questions", proxy=quiz_svc,
    summary="[Redis] List all questions in a quiz")
async def get_questions(request: Request, response: Response, quiz_id: str):
    pass

@rest_router(router.post, path="/{quiz_id}/questions/bulk", proxy=quiz_svc,
    summary="[Admin] Bulk-add questions + trigger cache rebuild")
async def bulk_questions(request: Request, response: Response, quiz_id: str):
    pass

@rest_router(router.get, path="/{quiz_id}", proxy=quiz_svc,
    summary="Get a single quiz")
async def get_quiz(request: Request, response: Response, quiz_id: str):
    pass

@rest_router(router.delete, path="/{quiz_id}", proxy=quiz_svc,
    summary="[Admin] Delete a quiz")
async def delete_quiz(request: Request, response: Response, quiz_id: str):
    pass
