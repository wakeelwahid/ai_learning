from fastapi import Request, Response, APIRouter

from app.core.rest_router import rest_router
from app.services import user_svc
from app.schemas import CreateProfileRequest, UpdateProfileRequest

router = APIRouter(prefix="/api/v1/users", tags=["User Profiles"])


# ── Student profile ────────────────────────────────────────────────────────────

@rest_router(router.post, path="/profile", proxy=user_svc, status_code=201,
    summary="Create user profile")
async def create_profile(request: Request, response: Response, data: CreateProfileRequest):
    pass

@rest_router(router.get, path="/profile/{user_id}", proxy=user_svc,
    summary="Get user profile by user ID")
async def get_profile(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.patch, path="/profile/{user_id}", proxy=user_svc,
    summary="Update user profile (partial)")
async def update_profile(request: Request, response: Response, user_id: str, data: UpdateProfileRequest):
    pass

@rest_router(router.put, path="/profile/{user_id}", proxy=user_svc,
    summary="Update user profile (full replace)")
async def put_profile(request: Request, response: Response, user_id: str, data: UpdateProfileRequest):
    pass

@rest_router(router.post, path="/profile/avatar", proxy=user_svc,
    summary="Upload / replace the caller's profile photo (multipart)")
async def upload_avatar(request: Request, response: Response):
    pass

@rest_router(router.get, path="/avatar/{user_id}", proxy=user_svc,
    summary="Serve a user's uploaded profile photo (public)")
async def get_avatar(request: Request, response: Response, user_id: str):
    pass


# ── Parent-student links ───────────────────────────────────────────────────────

@rest_router(router.post, path="/parents/{parent_id}/students", proxy=user_svc, status_code=201,
    summary="Link a student to a parent")
async def link_student(request: Request, response: Response, parent_id: str):
    pass

@rest_router(router.get, path="/parents/{parent_id}/students", proxy=user_svc,
    summary="Get all students linked to a parent")
async def get_parent_students(request: Request, response: Response, parent_id: str):
    pass

@rest_router(router.get, path="/students/{student_id}/parents", proxy=user_svc,
    summary="Get all parent-link requests (pending and approved) for a student")
async def get_student_parents(request: Request, response: Response, student_id: str):
    pass

@rest_router(router.patch, path="/parents/links/{link_id}", proxy=user_svc,
    summary="Update a parent-student link")
async def update_parent_link(request: Request, response: Response, link_id: str):
    pass

@rest_router(router.delete, path="/parents/links/{link_id}", proxy=user_svc,
    summary="Remove a parent-student link")
async def delete_parent_link(request: Request, response: Response, link_id: str):
    pass


# ── Legacy ─────────────────────────────────────────────────────────────────────

@rest_router(router.post, path="/parent-link", proxy=user_svc,
    summary="Link a parent account to a student (legacy)")
async def link_parent(request: Request, response: Response):
    pass

@rest_router(router.get, path="/parent/{parent_user_id}/children", proxy=user_svc,
    summary="Get children linked to a parent account (legacy)")
async def get_children(request: Request, response: Response, parent_user_id: str):
    pass


# ── Study time limits ──────────────────────────────────────────────────────────

@rest_router(router.get, path="/parent/study-limits/{child_id}", proxy=user_svc,
    summary="Get study-time limit for a child")
async def get_study_limit(request: Request, response: Response, child_id: str):
    pass

@rest_router(router.put, path="/parent/study-limits/{child_id}", proxy=user_svc,
    summary="Upsert study-time limit for a child")
async def set_study_limit(request: Request, response: Response, child_id: str):
    pass


# ── Messages (parent-to-student) ──────────────────────────────────────────────

@rest_router(router.get, path="/messages/threads", proxy=user_svc,
    summary="List conversation threads for the authenticated user")
async def get_message_threads(request: Request, response: Response):
    pass

@rest_router(router.get, path="/messages/unread-count", proxy=user_svc,
    summary="Get unread message count for the authenticated user")
async def get_unread_count(request: Request, response: Response):
    pass

@rest_router(router.get, path="/messages/thread/{other_user_id}", proxy=user_svc,
    summary="Get/poll message thread between two users")
