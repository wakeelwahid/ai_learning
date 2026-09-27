import client from "./client";

export const quizApi = {
  // List quizzes (general) or by chapter
  list:         (params?: object)           => client.get("/v1/quizzes", { params }),
  // One real quiz for the caller's board & class — used by "Quick Quiz" /
  // daily-goal shortcuts that don't already have a specific quiz_id in hand.
  random:       (params?: { board?: string; class_num?: number }) => client.get("/v1/quizzes/random", { params }),
  listChapter:  (chapterId: string)         => client.get(`/v1/quizzes/chapter/${chapterId}`),
  get:          (id: string)                => client.get(`/v1/quizzes/${id}`),
  getQuestions: (quizId: string)            => client.get(`/v1/quizzes/${quizId}/questions`),
  submitBatch:  (data: object)              => client.post("/v1/quizzes/attempts/batch-submit", data),
  leaderboard:  (classNum: number)          => client.get(`/v1/quizzes/leaderboard/${classNum}`),
  // Per-subject, within board+class — e.g. "CBSE Class 10 Physics Champions"
  subjectLeaderboard: (board: string, classNum: number, subjectId: string, top = 20) =>
    client.get(`/v1/quizzes/leaderboard/subject/${board}/${classNum}/${subjectId}`, { params: { top } }),
  // Attempt lifecycle — paths match the gateway/service exactly
  startAttempt: (quizId: string, userId: string) =>
    client.post("/v1/quizzes/attempts/start", { quiz_id: quizId, user_id: userId }),
  submitAnswer: (attemptId: string, questionId: string, answer: string) =>
    client.post("/v1/quizzes/attempts/answer", { attempt_id: attemptId, question_id: questionId, user_answer: answer }),
  submitQuiz:   (attemptId: string, _userId?: string) =>
    client.post("/v1/quizzes/attempts/submit", { attempt_id: attemptId }),
  getAttempt:   (attemptId: string)         => client.get(`/v1/quizzes/attempts/${attemptId}`),
  // All of the caller's own attempts (server ignores the {user_id} path
  // param and always scopes to the JWT — see attempts.py's IDOR-fix
  // comment). Used to find an in-progress attempt to resume for a given
  // quiz_id when the screen re-opens with no attemptId in hand yet.
  getUserAttempts: (userId: string, limit = 20) =>
    client.get(`/v1/quizzes/attempts/user/${userId}`, { params: { limit } }),
  // State save/restore for pause-resume
  saveState:    (attemptId: string, userId: string, state: object) =>
    client.put(`/v1/quizzes/attempts/${attemptId}/state?user_id=${userId}`, state),
  getState:     (attemptId: string, userId: string) =>
    client.get(`/v1/quizzes/attempts/${attemptId}/state?user_id=${userId}`),
  // PYPs (previous year papers) and per-chapter score
  pyps:         (chapterId: string)         => client.get(`/v1/quizzes/pyps?chapter_id=${chapterId}`),
  chapterScore: (chapterId: string, userId: string) =>
    client.get(`/v1/quizzes/chapter-score?chapter_id=${chapterId}&user_id=${userId}`),
};
