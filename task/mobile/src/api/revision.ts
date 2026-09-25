import client from "./client";

export const revisionApi = {
  summary: (userId: string) =>
    client.get(`/v1/analytics/student/${userId}/revision`),
  bookmarks: (userId: string) =>
    client.get(`/v1/content/bookmarks/${userId}`),

  // Session tracking — the row always belongs to the authenticated caller,
  // so no user_id is sent. Same shape as the study-time heartbeat.
  startSession: (body: { topic_id?: string; subject_id?: string; source?: string }) =>
    client.post("/v1/analytics/revision/sessions", body),
  endSession: (sessionId: string, durationSec: number, isCompleted: boolean) =>
    client.patch(`/v1/analytics/revision/sessions/${sessionId}`, {
      duration_sec: durationSec,
      is_completed: isCompleted,
    }),
  mySessions: () => client.get("/v1/analytics/revision/sessions/mine"),
};
