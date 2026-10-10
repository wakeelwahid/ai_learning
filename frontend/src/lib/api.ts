import axios, { type AxiosInstance } from "axios";
import { store } from "@/store";
import { setTokens, logout } from "@/store/auth";

export const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = store.getState().auth.token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Don't try to refresh/logout on the auth endpoints themselves — a 401 there
// means "bad credentials" or "expired refresh token", handled by the caller.
const AUTH_PATHS = ["/v1/auth/login", "/v1/auth/refresh"];
const isAuthPath = (url?: string) => !!url && AUTH_PATHS.some((p) => url.includes(p));

// Single-flight refresh: when several requests 401 at once (e.g. right after
// login the dashboard fans out multiple calls), they must NOT each fire their
// own refresh. The refresh token is single-use / rotated server-side, so a
// stampede would make all-but-one refresh fail and force a spurious logout
// ("login then immediate logout"). We share ONE in-flight refresh across waiters.
let refreshPromise: Promise<string> | null = null;

async function getRefreshedToken(): Promise<string> {
  const refreshToken = store.getState().auth.refreshToken;
  if (!refreshToken) throw new Error("no refresh token");
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${BASE_URL}/v1/auth/refresh`, { refresh_token: refreshToken })
      .then(({ data }) => {
        store.dispatch(setTokens({ access: data.access_token, refresh: data.refresh_token }));
        return data.access_token as string;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthPath(original.url)
    ) {
      original._retry = true;
      if (store.getState().auth.refreshToken) {
        try {
          const newAccess = await getRefreshedToken();
          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${newAccess}`;
          return api(original);
        } catch {
          store.dispatch(logout());
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (identifier: string, password: string) =>
    api.post("/v1/auth/login", { identifier, password }),
  me: () => api.get("/v1/auth/me"),
  profileStatus: () => api.get("/v1/auth/profile-status"),
  sendPhoneOtp: (phone: string) => api.post("/v1/auth/otp/send", { phone }),
  // Role is no longer sent at verify time — a brand-new account is created
  // with role=pending and the client calls setRole() once, right after this,
  // when is_new_user is true. An existing phone just logs in unaffected.
  verifyPhoneOtp: (phone: string, otp: string) =>
    api.post("/v1/auth/otp/verify", { phone, otp }),
  setRole: (role: "student" | "parent") => api.patch("/v1/auth/role", { role }),
  updateProfile: (data: { phone?: string; full_name?: string; school_name?: string; avatar_url?: string }) =>
    api.put("/v1/auth/profile", data),
  forgotPassword: (email: string) =>
    api.post("/v1/auth/forgot-password", { email }),
  resetPassword: (token: string, new_password: string) =>
    api.post("/v1/auth/reset-password", { token, new_password }),
  googleAuthUrl: () => api.get("/v1/auth/google"),
  // Redeems the one-time code the OAuth callback redirect carries in the URL
  // for the real access/refresh tokens over a POST body — the tokens
  // themselves never appear in a URL, browser history, or server logs.
  oauthExchange: (code: string) => api.post("/v1/auth/oauth/exchange", { code }),
  googleVerify: (id_token: string) => api.post("/v1/auth/google/verify", { id_token }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post("/v1/auth/change-password", { current_password: currentPassword, new_password: newPassword }),
  disconnectGoogle: () => api.post("/v1/auth/google/disconnect"),
  getSessions: () => api.get("/v1/auth/sessions"),
  revokeSession: (sessionId: string) => api.delete(`/v1/auth/sessions/${sessionId}`),
  deleteAccount: () => api.delete("/v1/auth/me"),
  getUsers: (params?: { role?: string; is_active?: boolean; limit?: number; offset?: number }) =>
    api.get("/v1/auth/users", { params }),
  patchUser: (userId: string, data: { is_active?: boolean; role?: string }) =>
    api.patch(`/v1/auth/users/${userId}`, data),
};

// ─── Content ──────────────────────────────────────────────────────────────────
export const contentApi = {
  boards:   ()               => api.get("/v1/content/boards"),
  // Login screen background — public, no auth. Returns null image_path if
  // no admin has uploaded one yet, so callers fall back to the bundled default.
  getActiveLoginBackground: () => api.get("/v1/content/login-backgrounds/active"),
  // Profile-driven catalog: subjects for the caller's own board & class
  // (resolved server-side from the profile — 409 until board/class are set)
  myCatalog: ()              => api.get("/v1/content/my-catalog"),
  videoFeed: (params?: { class_num?: number; board?: string; subject?: string; sort?: "recent" | "popular"; limit?: number }) =>
    api.get("/v1/content/video-feed", { params }),
  // Genuinely personalized (weak-topic-driven via analytics_service, falls
  // back to recent when there's no quiz signal yet) — not a plain sort alias.
  recommendedVideos: (limit = 24) =>
    api.get("/v1/content/videos/recommended", { params: { limit } }),
  continueWatching: (userId: string, limit = 12) =>
    api.get("/v1/content/continue-watching", { params: { user_id: userId, limit } }),
  seedDemo: (userId?: string) =>
    api.post("/v1/content/seed-demo", null, { params: userId ? { user_id: userId } : {} }),
  classes:  (boardId: string)  => api.get(`/v1/content/boards/${boardId}/classes`),
  subjects: (classId: string)  => api.get(`/v1/content/classes/${classId}/subjects`),
  chapters: (subjectId: string)=> api.get(`/v1/content/subjects/${subjectId}/chapters`),
  topics:   (chapterId: string)=> api.get(`/v1/content/chapters/${chapterId}/topics`),
  videos:   (topicId: string)  => api.get(`/v1/content/topics/${topicId}/videos`),
  chapterVideos: (chapterId: string) => api.get(`/v1/content/chapters/${chapterId}/all-videos`),
  notes:    (chapterId: string)=> api.get(`/v1/content/chapters/${chapterId}/notes`),
  updateProgress: (
    videoId: string, watched_seconds: number, is_completed: boolean, userId: string,
    opts?: { position_seconds?: number; status?: "playing" | "paused" | "completed" },
  ) =>
    api.put(`/v1/content/videos/${videoId}/progress?user_id=${userId}`, { watched_seconds, is_completed, ...(opts || {}) }),
  videoProgress: (videoId: string, userId: string) =>
    api.get(`/v1/content/videos/${videoId}/progress`, { params: { user_id: userId } }),

  // Exercise → Question → Video + Practice flow
  chapterExercises:      (chapterId: string)  => api.get(`/v1/content/chapters/${chapterId}/exercises`),
  chapterDirectQuestions:(chapterId: string)  => api.get(`/v1/content/chapters/${chapterId}/questions`),
  exerciseQuestions:     (exerciseId: string) => api.get(`/v1/content/exercises/${exerciseId}/questions`),
  getVideoById:          (videoId: string)    => api.get(`/v1/content/videos/${videoId}`),
  getVideoByYoutubeId:   (youtubeId: string)  => api.get(`/v1/content/videos/by-youtube/${youtubeId}`),
  getQuestionVideo:      (questionId: string) => api.get(`/v1/content/questions/${questionId}/video`),
  questionPractice:      (questionId: string) => api.get(`/v1/content/questions/${questionId}/practice`),
  exercisePractice:      (exerciseId: string) => api.get(`/v1/content/exercises/${exerciseId}/practice`),
  chapterPractice:       (chapterId: string)  => api.get(`/v1/content/chapters/${chapterId}/practice`),
  subjectPractice:       (subjectId: string)  => api.get(`/v1/content/subjects/${subjectId}/practice`),

  // Progress tracking (production-level)
  completeVideo:    (videoId: string, userId: string) =>
    api.put(`/v1/content/videos/${videoId}/complete?user_id=${userId}`),
  completeExercise: (exerciseId: string, userId: string, score?: number) =>
    api.put(`/v1/content/exercises/${exerciseId}/complete?user_id=${userId}${score !== undefined ? `&score=${score}` : ""}`),
  completeChapter:  (chapterId: string, userId: string, score?: number) =>
    api.put(`/v1/content/chapters/${chapterId}/complete?user_id=${userId}${score !== undefined ? `&score=${score}` : ""}`),
  completeSubject:  (subjectId: string, userId: string, score?: number) =>
    api.put(`/v1/content/subjects/${subjectId}/complete?user_id=${userId}${score !== undefined ? `&score=${score}` : ""}`),
  exerciseProgress: (exerciseId: string, userId: string) =>
    api.get(`/v1/content/exercises/${exerciseId}/my-progress?user_id=${userId}`),

  // Info / CMS pages (About, Contact, FAQ, Privacy, Terms, Refund, footer)
  infoPages:   ()            => api.get("/v1/content/info-pages"),
  infoPage:    (slug: string) => api.get(`/v1/content/info-pages/${slug}`),
  chapterProgress:  (chapterId: string, userId: string) =>
    api.get(`/v1/content/chapters/${chapterId}/my-progress?user_id=${userId}`),
  subjectProgress:  (subjectId: string, userId: string) =>
    api.get(`/v1/content/subjects/${subjectId}/my-progress?user_id=${userId}`),

  // Previous Year Papers
  previousYearPapers: (params?: { board?: string; class_num?: number; subject?: string; year?: number; exam_type?: string; limit?: number }) =>
    api.get("/v1/content/previous-year-papers", { params }),
  createPreviousYearPaper: (body: {
    board: string; class_num: number; subject: string; year: number; exam_type?: string;
    title: string; description?: string; file_url?: string; thumbnail_url?: string;
    difficulty?: string; tags?: object; videos?: object[];
  }) => api.post("/v1/content/previous-year-papers", body),
  updatePreviousYearPaper: (id: string, body: object) =>
    api.put(`/v1/content/previous-year-papers/${id}`, body),
  deletePreviousYearPaper: (id: string) =>
    api.delete(`/v1/content/previous-year-papers/${id}`),

  // PYP attempts — the row always belongs to the authenticated caller, so no
  // user_id is sent. `answers` maps question_id → chosen option ("A".."D");
  // grading is server-side from the paper's practice questions.
  startPypAttempt: (pypId: string) =>
    api.post(`/v1/content/previous-year-papers/${pypId}/attempts`),
  submitPypAttempt: (attemptId: string, answers: Record<string, string>, timeTakenSec?: number) =>
    api.patch(`/v1/content/previous-year-papers/attempts/${attemptId}`,
      { answers, time_taken_sec: timeTakenSec }),
  myPypAttempts: () => api.get("/v1/content/previous-year-papers/attempts/mine"),

  // Knowledge Hub
  knowledgeCategories: () => api.get("/v1/content/knowledge-categories"),
  knowledgeArticles: (params?: { category_id?: string; is_trending?: boolean; limit?: number }) =>
    api.get("/v1/content/knowledge-articles", { params }),
  createKnowledgeCategory: (body: { name: string; icon?: string; color?: string; description?: string; sequence?: number }) =>
    api.post("/v1/content/knowledge-categories", body),
  updateKnowledgeCategory: (id: string, body: object) =>
    api.put(`/v1/content/knowledge-categories/${id}`, body),
  deleteKnowledgeCategory: (id: string) =>
    api.delete(`/v1/content/knowledge-categories/${id}`),
  createKnowledgeArticle: (body: {
    category_id: string; title: string; description: string; content?: string;
    cover_image_url?: string; duration_min?: number; is_trending?: boolean;
    is_published?: boolean; author?: string;
    content_type?: "article" | "video"; video_url?: string; external_url?: string;
  }) => api.post("/v1/content/knowledge-articles", body),
  updateKnowledgeArticle: (id: string, body: object) =>
    api.put(`/v1/content/knowledge-articles/${id}`, body),
  deleteKnowledgeArticle: (id: string) =>
    api.delete(`/v1/content/knowledge-articles/${id}`),
  viewKnowledgeArticle: (id: string) =>
    api.post(`/v1/content/knowledge-articles/${id}/view`),

  // PYP Practice Questions
  pypPracticeQuestions: (topicName?: string) =>
    api.get("/v1/content/pyp-practice-questions", { params: topicName ? { topic_name: topicName } : undefined }),
  createPypPracticeQuestion: (body: object) =>
    api.post("/v1/content/pyp-practice-questions", body),
  updatePypPracticeQuestion: (id: string, body: object) =>
    api.put(`/v1/content/pyp-practice-questions/${id}`, body),
  deletePypPracticeQuestion: (id: string) =>
    api.delete(`/v1/content/pyp-practice-questions/${id}`),
  seedPypPracticeQuestions: () =>
    api.post("/v1/content/pyp-practice-questions/seed"),

  // Bookmarks (save-for-later videos/notes)
  toggleBookmark: (entityType: "video" | "note", entityId: string) =>
    api.post("/v1/content/bookmarks/toggle", { entity_type: entityType, entity_id: entityId }),
  myBookmarks: (userId: string) =>
    api.get(`/v1/content/bookmarks/${userId}`),

  // Assignments — real completion, derived from UserLearningProgress
  studentAssignments: (studentId: string) =>
    api.get(`/v1/content/assignments/student/${studentId}`),
  createAssignment: (body: {
    title: string; description?: string; entity_type: "chapter" | "exercise";
    entity_id: string; student_ids: string[]; due_at?: string;
  }) => api.post("/v1/content/assignments", body),
  listAssignments: (params?: { mine_only?: boolean; limit?: number; offset?: number }) =>
    api.get("/v1/content/assignments", { params }),
};

// ─── Quiz ─────────────────────────────────────────────────────────────────────
export const quizApi = {
  chapterQuizzes: (chapterId: string) => api.get(`/v1/quizzes/chapter/${chapterId}`),
  questions: (quizId: string) => api.get(`/v1/quizzes/${quizId}/questions`),
  startAttempt: (quiz_id: string, user_id: string) =>
    api.post("/v1/quizzes/attempts/start", { quiz_id, user_id }),
  submitAnswer: (attempt_id: string, question_id: string, user_answer: string) =>
    api.post("/v1/quizzes/attempts/answer", { attempt_id, question_id, user_answer }),
  submitQuiz: (attempt_id: string, user_id: string) =>
    api.post("/v1/quizzes/attempts/submit", { attempt_id, user_id }),
  saveAttemptState: (attemptId: string, state: object, userId: string) =>
    api.put(`/v1/quizzes/attempts/${attemptId}/state`, state, { params: { user_id: userId } }),
  getAttemptState: (attemptId: string, userId: string) =>
    api.get(`/v1/quizzes/attempts/${attemptId}/state`, { params: { user_id: userId } }),
  adminList: (params?: { limit?: number; offset?: number }) =>
    api.get("/v1/quizzes/admin/list", { params }),
  adminStats: () => api.get("/v1/quizzes/admin/stats"),
  classLeaderboard: (classNum: number, top = 10) =>
    api.get(`/v1/quizzes/leaderboard/${classNum}`, { params: { top } }),
  // Per-subject, within board+class — e.g. "CBSE Class 10 Physics Champions"
  subjectLeaderboard: (board: string, classNum: number, subjectId: string, top = 20) =>
    api.get(`/v1/quizzes/leaderboard/subject/${board}/${classNum}/${subjectId}`, { params: { top } }),
  adminDelete: (quizId: string) => api.delete(`/v1/quizzes/admin/${quizId}`),
  adminCreate: (data: object) => api.post("/v1/quizzes", data),
  pyps: (chapterId: string) => api.get(`/v1/quizzes/pyps?chapter_id=${chapterId}`),
  chapterScore: (chapterId: string, userId: string) =>
    api.get(`/v1/quizzes/chapter-score?chapter_id=${chapterId}&user_id=${userId}`),
};

// ─── AI ───────────────────────────────────────────────────────────────────────
export const aiApi = {
  study: (
    query: string,
    filters?: { board?: string; class_num?: number; subject?: string; chapter?: string; chapter_id?: string },
  ) => api.post("/v1/ai/study", { query, ...(filters || {}) }),
  // Student question bank — random questions (Redis-first, DB fallback)
  questions: (params: { board?: string; class_num?: number; subject?: string; chapter?: string; count?: number; feature?: string }) =>
    api.get("/v1/ai/questions", { params }),
  chat: (query: string, history?: { role: string; content: string }[], studentId?: string) =>
    api.post("/v1/ai/chat", { query, history, ...(studentId ? { student_id: studentId } : {}) }),
  // Parent RAG — grounded in the child's real quiz/battle/study/career records.
  // studentId must be an APPROVED linked child; the backend re-checks.
  // Long timeout: an uncached answer runs the local Ollama model (30-120s).
  parentChat: (query: string, studentId: string, history?: { role: string; content: string }[]) =>
    api.post("/v1/ai/parent-chat", { query, student_id: studentId, history }, { timeout: 180000 }),
  getPapers: (params?: {
    paper_type?: string; board?: string; class_num?: number;
    subject?: string; chapter?: string; page?: number; limit?: number;
  }) => api.get("/v1/ai/papers", { params }),
  generatePaper: (body: {
    paper_type: string; board?: string; class_num?: number;
    subject?: string; chapter?: string; difficulty?: string; count?: number; title?: string;
  }) => api.post("/v1/ai/papers/generate", body),
  getPaper: (paperId: string) => api.get(`/v1/ai/papers/${paperId}`),
  // Paper attempts — no user_id (taken from the JWT) and no score: the server
  // grades from the paper's own answer key.
  startPaperAttempt: (paperId: string) =>
    api.post(`/v1/ai/papers/${paperId}/attempts`),
  submitPaperAttempt: (attemptId: string, answers: Record<string, string>, timeTakenSec?: number) =>
    api.patch(`/v1/ai/papers/attempts/${attemptId}`,
      { answers, time_taken_sec: timeTakenSec }),
  myPaperAttempts: () => api.get("/v1/ai/papers/attempts/mine"),
  deletePaper: (paperId: string) => api.delete(`/v1/ai/papers/${paperId}`),
  mistakeAnalysis: (mistakes: { question: string; user_answer: string; correct_answer: string; topic?: string; subject?: string }[], board?: string, class_num?: number) =>
    api.post("/v1/ai/mistake-analysis", { mistakes, board, class_num }),
  flashcards: (body: { topic: string; subject?: string; chapter?: string; board?: string; class_num?: number; count?: number }) =>
    api.post("/v1/ai/flashcards", body),
  revisionPlan: (body: { weak_topics: (string | Record<string, unknown>)[]; board?: string; class_num?: number; days?: number }) =>
    api.post("/v1/ai/revision-plan", body),
};

// ─── Payment ──────────────────────────────────────────────────────────────────
export const paymentApi = {
  plans: () => api.get("/v1/payments/plans"),
  createOrder: (user_id: string, plan: string, coupon_code?: string) =>
    api.post("/v1/payments/orders", { user_id, plan, coupon_code: coupon_code ?? null }),
  verifyPayment: (data: object) => api.post("/v1/payments/verify", data),
  retryPayment: (paymentId: string, userId: string) =>
    api.post("/v1/payments/retry", { payment_id: paymentId, user_id: userId }),
  getSubscription: (userId: string) => api.get(`/v1/payments/subscription/${userId}`),
  cancelSubscription: (userId: string) => api.post(`/v1/payments/subscription/${userId}/cancel`),
  getEffectiveSubscription: (userId: string) => api.get(`/v1/payments/subscription/${userId}/effective`),
  invoices: (userId: string) => api.get(`/v1/payments/invoices/${userId}`),
  validateCoupon: (code: string, plan: string) =>
    api.post("/v1/payments/coupons/validate", { code, plan }),
  downloadReceipt: (paymentId: string) =>
    api.get(`/v1/payments/payments/${paymentId}/receipt`, { responseType: "blob" }),
  adminSubscriptions: (params?: { limit?: number; offset?: number }) =>
    api.get("/v1/payments/admin/subscriptions", { params }),
  adminListCoupons: () => api.get("/v1/payments/admin/coupons"),
  adminCreateCoupon: (data: { code: string; discount_pct: number; max_uses?: number; valid_until?: string; plan?: string }) =>
    api.post("/v1/payments/admin/coupons", data),
  adminDeleteCoupon: (couponId: string) => api.delete(`/v1/payments/admin/coupons/${couponId}`),
  // Parent payment endpoints
  parentStudentSubscription: (studentId: string) =>
    api.get(`/v1/payments/parent/student-subscription?student_id=${studentId}`),
  parentCreateOrder: (studentId: string, plan: string, couponCode?: string) =>
    api.post("/v1/payments/parent/create-order", { student_id: studentId, plan, coupon_code: couponCode ?? null }),
  parentVerifyPayment: (data: object) =>
    api.post("/v1/payments/parent/verify", data),
};

// ─── Gamification ─────────────────────────────────────────────────────────────
export const gamificationApi = {
  // XP / Level
  profile:       (userId: string) => api.get(`/v1/gamification/profile/${userId}`),
  levelInfo:     (userId: string) => api.get(`/v1/gamification/level/${userId}`),
  // Admin-only now (backend requires an admin token); students never award XP
  // directly — it's granted server-side on quiz/battle/activity. Kept for the
  // admin panel's manual-grant tooling only.
  awardXP:       (userId: string, event: string, referenceId?: string) =>
    api.post("/v1/gamification/xp/award", { user_id: userId, event, reference_id: referenceId }),

  // Badges
  badges:        () => api.get("/v1/gamification/badges"),
  userBadges:    (userId: string) => api.get(`/v1/gamification/badges/${userId}`),

  // Streaks
  streak:         (userId: string) => api.get(`/v1/gamification/streak/${userId}`),
  recordActivity: (userId: string) =>
    api.post("/v1/gamification/streak/record", { user_id: userId }),

  // Engagement (daily goals / rewards / friend activity)
  todayGoal: (userId: string) => api.get(`/v1/gamification/goals/today/${userId}`),

  // Usage Today widget — read-only per-feature daily quota snapshot
  usageStatus: (userId: string) => api.get(`/v1/gamification/usage/status/${userId}`),

  // Daily Challenge (single admin-published challenge/day — distinct from
  // the 3-slot Daily Goals above and from multi-day Challenge Programs)
  todayChallenge: (userId: string) => api.get(`/v1/gamification/challenges/today/${userId}`),
  recordChallengeProgress: (userId: string, challengeId: string, increment = 1) =>
    api.post("/v1/gamification/challenges/progress", { user_id: userId, challenge_id: challengeId, increment }),
  claimChallengeReward: (userId: string, challengeId: string) =>
    api.post("/v1/gamification/challenges/claim", { user_id: userId, challenge_id: challengeId }),
  weeklyChallengeStats: (userId: string) => api.get(`/v1/gamification/challenges/weekly/${userId}`),
  monthlyChallengeStats: (userId: string) => api.get(`/v1/gamification/challenges/monthly/${userId}`),
  dailyRewardStatus: (userId: string) => api.get(`/v1/gamification/daily-reward/status/${userId}`),
  dailyRewardClaim: (userId: string) => api.post(`/v1/gamification/daily-reward/claim/${userId}`),
  friendActivity: (userId: string, limit = 20) =>
    api.get(`/v1/gamification/activity/friends/${userId}`, { params: { limit } }),
  friendTimeline: (friendId: string, limit = 30) =>
    api.get(`/v1/gamification/activity/friend/${friendId}`, { params: { limit } }),

  // Season
  currentSeason: () => api.get("/v1/gamification/season/current"),

  // EduPoints
  eduPointsBalance: (userId: string) =>
    api.get(`/v1/gamification/edupoints/balance/${userId}`),
  eduPointsHistory: (userId: string, limit = 50) =>
    api.get(`/v1/gamification/edupoints/history/${userId}?limit=${limit}`),
  eduPointsShop:    (userId: string) =>
    api.get(`/v1/gamification/edupoints/shop/${userId}`),
  // Admin-only now (see awardXP note above).
  awardEduPoints:   (userId: string, event: string, referenceId?: string) =>
    api.post("/v1/gamification/edupoints/award", { user_id: userId, event, reference_id: referenceId }),
  spendEduPoints:   (userId: string, item: string, referenceId?: string) =>
    api.post("/v1/gamification/edupoints/spend", { user_id: userId, item, reference_id: referenceId }),

  // Leaderboard
  leaderboard:     (limit = 50) => api.get(`/v1/gamification/leaderboard?limit=${limit}`),
  friendsLeaderboard: (userId: string) => api.get(`/v1/gamification/leaderboard/friends/${userId}`),
  rankRewards:     () => api.get("/v1/gamification/leaderboard/rank-rewards"),
  rankUnlock:      (userId: string) => api.get(`/v1/gamification/rank-unlock/${userId}`),

  // YouTube Subscribe Claims
  ytClaimStatus:   (userId: string) => api.get(`/v1/gamification/youtube-subscribe/claim/${userId}`),
  ytSubmitClaim:   (userId: string, screenshotB64: string) =>
    api.post("/v1/gamification/youtube-subscribe/claim", { user_id: userId, screenshot_b64: screenshotB64 }),

  // Streak Freeze
  getStreakFreezeStatus: (userId: string) =>
    api.get(`/v1/gamification/streaks/freeze/status/${userId}`),
  purchaseStreakFreeze:   (userId: string) =>
    api.post(`/v1/gamification/streaks/freeze/purchase?user_id=${userId}`),

  // Certificates (content_service)
  issueCertificate:     (body: { user_id: string; entity_type: string; entity_id: string; student_name: string }) =>
    api.post("/v1/content/certificates", body),
  getCertificate:       (certNumber: string) =>
    api.get(`/v1/content/certificates/${certNumber}`),
  listUserCertificates: (userId: string, entityType?: string) =>
    api.get(`/v1/content/certificates/user/${userId}${entityType ? `?entity_type=${entityType}` : ""}`),
};

// ─── Analytics ────────────────────────────────────────────────────────────────
export const analyticsApi = {
  dashboard: (userId: string) => api.get(`/v1/analytics/student/${userId}/dashboard`),
  getWeeklySummary: (userId?: string) =>
    api.get(`/v1/analytics/student/${userId || "me"}/weekly-summary`),
  studentProgress: (userId: string) => api.get(`/v1/analytics/student/${userId}/progress`),
  weakTopics: (userId: string) => api.get(`/v1/analytics/student/${userId}/weak-topics`),
  parentSummary: (studentId: string) => api.get(`/v1/analytics/parent/student/${studentId}/summary`),
  adminOverview: () => api.get("/v1/analytics/admin/overview"),
  adminEngagement: () => api.get("/v1/analytics/admin/engagement"),
  adminWeeklyEngagement: () => api.get("/v1/analytics/admin/weekly-engagement"),
  adminRevenue: () => api.get("/v1/analytics/admin/revenue"),
  heartbeat: (minutes = 1) => api.post("/v1/analytics/activity/heartbeat", { minutes }),
};

// ─── Teacher ──────────────────────────────────────────────────────────────────
// There is no teacher-student roster in this platform — "cohort" means every
// student profile set to this exact board + class_number.
export const teacherApi = {
  cohort: (board: string, classNumber: number) =>
    api.get("/v1/analytics/teacher/cohort", { params: { board, class_number: classNumber } }),
};

// ─── Search ───────────────────────────────────────────────────────────────────
export const searchApi = {
  global: (q: string) => api.get(`/v1/content/search?q=${encodeURIComponent(q)}`),
};

// ─── Notes ────────────────────────────────────────────────────────────────────
export const notesApi = {
  chapter: (chapterId: string) => api.get(`/v1/content/chapters/${chapterId}/notes`),
  bookmark: (noteId: string, userId: string) => api.post(`/v1/content/notes/${noteId}/bookmark`, { user_id: userId }),
};

// ─── Revision ─────────────────────────────────────────────────────────────────
export const revisionApi = {
  summary: (userId: string) => api.get(`/v1/analytics/student/${userId}/revision`),
  bookmarks: (userId: string) => api.get(`/v1/content/bookmarks/${userId}`),

  // Session tracking — the row always belongs to the authenticated caller,
  // so no user_id is sent. Same shape as the study-time heartbeat.
  startSession: (body: { topic_id?: string; subject_id?: string; source?: string }) =>
    api.post("/v1/analytics/revision/sessions", body),
  endSession: (sessionId: string, durationSec: number, isCompleted: boolean) =>
    api.patch(`/v1/analytics/revision/sessions/${sessionId}`,
      { duration_sec: durationSec, is_completed: isCompleted }),
  mySessions: () => api.get("/v1/analytics/revision/sessions/mine"),
};

// ─── Battle ───────────────────────────────────────────────────────────────────
export type BattleType =
  | "solo" | "1v1" | "group" | "public" | "team"
  | "class_battle" | "school_battle" | "subject" | "chapter" | "study_party";

export interface CreateBattleParams {
  battle_type:     BattleType;
  subject?:        string;
  topic?:          string;
  board?:          string;
  class_num?:      number;
  difficulty?:     "easy" | "medium" | "hard";
  question_count?: number;
  time_limit_sec?: number;
  max_players?:    number;
  team_a_name?:    string;
  team_b_name?:    string;
  class_a?:        string;
  class_b?:        string;
  school_a?:       string;
  school_b?:       string;
}

export interface ChallengeFriendParams {
  friend_id:       string;
  subject?:        string;
  topic?:          string;
  difficulty?:     "easy" | "medium" | "hard";
  question_count?: number; // derived server-side from time_limit_sec for challenges
  time_limit_sec?: number; // 10/20/30 min in the UI (server: 60-1800)
  stake_xp?: number;       // 50-500 — winner takes it, loser pays it
}

export interface ChallengeFriendResult {
  battle_id:      string;
  invite_code:    string;
  status:         string;
  question_count: number;
  time_limit_sec: number;
  subject:        string | null;
  friend_id:      string;
  reward:         { win_xp: number; win_edupoints?: number; loss_xp: number; min_xp_required?: number };
}

export const battleApi = {
  challengeFriend: (params: ChallengeFriendParams) =>
    api.post<ChallengeFriendResult>("/v1/battles/challenge", params),
  create: (params: CreateBattleParams, userId: string, displayName: string, avatarUrl?: string) =>
    api.post(`/v1/battles?user_id=${userId}&display_name=${encodeURIComponent(displayName)}${avatarUrl ? `&avatar_url=${encodeURIComponent(avatarUrl)}` : ""}`, params),
  listOpen: (params?: { subject?: string; class_num?: number; limit?: number }) =>
    api.get("/v1/battles/open", { params }),
  join: (inviteCode: string, userId: string, displayName: string, avatarUrl?: string) =>
    api.post(`/v1/battles/join?user_id=${userId}&display_name=${encodeURIComponent(displayName)}${avatarUrl ? `&avatar_url=${encodeURIComponent(avatarUrl)}` : ""}`, { invite_code: inviteCode }),
  joinById: (battleId: string, userId: string, displayName: string) =>
    api.post(`/v1/battles/${battleId}/join-by-id?user_id=${userId}&display_name=${encodeURIComponent(displayName)}`),
  get: (battleId: string) => api.get(`/v1/battles/${battleId}`),
  start: (battleId: string, userId: string) => api.post(`/v1/battles/${battleId}/start?user_id=${userId}`),
  // Host-only lobby reroll — fresh random questions, same subject/topic.
  // Joined clients receive the new set via the "questions_regenerated" WS event.
  regenerateQuestions: (battleId: string) => api.post(`/v1/battles/${battleId}/regenerate-questions`),
  submitAnswer: (battleId: string, userId: string, data: { battle_id: string; question_idx: number; answer: string; time_taken_ms: number }) =>
    api.post(`/v1/battles/${battleId}/answer?user_id=${userId}`, data),
  finish: (battleId: string) => api.post(`/v1/battles/${battleId}/finish`),
  stats: (userId: string) => api.get(`/v1/battles/stats/${userId}`),
  history: (userId: string) => api.get(`/v1/battles/history/${userId}`),
  leaderboard: () => api.get("/v1/battles/leaderboard/global"),
  rematch: (battleId: string, userId: string, displayName: string) =>
    api.post(`/v1/battles/${battleId}/rematch`, null, { params: { user_id: userId, display_name: displayName } }),
  getReplay: (battleId: string, userId: string) =>
    api.get(`/v1/battles/${battleId}/replay`, { params: { user_id: userId } }),
  getReview: (battleId: string, userId: string) =>
    api.get(`/v1/battles/${battleId}/review`, { params: { user_id: userId } }),
  spectate: (battleId: string, userId: string, displayName: string) =>
    api.post(`/v1/battles/${battleId}/spectate`, null, { params: { user_id: userId, display_name: displayName } }),
  myBattles: (userId: string, limit = 10, offset = 0) =>
    api.get("/v1/battles/my", { params: { user_id: userId, limit, offset } }),
};

// ─── Notification ─────────────────────────────────────────────────────────────
export const notificationApi = {
  getNotifications: (userId: string, limit = 20) =>
    api.get(`/v1/notifications/user/${userId}`, { params: { limit } }),
  markAllRead: (userId: string) =>
    api.patch(`/v1/notifications/user/${userId}/read`),
  markBulkRead: (notificationIds: string[]) =>
    api.post("/v1/notifications/mark-read", { notification_ids: notificationIds }),
  getPreferences: (userId: string) => api.get(`/v1/notifications/preferences/${userId}`),
  updatePreferences: (userId: string, prefs: Record<string, boolean>) =>
    api.put(`/v1/notifications/preferences/${userId}`, prefs),
  getMessageThreads: (userId: string) =>
    api.get("/v1/notifications/messages/threads", { params: { user_id: userId } }),
  registerPushToken: (userId: string, token: string, platform: string) =>
    api.post("/v1/notifications/push-token", { user_id: userId, token, platform }),
  submitContactMessage: (data: { name: string; email: string; subject: string; message: string }) =>
    api.post("/v1/notifications/contact", data),
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
  list: (activeOnly = true) =>
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

// ─── Career ───────────────────────────────────────────────────────────────────
export const careerApi = {
  list: (params?: { category?: string; search?: string; limit?: number }) =>
    api.get("/v1/careers", { params }),
  categories: () => api.get("/v1/careers/categories"),
  get: (idOrSlug: string) => api.get(`/v1/careers/${idOrSlug}`),
  setGoal: (userId: string, careerId: string, isPrimary = false, notes?: string) =>
    api.post(`/v1/careers/goals/set?user_id=${userId}`, { career_id: careerId, is_primary: isPrimary, notes }),
  getGoals: (userId: string) => api.get(`/v1/careers/goals/my?user_id=${userId}`),
  deleteGoal: (userId: string, careerId: string) => api.delete(`/v1/careers/goals/${careerId}?user_id=${userId}`),
  skillGap: (userId: string, careerId: string, studentScores: Record<string, number>) =>
    api.post(`/v1/careers/skill-gap?user_id=${userId}`, { career_id: careerId, student_scores: studentScores }),
  latestAssessment: (userId: string, careerId: string) =>
    api.get(`/v1/careers/skill-gap/${careerId}/latest?user_id=${userId}`),
  dashboard: (userId: string) => api.get(`/v1/careers/dashboard/my?user_id=${userId}`),
};

// ─── Opportunities Hub ────────────────────────────────────────────────────────
export const opportunityApi = {
  hubSummary: () => api.get("/v1/careers/opportunities/hub-summary"),
  list: (params?: { category?: string; subcategory?: string; active_only?: boolean; featured?: boolean; limit?: number; offset?: number }) =>
    api.get("/v1/careers/opportunities", { params }),
  get: (id: string) => api.get(`/v1/careers/opportunities/${id}`),
  upcoming: (days = 30) => api.get(`/v1/careers/opportunities/upcoming?days=${days}`),
  adminCreate: (body: object) => api.post("/v1/careers/opportunities/admin/create", body),
  adminUpdate: (id: string, body: object) => api.patch(`/v1/careers/opportunities/admin/${id}`, body),
  adminDeactivate: (id: string) => api.delete(`/v1/careers/opportunities/admin/${id}`),
};

// ─── Messages (Parent-to-Student) ────────────────────────────────────────────
export const messageApi = {
  getThreads: (userId: string) =>
    api.get("/v1/users/messages/threads", { params: { user_id: userId } }),
  getThread: (otherUserId: string, userId: string, since?: string) =>
    api.get(`/v1/users/messages/thread/${otherUserId}`, {
      params: { user_id: userId, ...(since ? { since } : {}) },
    }),
  send: (recipientId: string, userId: string, content: string) =>
    api.post("/v1/users/messages/send", { recipient_id: recipientId, content }, { params: { user_id: userId } }),
  unreadCount: (userId: string) =>
    api.get("/v1/users/messages/unread-count", { params: { user_id: userId } }),
};

// ─── Referral ─────────────────────────────────────────────────────────────────
export const referralApi = {
  getCode:   (userId: string) => api.get(`/v1/referrals/code/${userId}`),
  getRewards:(userId: string) => api.get(`/v1/referrals/rewards/${userId}`),
};

// ─── Challenge Programs (multi-day, mixed-task-type) ─────────────────────────
export const challengeProgramApi = {
  listPublished: () => api.get("/v1/gamification/challenge-programs/published"),
  getById: (id: string) => api.get(`/v1/gamification/challenge-programs/${id}`),
  join: (id: string) => api.post(`/v1/gamification/challenge-programs/${id}/join`),
  getEnrollment: (userId: string, programId: string) =>
    api.get(`/v1/gamification/challenge-programs/enrollments/${userId}/${programId}`),
  getMyEnrollments: (userId: string) =>
    api.get(`/v1/gamification/challenge-programs/enrollments/${userId}`),
};

// ─── Share ────────────────────────────────────────────────────────────────────
export const shareApi = {
  getShareCard: (userId: string, achievementType: string) =>
    api.get("/v1/gamification/share-card/" + userId + "/" + achievementType),
  recordShare: (data: { user_id: string; achievement_type: string; platform: string }) =>
    api.post("/v1/gamification/share-event", data),
};

// ─── Chat (WhatsApp-style) ────────────────────────────────────────────────────
export const chatApi = {
  search: (q: string, userId: string, page = 1, limit = 20) =>
    api.get("/v1/users/chat/search", { params: { q, user_id: userId, page, limit } }),
  sendFriendRequest: (fromId: string, toId: string) =>
    api.post("/v1/users/chat/friend-requests", { from_user_id: fromId, to_user_id: toId }),
  getFriendRequests: (userId: string, direction: "incoming" | "outgoing" = "incoming") =>
    api.get("/v1/users/chat/friend-requests", { params: { user_id: userId, direction } }),
  getFriendRequestCount: (userId: string) =>
    api.get("/v1/users/chat/friend-requests/count", { params: { user_id: userId } }),
  cancelFriendRequest: (requestId: string) =>
    api.delete("/v1/users/chat/friend-requests/" + requestId),
  respondToRequest: (requestId: string, status: string, userId: string) =>
    api.patch("/v1/users/chat/friend-requests/" + requestId, { status, user_id: userId }),
  getFriends: () => api.get("/v1/community/friends"),
  getRooms: (userId: string) =>
    api.get("/v1/users/chat/rooms", { params: { user_id: userId } }),
  createGroup: (data: object) =>
    api.post("/v1/users/chat/rooms/group", data),
  renameGroup: (roomId: string, name: string) =>
    api.patch("/v1/users/chat/rooms/" + roomId, { name }),
  deleteGroup: (roomId: string) =>
    api.delete("/v1/users/chat/rooms/" + roomId),
  removeGroupMember: (roomId: string, memberId: string) =>
    api.delete("/v1/users/chat/rooms/" + roomId + "/members/" + memberId),
  addMember: (roomId: string, userId: string, addedBy: string) =>
    api.post("/v1/users/chat/rooms/" + roomId + "/members", { user_id: userId, added_by: addedBy }),
  getMessages: (roomId: string, userId: string, cursor?: string) =>
    api.get("/v1/users/chat/rooms/" + roomId + "/messages", {
      params: Object.assign({ user_id: userId }, cursor ? { before: cursor } : {}),
    }),
  sendMessage: (roomId: string, senderId: string, content: string) =>
    api.post("/v1/users/chat/rooms/" + roomId + "/messages", { sender_id: senderId, content }),
  markRead: (roomId: string, userId: string) =>
    api.post("/v1/users/chat/rooms/" + roomId + "/read", { user_id: userId }),
  parentMonitor: (childId: string, parentId: string) =>
    api.get("/v1/users/chat/parent/monitor/" + childId, { params: { parent_user_id: parentId } }),
  parentRoomMessages: (childId: string, roomId: string, parentId: string) =>
    api.get("/v1/users/chat/parent/monitor/" + childId + "/rooms/" + roomId, { params: { parent_user_id: parentId } }),
  addReaction: (messageId: string, userId: string, emoji: string) =>
    api.post("/v1/users/chat/messages/" + messageId + "/reactions", { user_id: userId, emoji }),
  getReactions: (messageId: string, userId: string) =>
    api.get("/v1/users/chat/messages/" + messageId + "/reactions", { params: { user_id: userId } }),
};

// ─── Parent ───────────────────────────────────────────────────────────────────
export const parentApi = {
  linkStudent: (parentId: string, body: {
    student_user_id: string;
    relationship: string;
    father_name?: string;
    mother_name?: string;
    approval_required?: boolean;
  }) => api.post(`/v1/users/parents/${parentId}/students`, body),

  // New simplified link endpoint
  linkStudentSimple: (studentId: string) =>
    api.post("/v1/users/parent/link-student", { student_id: studentId }),

  getStudents: (parentId: string) =>
    api.get(`/v1/users/parents/${parentId}/students`),

  // The student's own view of every parent-link request against their
  // account (pending and approved) — a link a parent creates starts
  // is_approved=false server-side and grants NO access anywhere until the
  // student approves it via updateLink(linkId, { is_approved: true }).
  getParentLinks: (studentId: string) =>
    api.get(`/v1/users/students/${studentId}/parents`),

  updateLink: (linkId: string, body: Record<string, unknown>) =>
    api.patch(`/v1/users/parents/links/${linkId}`, body),

  removeLink: (linkId: string) =>
    api.delete(`/v1/users/parents/links/${linkId}`),

  studentSummary: (studentId: string, days: 1 | 7 | 30 | 90 | 365 = 7) =>
    api.get(`/v1/analytics/parent/student/${studentId}/summary`, { params: { days } }),

  childrenSummary: (studentIds: string[], days: 1 | 7 | 30 | 90 | 365 = 30) =>
    api.get("/v1/analytics/parent/children-summary", {
      params: { student_ids: studentIds.join(","), days },
    }),

  studentProgress: (studentId: string) =>
    api.get(`/v1/users/parent/student-progress/${studentId}`),

  getStudyLimits: (childId: string, parentId: string) =>
    api.get(`/v1/users/parent/study-limits/${childId}`, { params: { parent_id: parentId } }),

  setStudyLimit: (childId: string, parentId: string, data: { daily_limit_minutes: number; is_enabled: boolean }) =>
    api.put(`/v1/users/parent/study-limits/${childId}`, data, { params: { parent_id: parentId } }),

  setStudyLimitSimple: (childId: string, dailyLimitMinutes: number) =>
    api.post(`/v1/users/parent/study-limit/${childId}`, { daily_limit_minutes: dailyLimitMinutes }),

  // Purchase approval gate (F1)
  getApprovalRequired: (kind = "purchase") =>
    api.get("/v1/users/parent-approvals/required", { params: { kind } }),
  createApprovalRequest: (body: { kind: string; reference: string; title: string; amount?: number }) =>
    api.post("/v1/users/parent-approvals", body),
  myApprovalRequests: () => api.get("/v1/users/parent-approvals/mine"),
  pendingApprovals: () => api.get("/v1/users/parent-approvals/pending"),
  decideApproval: (id: string, body: { status: "approved" | "rejected"; note?: string }) =>
    api.patch(`/v1/users/parent-approvals/${id}`, body),

  // Pending-request badges (F4)
  linkBadges: () => api.get("/v1/users/me/link-badges"),

  // Meetings (F8)
  createMeeting: (body: { student_user_id: string; preferred_at: string; topic: string; notes?: string }) =>
    api.post("/v1/users/meetings", body),
  myMeetings: () => api.get("/v1/users/meetings/mine"),
  cancelMeeting: (id: string) => api.delete(`/v1/users/meetings/${id}`),
};

// ─── User (Admin & Study Time) ────────────────────────────────────────────────
export const userApi = {
  adminAll: (params?: { limit?: number }) =>
    api.get("/v1/users/admin/all", { params }),
  studyTime: (userId: string) =>
    api.get(`/v1/users/study-time/${userId}`),
};