async def get_thread(request: Request, response: Response, other_user_id: str):
    pass

@rest_router(router.post, path="/messages/send", proxy=user_svc, status_code=201,
    summary="Send a message to another user")
async def send_message(request: Request, response: Response):
    pass


# ── Chat routes ────────────────────────────────────────────────────────────────

@rest_router(router.get, path="/chat/search", proxy=user_svc,
    summary="Search users for chat")
async def chat_search(request: Request, response: Response):
    pass

@rest_router(router.post, path="/chat/friend-requests", proxy=user_svc, status_code=201,
    summary="Send a friend request")
async def send_friend_request(request: Request, response: Response):
    pass

@rest_router(router.get, path="/chat/friend-requests/count", proxy=user_svc,
    summary="Pending friend-request badge count (Redis-cached)")
async def count_friend_requests(request: Request, response: Response):
    pass

@rest_router(router.get, path="/chat/friend-requests", proxy=user_svc,
    summary="List friend requests (incoming or outgoing)")
async def list_friend_requests(request: Request, response: Response):
    pass

@rest_router(router.delete, path="/chat/friend-requests/{request_id}", proxy=user_svc,
    summary="Cancel a pending friend request you sent")
async def cancel_friend_request(request: Request, response: Response, request_id: str):
    pass

@rest_router(router.patch, path="/chat/friend-requests/{request_id}", proxy=user_svc,
    summary="Accept or decline a friend request")
async def update_friend_request(request: Request, response: Response, request_id: str):
    pass

@rest_router(router.get, path="/chat/rooms", proxy=user_svc,
    summary="List chat rooms for the authenticated user")
async def list_chat_rooms(request: Request, response: Response):
    pass

@rest_router(router.post, path="/chat/rooms/group", proxy=user_svc, status_code=201,
    summary="Create a group chat room")
async def create_group_room(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/chat/rooms/{room_id}", proxy=user_svc,
    summary="Rename a group (admin only)")
async def rename_group(request: Request, response: Response, room_id: str):
    pass

@rest_router(router.delete, path="/chat/rooms/{room_id}", proxy=user_svc,
    summary="Delete a group (group admin or platform admin)")
async def delete_group(request: Request, response: Response, room_id: str):
    pass

@rest_router(router.delete, path="/chat/rooms/{room_id}/members/{member_id}", proxy=user_svc,
    summary="Remove a member / leave a group")
async def remove_group_member(request: Request, response: Response, room_id: str, member_id: str):
    pass

@rest_router(router.post, path="/chat/rooms/{room_id}/members", proxy=user_svc, status_code=201,
    summary="Add a member to a chat room")
async def add_room_member(request: Request, response: Response, room_id: str):
    pass

@rest_router(router.get, path="/chat/rooms/{room_id}/messages", proxy=user_svc,
    summary="Get messages in a chat room")
async def get_room_messages(request: Request, response: Response, room_id: str):
    pass

@rest_router(router.post, path="/chat/rooms/{room_id}/messages", proxy=user_svc, status_code=201,
    summary="Send a message to a chat room")
async def send_room_message(request: Request, response: Response, room_id: str):
    pass

@rest_router(router.post, path="/chat/rooms/{room_id}/read", proxy=user_svc,
    summary="Mark messages in a chat room as read")
async def mark_room_read(request: Request, response: Response, room_id: str):
    pass

@rest_router(router.get, path="/chat/parent/monitor/{child_user_id}", proxy=user_svc,
    summary="Parent: monitor child chat activity")
async def parent_monitor_child(request: Request, response: Response, child_user_id: str):
    pass

@rest_router(router.get, path="/chat/parent/monitor/{child_user_id}/rooms/{room_id}", proxy=user_svc,
    summary="Parent: view child chat room messages")
async def parent_monitor_child_room(request: Request, response: Response, child_user_id: str, room_id: str):
    pass


# ── Reactions ──────────────────────────────────────────────────────────────────

@rest_router(router.post, path="/chat/messages/{message_id}/reactions", proxy=user_svc,
    summary="Toggle a reaction on a message")
async def toggle_reaction(request: Request, response: Response, message_id: str):
    pass

@rest_router(router.get, path="/chat/messages/{message_id}/reactions", proxy=user_svc,
    summary="Get reactions for a message")
