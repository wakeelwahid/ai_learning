import client, { BASE_URL } from "./client";

export const contentApi = {
  getBoards:    ()                            => client.get("/v1/content/boards"),
  // Login screen background — public, no auth. Returns null image_path if
  // no admin has uploaded one yet, so callers fall back to the bundled default.
  getActiveLoginBackground: () => client.get("/v1/content/login-backgrounds/active"),
  // Profile-driven catalog: subjects for the caller's own board & class
  myCatalog:    ()                            => client.get("/v1/content/my-catalog"),
  getClasses:   (boardId: string)             => client.get(`/v1/content/boards/${boardId}/classes`),
  getSubjects:  (classId: string)             => client.get(`/v1/content/classes/${classId}/subjects`),
  getChapters:  (subjectId: string)           => client.get(`/v1/content/subjects/${subjectId}/chapters`),
  getTopics:    (chapterId: string)           => client.get(`/v1/content/chapters/${chapterId}/topics`),
  getVideos:    (topicId: string)             => client.get(`/v1/content/topics/${topicId}/videos`),
  getNotes:     (chapterId: string)           => client.get(`/v1/content/chapters/${chapterId}/notes`),
  trackProgress:(videoId: string, userId: string, watchedSeconds: number, isCompleted: boolean) =>
    client.put(`/v1/content/videos/${videoId}/progress?user_id=${userId}`, { watched_seconds: watchedSeconds, is_completed: isCompleted }),

  // New content hierarchy
  getChapterExercises:       (chapterId: string)  => client.get(`/v1/content/chapters/${chapterId}/exercises`),
  getChapterDirectQuestions: (chapterId: string)  => client.get(`/v1/content/chapters/${chapterId}/questions`),
  getExerciseQuestions:      (exerciseId: string) => client.get(`/v1/content/exercises/${exerciseId}/questions`),
  getQuestionVideo:          (questionId: string) => client.get(`/v1/content/questions/${questionId}/video`),
  getVideoById:              (videoId: string)    => client.get(`/v1/content/videos/${videoId}`),
  getQuestionPractice:       (questionId: string) => client.get(`/v1/content/questions/${questionId}/practice`),
  getExercisePractice:       (exerciseId: string) => client.get(`/v1/content/exercises/${exerciseId}/practice`),
  getChapterPractice:        (chapterId: string)  => client.get(`/v1/content/chapters/${chapterId}/practice`),
  getSubjectPractice:        (subjectId: string)  => client.get(`/v1/content/subjects/${subjectId}/practice`),

  // Progress tracking (production-level)
  completeVideo:    (videoId: string, userId: string) =>
    client.put(`/v1/content/videos/${videoId}/complete?user_id=${userId}`),
  completeExercise: (exerciseId: string, userId: string, score?: number) =>
    client.put(`/v1/content/exercises/${exerciseId}/complete?user_id=${userId}${score !== undefined ? `&score=${score}` : ""}`),
  completeChapter:  (chapterId: string, userId: string, score?: number) =>
    client.put(`/v1/content/chapters/${chapterId}/complete?user_id=${userId}${score !== undefined ? `&score=${score}` : ""}`),
  completeSubject:  (subjectId: string, userId: string, score?: number) =>
    client.put(`/v1/content/subjects/${subjectId}/complete?user_id=${userId}${score !== undefined ? `&score=${score}` : ""}`),
  getExerciseProgress: (exerciseId: string, userId: string) =>
    client.get(`/v1/content/exercises/${exerciseId}/my-progress?user_id=${userId}`),
  getChapterProgress:  (chapterId: string, userId: string) =>
    client.get(`/v1/content/chapters/${chapterId}/my-progress?user_id=${userId}`),
  getSubjectProgress:  (subjectId: string, userId: string) =>
    client.get(`/v1/content/subjects/${subjectId}/my-progress?user_id=${userId}`),

  // Video progress — persist & resume position
  videoProgress: (videoId: string, userId: string) =>
    client.get(`/v1/content/videos/${videoId}/progress?user_id=${userId}`),
  updateProgress: (
    videoId: string,
    watchedSeconds: number,
    isCompleted: boolean,
    userId: string,
    opts?: { position_seconds?: number; status?: string },
  ) =>
    client.put(`/v1/content/videos/${videoId}/progress?user_id=${userId}`, {
      watched_seconds: watchedSeconds,
      is_completed: isCompleted,
      ...(opts?.position_seconds !== undefined ? { last_position_seconds: opts.position_seconds } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
    }),

  // Continue watching list — matches the gateway route /api/v1/content/continue-watching
  continueWatching: (userId: string, limit = 10) =>
    client.get(`/v1/content/continue-watching?user_id=${userId}&limit=${limit}`),

  // Certificates
  issueCertificate: (userId: string, entityType: "chapter" | "subject", entityId: string, studentName: string, chapterName: string, subjectName?: string, board?: string, classNum?: number) =>
    client.post("/v1/content/certificates", { user_id: userId, entity_type: entityType, entity_id: entityId, student_name: studentName, chapter_name: chapterName, subject_name: subjectName, board, class_num: classNum }),
  listUserCertificates: (userId: string, entityType?: string) =>
    client.get(`/v1/content/certificates/user/${userId}${entityType ? `?entity_type=${entityType}` : ""}`),

  // Seed demo data (creates VideoProgress records for the user)
  seedDemo: (userId?: string) =>
    client.post(`/v1/content/seed-demo${userId ? `?user_id=${userId}` : ""}`),

  // Video feed
  popularVideos: () => client.get("/v1/content/video-feed?sort=popular&limit=24"),
  // Genuinely personalized (weak-topic-driven, falls back to recent when
  // there's no quiz signal yet) — NOT a plain video-feed sort alias.
  recommendedVideos: () => client.get(`/v1/content/videos/recommended?limit=24`),

  // Previous year papers
  getPreviousYearPapers: (params?: Record<string, string | number>) =>
    client.get("/v1/content/previous-year-papers", { params }),

  // PYP attempts — the row always belongs to the authenticated caller, so no
  // user_id is sent. `answers` maps question_id → chosen option ("A".."D");
  // grading is server-side from the paper's practice questions.
  // Start returns { attempt_id } (not { id } — that's the ai_service shape).
  startPypAttempt: (pypId: string) =>
    client.post(`/v1/content/previous-year-papers/${pypId}/attempts`),
  submitPypAttempt: (attemptId: string, answers: Record<string, string>, timeTakenSec?: number) =>
    client.patch(`/v1/content/previous-year-papers/attempts/${attemptId}`,
      { answers, time_taken_sec: timeTakenSec }),
  myPypAttempts: () => client.get("/v1/content/previous-year-papers/attempts/mine"),

  // Knowledge base
  getKnowledgeCategories: () =>
    client.get("/v1/content/knowledge-categories"),
  getKnowledgeArticles: (params?: Record<string, string | number>) =>
    client.get("/v1/content/knowledge-articles", { params }),
  viewKnowledgeArticle: (id: string) =>
    client.post(`/v1/content/knowledge-articles/${id}/view`),

  // All videos in a chapter (across topics)
  chapterVideos: (chapterId: string) =>
    client.get(`/v1/content/chapters/${chapterId}/all-videos`),

  // PYP practice questions
  pypPracticeQuestions: (topicName?: string) =>
    client.get("/v1/content/pyp-practice-questions", { params: topicName ? { topic_name: topicName } : undefined }),

  // Bookmarks (save-for-later videos/notes)
  toggleBookmark: (entityType: "video" | "note", entityId: string) =>
    client.post("/v1/content/bookmarks/toggle", { entity_type: entityType, entity_id: entityId }),
  myBookmarks: (userId: string) =>
    client.get(`/v1/content/bookmarks/${userId}`),

  // Assignments — real completion, derived from UserLearningProgress
  studentAssignments: (studentId: string) =>
    client.get(`/v1/content/assignments/student/${studentId}`),
};

export const searchApi = {
  global: (q: string) => client.get(`/v1/content/search?q=${encodeURIComponent(q)}`),
};
