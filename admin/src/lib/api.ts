import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { store, persistor } from "@/store";
import { logout, setTokens } from "@/store/auth";

const _doLogout = () => {
  store.dispatch(logout());
  persistor.purge();
  window.location.href = "/login";
};

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export const api: AxiosInstance = axios.create({
  baseURL: BASE,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((cfg) => {
  const token = store.getState().auth.token;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

let _refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean };
    // Never intercept 401 from the login endpoint — wrong credentials should
    // surface as a normal error, not trigger a window.location redirect.
    const isLoginCall = original.url?.includes("/auth/login");
    if (err.response?.status === 401 && !original._retry && !isLoginCall) {
      original._retry = true;
      const refreshToken = store.getState().auth.refreshToken;
      if (refreshToken) {
        if (!_refreshing) {
          _refreshing = axios
            .post(`${BASE}/v1/auth/refresh`, { refresh_token: refreshToken })
            .then((res) => {
              store.dispatch(setTokens({ access: res.data.access_token, refresh: res.data.refresh_token }));
              return res.data.access_token as string;
            })
            .catch(() => {
              _doLogout();
              return null;
            })
            .finally(() => { _refreshing = null; });
        }
        const newToken = await _refreshing;
        if (newToken) {
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
      } else {
        store.dispatch(logout());
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/v1/auth/login", { identifier: email, password }),
  me: () => api.get("/v1/auth/me"),
  /** @deprecated Use getUsers */
  users: (params?: { role?: string; is_active?: boolean; page?: number; limit?: number }) =>
    api.get("/v1/auth/users", { params }),
  /** Fetch the user list with optional filters */
  getUsers: (params?: { role?: string; is_active?: boolean; search?: string; page?: number; limit?: number }) =>
    api.get("/v1/auth/users", { params }),
  /** Partially update a user (role, is_active, etc.) */
  patchUser: (userId: string, data: { role?: string; is_active?: boolean }) =>
    api.patch(`/v1/auth/users/${userId}`, data),
  /** @deprecated Use patchUser */
  toggleActive: (userId: string, isActive: boolean) =>
    api.patch(`/v1/auth/users/${userId}`, { is_active: isActive }),
  /** @deprecated Use patchUser */
  updateUserRole: (userId: string, role: string) =>
    api.patch(`/v1/auth/users/${userId}`, { role }),
  /** Create a teacher account — teachers have no self-service sign-up */
  createTeacher: (data: { phone: string; full_name: string; email?: string; school_name?: string }) =>
    api.post("/v1/auth/admin/teachers", data),
};

// ─── Content ──────────────────────────────────────────────────────────────────
export const contentApi = {
  // Curriculum hierarchy
  boards:   () => api.get("/v1/content/boards"),
  classes:  (boardId: string)   => api.get(`/v1/content/boards/${boardId}/classes`),
  subjects: (classId: string)   => api.get(`/v1/content/classes/${classId}/subjects`),
  chapters: (subjectId: string) => api.get(`/v1/content/subjects/${subjectId}/chapters`),
  topics:   (chapterId: string) => api.get(`/v1/content/chapters/${chapterId}/topics`),
  videos:   (topicId: string)   => api.get(`/v1/content/topics/${topicId}/videos`),
  notes:    (chapterId: string) => api.get(`/v1/content/chapters/${chapterId}/notes`),

  // Legacy creation
  createBoard:   (data: object) => api.post("/v1/content/boards", data),
  createClass:   (data: object) => api.post("/v1/content/classes", data),
  createSubject: (data: object) => api.post("/v1/content/subjects", data),
  createChapter: (data: object) => api.post("/v1/content/chapters", data),
  createVideo:   (data: object) => api.post("/v1/content/videos", data),
  createTopic:   (data: object) => api.post("/v1/content/topics", data),
  updateChapter: (id: string, data: object) => api.put(`/v1/content/chapters/${id}`, data),
  deleteChapter: (id: string) => api.delete(`/v1/content/chapters/${id}`),
  deleteVideo:   (id: string) => api.delete(`/v1/content/videos/${id}`),
  chapterVideos: (chapterId: string) => api.get(`/v1/content/chapters/${chapterId}/all-videos`),
  createChapterVideo: (chapterId: string, data: object) => api.post(`/v1/content/chapters/${chapterId}/videos`, data),
  seedDemo:      () => api.post("/v1/content/seed-demo"),
  seedExercises: () => api.post("/v1/content/seed-exercises"),

  // ── Exercises (optional layer between Chapter and Question) ─────────────────
  chapterExercises: (chapterId: string) => api.get(`/v1/content/chapters/${chapterId}/exercises`),
  createExercise:   (data: object)      => api.post("/v1/content/exercises", data),
  deleteExercise:   (id: string)        => api.delete(`/v1/content/exercises/${id}`),

  // ── Questions ───────────────────────────────────────────────────────────────
  exerciseQuestions:     (exerciseId: string) => api.get(`/v1/content/exercises/${exerciseId}/questions`),
  chapterDirectQuestions:(chapterId: string)  => api.get(`/v1/content/chapters/${chapterId}/questions`),
  createQuestion:        (data: object)       => api.post("/v1/content/questions", data),
  deleteQuestion:        (id: string)         => api.delete(`/v1/content/questions/${id}`),

  // ── Question Video (optional) ────────────────────────────────────────────────
  getQuestionVideo:    (questionId: string)               => api.get(`/v1/content/questions/${questionId}/video`),
  setQuestionVideo:    (questionId: string, data: object) => api.post(`/v1/content/questions/${questionId}/video`, data),
  deleteQuestionVideo: (questionId: string)               => api.delete(`/v1/content/questions/${questionId}/video`),

  // ── Practice Questions / Quiz (optional) ─────────────────────────────────────
  questionPractice:        (questionId: string) => api.get(`/v1/content/questions/${questionId}/practice`),
  createPracticeQuestion:  (data: object)       => api.post("/v1/content/practice-questions", data),
  deletePracticeQuestion:  (id: string)         => api.delete(`/v1/content/practice-questions/${id}`),

  // ── Assignments ───────────────────────────────────────────────────────────────
  listAssignments: (params?: { mine_only?: boolean; limit?: number; offset?: number }) =>
    api.get("/v1/content/assignments", { params }),
  createAssignment: (data: {
    title: string; description?: string; entity_type: "chapter" | "exercise";
    entity_id: string; student_ids: string[]; due_at?: string;
  }) => api.post("/v1/content/assignments", data),
};

// ─── Login-screen background images (max 4, one active) ──────────────────────
export const loginBackgroundsApi = {
  list: () => api.get("/v1/content/login-backgrounds"),
  upload: (formData: FormData) =>
    api.post("/v1/content/login-backgrounds", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  activate: (id: string) => api.patch(`/v1/content/login-backgrounds/${id}/activate`),
  remove: (id: string) => api.delete(`/v1/content/login-backgrounds/${id}`),
  imageUrl: (id: string) => `${api.defaults.baseURL}/v1/content/login-backgrounds/${id}/image`,
};

// ─── Curriculum Admin (full CRUD on boards/classes/subjects/chapters/topics) ──
// Mirrors content_service's /admin/{entity} routes (proxied verbatim by the
// gateway's generic admin_list/admin_create/admin_update/admin_delete
// forwarders in api_gateway/app/routes/content.py).
export const curriculumAdminApi = {
  // Boards
  listBoards: (includeInactive = false) =>
    api.get("/v1/content/admin/boards", { params: { include_inactive: includeInactive } }),
  createBoard: (data: { name: string; code: string }) =>
    api.post("/v1/content/admin/boards", data),
  updateBoard: (id: string, data: { name?: string; code?: string; is_active?: boolean }) =>
    api.put(`/v1/content/admin/boards/${id}`, data),
  deleteBoard: (id: string) => api.delete(`/v1/content/admin/boards/${id}`),

  // Classes
  listClasses: (boardId?: string, includeInactive = false) =>
    api.get("/v1/content/admin/classes", { params: { board_id: boardId, include_inactive: includeInactive } }),
  createClass: (data: { board_id: string; name: string; number: number }) =>
    api.post("/v1/content/admin/classes", data),
  updateClass: (id: string, data: { name?: string; number?: number; is_active?: boolean }) =>
    api.put(`/v1/content/admin/classes/${id}`, data),
  deleteClass: (id: string) => api.delete(`/v1/content/admin/classes/${id}`),

  // Subjects
  listSubjects: (classId?: string, includeInactive = false) =>
    api.get("/v1/content/admin/subjects", { params: { class_id: classId, include_inactive: includeInactive } }),
  createSubject: (data: { class_id: string; name: string; code: string; icon_url?: string | null }) =>
    api.post("/v1/content/admin/subjects", data),
  updateSubject: (id: string, data: { name?: string; code?: string; icon_url?: string | null; is_active?: boolean }) =>
    api.put(`/v1/content/admin/subjects/${id}`, data),
  deleteSubject: (id: string) => api.delete(`/v1/content/admin/subjects/${id}`),

  // Chapters
  listChapters: (subjectId?: string, includeInactive = false) =>
    api.get("/v1/content/admin/chapters", { params: { subject_id: subjectId, include_inactive: includeInactive } }),
  createChapter: (data: { subject_id: string; title: string; description?: string | null; sequence?: number }) =>
    api.post("/v1/content/admin/chapters", data),
  updateChapter: (id: string, data: { title?: string; description?: string | null; sequence?: number; is_active?: boolean }) =>
    api.put(`/v1/content/admin/chapters/${id}`, data),
  deleteChapter: (id: string) => api.delete(`/v1/content/admin/chapters/${id}`),

  // Topics
  listTopics: (chapterId?: string, includeInactive = false) =>
    api.get("/v1/content/admin/topics", { params: { chapter_id: chapterId, include_inactive: includeInactive } }),
  createTopic: (data: { chapter_id: string; title: string; description?: string | null; sequence?: number; difficulty?: "easy" | "medium" | "hard" }) =>
    api.post("/v1/content/admin/topics", data),
  updateTopic: (id: string, data: { title?: string; description?: string | null; sequence?: number; difficulty?: "easy" | "medium" | "hard"; is_active?: boolean }) =>
    api.put(`/v1/content/admin/topics/${id}`, data),
  deleteTopic: (id: string) => api.delete(`/v1/content/admin/topics/${id}`),
};

// ─── Info / CMS Pages ───────────────────────────────────────────────────────────
export const infoPageApi = {
  list:   () => api.get("/v1/content/info-pages?include_unpublished=true"),
  get:    (slug: string) => api.get(`/v1/content/info-pages/${slug}`),
  upsert: (slug: string, data: { title: string; content: string; data?: object | null; is_published?: boolean }) =>
    api.put(`/v1/content/info-pages/${slug}`, data),
  remove: (slug: string) => api.delete(`/v1/content/info-pages/${slug}`),
};

// ─── Quiz ─────────────────────────────────────────────────────────────────────
export const quizApi = {
  chapterQuizzes: (chapterId: string) => api.get(`/v1/quizzes/chapter/${chapterId}`),
  questions: (quizId: string) => api.get(`/v1/quizzes/${quizId}/questions`),
  createQuiz: (data: object) => api.post("/v1/quizzes", data),
  createQuestion: (data: object) => api.post("/v1/quizzes/questions", data),
  adminList: (params?: { quiz_type?: string; page?: number; limit?: number }) =>
    api.get("/v1/quizzes/admin/list", { params }),
  adminStats: () => api.get("/v1/quizzes/admin/stats"),
  adminDelete: (quizId: string) => api.delete(`/v1/quizzes/admin/${quizId}`),
  adminUpdate: (quizId: string, data: object) => api.patch(`/v1/quizzes/admin/${quizId}`, data),
  bulkCreateQuestions: (quizId: string, questions: object[]) =>
    api.post(`/v1/quizzes/${quizId}/questions/bulk`, { questions }),
};

// ─── Analytics ────────────────────────────────────────────────────────────────
export const analyticsApi = {
  adminOverview: () => api.get("/v1/analytics/admin/overview"),
  studentDashboard: (userId: string) => api.get(`/v1/analytics/student/${userId}/dashboard`),
  // Admins are explicitly allowed through the same route parents use
  // (backend's role check bypasses the parent-link verification for
  // admin/super_admin) — one endpoint, one cache, no separate admin-only
  // re-derivation to keep in sync.
  studentSummary: (userId: string, days: 1 | 7 | 30 | 90 | 365 = 7) =>
    api.get(`/v1/analytics/parent/student/${userId}/summary`, { params: { days } }),
  weeklyEngagement: () => api.get("/v1/analytics/admin/weekly-engagement"),
  adminRevenue: () => api.get("/v1/analytics/admin/revenue"),
  adminEngagementTrends: (days = 7) => api.get(`/v1/analytics/admin/engagement?days=${days}`),
  adminDailyActive: (days = 7) => api.get(`/v1/analytics/admin/daily-active?days=${days}`),
  adminBattleStats: () => api.get("/v1/analytics/admin/battle-stats"),
  // Gateway-native routes (no /v1 prefix — not proxied to a backing
  // service, implemented directly in api_gateway/app/router.py). Still
  // reached through the same /api → api_gateway:8000 nginx proxy as
  // everything else, just without the /v1/<service> segment other calls add.
  serviceHealth: () => api.get("/health/services"),
  metricsSummary: () => api.get("/health/metrics-summary"),
};

// ─── Payments ─────────────────────────────────────────────────────────────────
export const paymentApi = {
  subscription: (userId: string) => api.get(`/v1/payments/subscription/${userId}`),
  adminSubscriptions: (params?: { status?: string; plan?: string; page?: number }) =>
    api.get("/v1/payments/admin/subscriptions", { params }),
  adminRevenue: () => api.get("/v1/payments/admin/revenue"),
  adminDailyRevenue: (days = 7) => api.get(`/v1/payments/admin/revenue/daily?days=${days}`),
  adminListPayments: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get("/v1/payments/admin/payments", { params }),
  adminRefundPayment: (paymentId: string, reason?: string) =>
    api.post(`/v1/payments/admin/payments/${paymentId}/refund`, { reason }),
  adminEffectiveStatusBatch: (userIds: string[]) =>
    api.post("/v1/payments/admin/subscriptions/effective-batch", { user_ids: userIds }),
};

// ─── Audit logs (merged across the services that write one) ──────────────────
export const auditLogApi = {
  listAuth: (params?: { action?: string; resource_type?: string; page?: number; limit?: number }) =>
    api.get("/v1/auth/admin/audit-logs", { params }),
  listPayment: (params?: { action?: string; resource_type?: string; page?: number; limit?: number }) =>
    api.get("/v1/payments/admin/audit-logs", { params }),
};

// ─── Moderation (chat/battle abuse reports) ───────────────────────────────────
export const moderationApi = {
  listReports: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get("/v1/users/chat/admin/reports", { params }),
  resolveReport: (reportId: string, data: { action: string; note?: string; mute_hours?: number }) =>
    api.post(`/v1/users/chat/admin/reports/${reportId}/resolve`, data),
};

// ─── Contact Us inbox ─────────────────────────────────────────────────────────
export const contactApi = {
  list: (params?: { is_read?: boolean; page?: number; limit?: number }) =>
    api.get("/v1/notifications/admin/contact-messages", { params }),
  unreadCount: () => api.get("/v1/notifications/admin/contact-messages/unread-count"),
  markRead: (id: string, isRead: boolean = true) =>
    api.patch(`/v1/notifications/admin/contact-messages/${id}`, { is_read: isRead }),
};

// ─── Coupons ──────────────────────────────────────────────────────────────────
export const couponApi = {
  list: () => api.get("/v1/payments/coupons"),
  create: (data: object) => api.post("/v1/payments/coupons", data),
  toggle: (id: string, isActive: boolean) =>
    api.patch(`/v1/payments/coupons/${id}`, { is_active: isActive }),
  delete: (id: string) => api.delete(`/v1/payments/coupons/${id}`),
};

// ─── Plans (dynamic, admin-managed) ────────────────────────────────────────────
export const planApi = {
  list: () => api.get("/v1/payments/admin/plans"),
  create: (data: object) => api.post("/v1/payments/admin/plans", data),
  update: (id: string, data: object) => api.patch(`/v1/payments/admin/plans/${id}`, data),
  delete: (id: string) => api.delete(`/v1/payments/admin/plans/${id}`),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationApi = {
  sendEmail: (data: object) => api.post("/v1/notifications/email", data),
  getUserNotifications: (userId: string) =>
    api.get(`/v1/notifications/user/${userId}`),
  broadcast: (data: object) => api.post("/v1/notifications/broadcast", data),
  triggerStreakReminder: () => api.post("/v1/notifications/admin/trigger-streak-reminder"),
  triggerWeeklyReport: () => api.post("/v1/notifications/admin/trigger-weekly-report"),
  triggerParentSummary: () => api.post("/v1/notifications/admin/trigger-parent-summary"),
};

// ─── Meetings (parent ↔ admin meeting requests) ───────────────────────────────
export type MeetingStatus = "pending" | "confirmed" | "declined" | "completed" | "cancelled";

export interface MeetingRequest {
  id: string;
  parent_user_id: string;
  parent_name: string | null;
  student_user_id: string;
  student_name: string | null;
  preferred_at: string;
  topic: string;
  notes: string | null;
  status: MeetingStatus;
  scheduled_at: string | null;
  meeting_link: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingUpdate {
  status?: "confirmed" | "declined" | "completed";
  scheduled_at?: string;
  meeting_link?: string;
  admin_note?: string;
}

export const meetingsApi = {
  list: (params?: { status?: MeetingStatus; limit?: number; offset?: number }) =>
    api.get("/v1/users/meetings", { params }),
  update: (id: string, data: MeetingUpdate) =>
    api.patch(`/v1/users/meetings/${id}`, data),
};

// ─── Maintenance ──────────────────────────────────────────────────────────────
export const maintenanceApi = {
  get: () => api.get("/v1/notifications/maintenance"),
  set: (data: {
    is_active: boolean; title?: string; message?: string;
    ends_at?: string | null; updated_by?: string;
  }) => api.post("/v1/notifications/maintenance", data),
};

// ─── Announcements ────────────────────────────────────────────────────────────
export const announcementApi = {
  list: (activeOnly = false) =>
    api.get("/v1/notifications/announcements", { params: { active_only: activeOnly } }),
  create: (data: {
    title: string; body: string; type: string; link_url?: string;
    image_url?: string; release_date?: string; expires_at?: string;
    is_active?: boolean; is_pinned?: boolean; created_by?: string;
  }) => api.post("/v1/notifications/announcements", data),
  update: (id: string, data: Partial<{
    title: string; body: string; type: string; link_url: string;
    image_url: string; release_date: string; expires_at: string;
    is_active: boolean; is_pinned: boolean;
  }>) => api.put(`/v1/notifications/announcements/${id}`, data),
  delete: (id: string) => api.delete(`/v1/notifications/announcements/${id}`),
};

// ─── Gamification ─────────────────────────────────────────────────────────────
export const gamificationApi = {
  leaderboard: (limit = 20) => api.get(`/v1/gamification/leaderboard?limit=${limit}`),
  profile: (userId: string) => api.get(`/v1/gamification/profile/${userId}`),
  awardXP: (data: object) => api.post("/v1/gamification/xp/award", data),
  createChallenge: (data: object) => api.post("/v1/gamification/challenges/admin/create", data),
  todayChallenge: () => api.get("/v1/gamification/challenges/today"),
};

// ─── Challenge Programs (multi-day, mixed-task-type) ─────────────────────────
export const challengeProgramApi = {
  adminList: () => api.get("/v1/gamification/challenge-programs/admin"),
  adminGet: (id: string) => api.get(`/v1/gamification/challenge-programs/admin/${id}`),
  adminCreate: (data: object) => api.post("/v1/gamification/challenge-programs/admin", data),
  adminUpdate: (id: string, data: object) => api.patch(`/v1/gamification/challenge-programs/admin/${id}`, data),
  adminAddDay: (programId: string, data: { day_number: number; title?: string }) =>
    api.post(`/v1/gamification/challenge-programs/admin/${programId}/days`, data),
  adminDeleteDay: (dayId: string) => api.delete(`/v1/gamification/challenge-programs/admin/days/${dayId}`),
  adminAddTask: (dayId: string, data: object) =>
    api.post(`/v1/gamification/challenge-programs/admin/days/${dayId}/tasks`, data),
  adminUpdateTask: (taskId: string, data: object) =>
    api.patch(`/v1/gamification/challenge-programs/admin/tasks/${taskId}`, data),
  adminDeleteTask: (taskId: string) => api.delete(`/v1/gamification/challenge-programs/admin/tasks/${taskId}`),
  adminPublish: (id: string) => api.post(`/v1/gamification/challenge-programs/admin/${id}/publish`),
  adminUnpublish: (id: string) => api.post(`/v1/gamification/challenge-programs/admin/${id}/unpublish`),
  adminArchive: (id: string) => api.post(`/v1/gamification/challenge-programs/admin/${id}/archive`),
  adminDelete: (id: string) => api.delete(`/v1/gamification/challenge-programs/admin/${id}`),
  adminAnalytics: (id: string) => api.get(`/v1/gamification/challenge-programs/admin/${id}/analytics`),
};

// ─── Referral ─────────────────────────────────────────────────────────────────
export const referralApi = {
  code: (userId: string) => api.get(`/v1/referrals/code/${userId}`),
  rewards: (userId: string) => api.get(`/v1/referrals/rewards/${userId}`),
  adminOverview: () => api.get("/v1/referrals/admin/overview"),
  adminAllCodes: (params?: { page?: number; limit?: number }) =>
    api.get("/v1/referrals/admin/all-codes", { params }),
  adminAllReferrals: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get("/v1/referrals/admin/all-referrals", { params }),
};

// ─── RAG File Upload + Jobs + Papers ─────────────────────────────────────────
export const ragApi = {
  // Admin file upload → MinIO → IngestionJob
  uploadFile: (formData: FormData) =>
    api.post("/v1/ai/admin/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  // Job management
  listJobs: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get("/v1/ai/jobs", { params }),
  pendingJobs: () => api.get("/v1/ai/jobs/pending"),

  // Generated papers
  getPapers: (params?: {
    paper_type?: string; board?: string; class_num?: number;
    subject?: string; chapter?: string; page?: number; limit?: number;
  }) => api.get("/v1/ai/papers", { params }),
  createPaper: (data: object) => api.post("/v1/ai/papers", data),
  // Queue LLM (Ollama) generation as a background task; poll getPaper for status
  generatePaper: (data: object) => api.post("/v1/ai/papers/generate", data),
  getPaper: (id: string) => api.get(`/v1/ai/papers/${id}`),
  bulkCreatePapers: (papers: object[]) => api.post("/v1/ai/papers/bulk", { papers }),
  deletePaper: (id: string) => api.delete(`/v1/ai/papers/${id}`),
};

// ─── AI Content Upload (questions, notes, practice papers) ────────────────────
export const aiContentApi = {
  uploadQuestions: (data: object) => api.post("/v1/ai/content/questions", data),
  getQuestions: (chapterId: string) =>
    api.get(`/v1/ai/content/questions?chapter_id=${chapterId}`),
  uploadNotes: (data: object) => api.post("/v1/ai/content/notes", data),
  getNotes: (chapterId: string) =>
    api.get(`/v1/ai/content/notes?chapter_id=${chapterId}`),
  uploadPractice: (data: object) => api.post("/v1/ai/content/practice-papers", data),
  getPractice: (chapterId: string) =>
    api.get(`/v1/ai/content/practice-papers?chapter_id=${chapterId}`),
};

// ─── Previous Year Papers ─────────────────────────────────────────────────────
export const pypApi = {
  list: (params?: { board?: string; class_num?: number; subject?: string; year?: number; limit?: number; offset?: number }) =>
    api.get("/v1/content/previous-year-papers", { params }),
  create: (data: object) => api.post("/v1/content/previous-year-papers", data),
  update: (id: string, data: object) => api.put(`/v1/content/previous-year-papers/${id}`, data),
  delete: (id: string) => api.delete(`/v1/content/previous-year-papers/${id}`),
};

// ─── Knowledge Hub ────────────────────────────────────────────────────────────
export const knowledgeHubApi = {
  // Categories
  listCategories: () => api.get("/v1/content/knowledge-categories"),
  createCategory: (data: object) => api.post("/v1/content/knowledge-categories", data),
  updateCategory: (id: string, data: object) => api.put(`/v1/content/knowledge-categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/v1/content/knowledge-categories/${id}`),
  // Articles
  listArticles: (params?: { category_id?: string; is_trending?: boolean; limit?: number; offset?: number }) =>
    api.get("/v1/content/knowledge-articles", { params }),
  createArticle: (data: object) => api.post("/v1/content/knowledge-articles", data),
  updateArticle: (id: string, data: object) => api.put(`/v1/content/knowledge-articles/${id}`, data),
  deleteArticle: (id: string) => api.delete(`/v1/content/knowledge-articles/${id}`),
  toggleTrending: (id: string, isTrending: boolean) =>
    api.put(`/v1/content/knowledge-articles/${id}`, { is_trending: isTrending }),
};

// ─── Battles ──────────────────────────────────────────────────────────────────
export const battleApi = {
  list: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get("/v1/battles", { params }),
  stats: (userId: string) => api.get(`/v1/battles/stats/${userId}`),
  leaderboard: () => api.get("/v1/battles/leaderboard/global"),
  history: (userId: string) => api.get(`/v1/battles/history/${userId}`),
  adminList: (params?: { status?: string; battle_type?: string; page?: number; limit?: number }) =>
    api.get("/v1/battles", { params }),
  adminStats: () => api.get("/v1/battles/admin/stats"),
  // Admin-scheduled battle (the Battle Reminder job notifies joined participants ~10 min before start)
  create: (data: object, displayName = "Admin") =>
    api.post("/v1/battles", data, { params: { display_name: displayName } }),
};

// ─── Careers ──────────────────────────────────────────────────────────────────
export const careerApi = {
  list: (params?: { q?: string; category?: string; page?: number; limit?: number }) =>
    api.get("/v1/careers", { params }),
  categories: () => api.get("/v1/careers/categories"),
  get: (id: string) => api.get(`/v1/careers/${id}`),
  opportunities: (params?: { category?: string; status?: string; page?: number; limit?: number }) =>
    api.get("/v1/careers/opportunities", { params }),
  upcomingOpportunities: () => api.get("/v1/careers/opportunities/upcoming"),
  createOpportunity: (data: object) => api.post("/v1/careers/opportunities/admin/create", data),
  updateOpportunity: (id: string, data: object) => api.patch(`/v1/careers/opportunities/admin/${id}`, data),
  deleteOpportunity: (id: string) => api.delete(`/v1/careers/opportunities/admin/${id}`),
};

// ─── Engagement (Daily Goals, Reward Calendar, Activity Feed, Config) ──────────
export const engagementApi = {
  // Goal templates
  listGoalTemplates: () => api.get("/v1/gamification/goals/admin/templates"),
  createGoalTemplate: (data: object) => api.post("/v1/gamification/goals/admin/templates", data),
  updateGoalTemplate: (id: string, data: object) =>
    api.patch(`/v1/gamification/goals/admin/templates/${id}`, data),
  deleteGoalTemplate: (id: string) => api.delete(`/v1/gamification/goals/admin/templates/${id}`),
  goalAnalytics: (days = 14) =>
    api.get("/v1/gamification/goals/admin/analytics", { params: { days } }),
  // Reward calendar (Day 1-7)
  listRewardCalendar: () => api.get("/v1/gamification/admin/reward-calendar"),
  updateRewardDay: (day: number, data: object) =>
    api.patch(`/v1/gamification/admin/reward-calendar/${day}`, data),
  // Activity feed moderation
  recentActivity: (params?: { limit?: number; activity_type?: string }) =>
    api.get("/v1/gamification/activity/admin/recent", { params }),
  deleteActivity: (id: string) => api.delete(`/v1/gamification/activity/admin/${id}`),
  // Dynamic engagement config
  listConfig: () => api.get("/v1/gamification/admin/engagement-config"),
  setConfig: (key: string, value: object) =>
    api.patch(`/v1/gamification/admin/engagement-config/${key}`, value),
  // Feature usage limits — admin-configurable free/premium daily quotas,
  // cross-service (AI features, video, quiz, battle, chat).
  listFeatureLimits: () => api.get("/v1/gamification/admin/feature-limits"),
  setFeatureLimit: (featureKey: string, body: { free_daily_limit: number | null; premium_daily_limit: number | null; is_active: boolean }) =>
    api.patch(`/v1/gamification/admin/feature-limits/${featureKey}`, body),
};