async def get_reactions(request: Request, response: Response, message_id: str):
    pass


# ── Moderation: abuse reports ───────────────────────────────────────────────

@rest_router(router.post, path="/chat/reports", proxy=user_svc, status_code=201,
    summary="File an abuse report against a message, room, battle opponent, or user")
async def create_report(request: Request, response: Response):
    pass

@rest_router(router.get, path="/chat/admin/reports", proxy=user_svc,
    summary="[Admin] List moderation reports")
async def admin_list_reports(request: Request, response: Response):
    pass

@rest_router(router.post, path="/chat/admin/reports/{report_id}/resolve", proxy=user_svc,
    summary="[Admin] Resolve a moderation report (dismiss/warn/mute/deactivate)")
async def admin_resolve_report(request: Request, response: Response, report_id: str):
    pass


# ── Parent utilities ───────────────────────────────────────────────────────────

@rest_router(router.post, path="/parent/link-student", proxy=user_svc, status_code=201,
    summary="Link a student to a parent account")
async def parent_link_student(request: Request, response: Response):
    pass

@rest_router(router.post, path="/parent/study-limit/{child_id}", proxy=user_svc, status_code=201,
    summary="Set study-time limit for a child")
async def post_study_limit(request: Request, response: Response, child_id: str):
    pass

@rest_router(router.get, path="/study-time/{user_id}", proxy=user_svc,
    summary="Get study time for a user")
async def get_study_time(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/parent/student-progress/{student_id}", proxy=user_svc,
    summary="Get progress report for a student (parent view)")
async def get_student_progress(request: Request, response: Response, student_id: str):
    pass


# ── Parent approval requests (purchase sign-off) ───────────────────────────────

@rest_router(router.get, path="/parent-approvals/required", proxy=user_svc,
    summary="Student: does a purchase need parent approval, and from whom")
async def parent_approvals_required(request: Request, response: Response):
    pass

@rest_router(router.post, path="/parent-approvals", proxy=user_svc, status_code=201,
    summary="Student: request parent approval for a purchase")
async def create_parent_approval(request: Request, response: Response):
    pass

@rest_router(router.get, path="/parent-approvals/mine", proxy=user_svc,
    summary="Student: my approval requests")
async def my_parent_approvals(request: Request, response: Response):
    pass

@rest_router(router.get, path="/parent-approvals/pending", proxy=user_svc,
    summary="Parent: approval requests awaiting my decision")
async def pending_parent_approvals(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/parent-approvals/{approval_id}", proxy=user_svc,
    summary="Parent: approve or decline a purchase request")
async def decide_parent_approval(request: Request, response: Response, approval_id: str):
    pass


# ── Link badges ────────────────────────────────────────────────────────────────

@rest_router(router.get, path="/me/link-badges", proxy=user_svc,
    summary="Pending link / approval counts for the caller")
async def link_badges(request: Request, response: Response):
    pass


# ── Parent-teacher meetings ────────────────────────────────────────────────────

@rest_router(router.post, path="/meetings", proxy=user_svc, status_code=201,
    summary="Parent: request a meeting")
async def create_meeting(request: Request, response: Response):
    pass

@rest_router(router.get, path="/meetings/mine", proxy=user_svc,
    summary="Parent: my meeting requests")
async def my_meetings(request: Request, response: Response):
    pass

@rest_router(router.get, path="/meetings", proxy=user_svc,
    summary="Admin: list meeting requests")
async def list_meetings(request: Request, response: Response):
    pass

@rest_router(router.delete, path="/meetings/{meeting_id}", proxy=user_svc,
    summary="Parent: cancel a meeting request")
async def cancel_meeting(request: Request, response: Response, meeting_id: str):
    pass

@rest_router(router.patch, path="/meetings/{meeting_id}", proxy=user_svc,
    summary="Admin: confirm / decline / complete a meeting request")
async def update_meeting(request: Request, response: Response, meeting_id: str):
    pass


# ── Admin ──────────────────────────────────────────────────────────────────────

@rest_router(router.get, path="/admin/all", proxy=user_svc,
    summary="Admin: list all users")
async def admin_get_all_users(request: Request, response: Response):
    pass
