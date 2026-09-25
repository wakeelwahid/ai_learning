import client from "./client";

export const analyticsApi = {
  dashboard:   (userId: string) => client.get(`/v1/analytics/student/${userId}/dashboard`),
  weakTopics:  (userId: string) => client.get(`/v1/analytics/student/${userId}/weak-topics`),
  progress:    (userId: string) => client.get(`/v1/analytics/student/${userId}/performance`),
  revision:    (userId: string) => client.get(`/v1/analytics/student/${userId}/revision`),
  weeklySummary:(userId: string) => client.get(`/v1/analytics/student/${userId}/weekly-summary`),
  parentSummary:(studentId: string) => client.get(`/v1/analytics/parent/student/${studentId}/summary`),
  heartbeat:   (minutes = 1) => client.post("/v1/analytics/activity/heartbeat", { minutes }),
  // Teacher cohort overview — every student profile set to this exact
  // board + class_number (no teacher-student roster exists on this
  // platform). teacher/admin/super_admin JWT required — 403 otherwise.
  teacherCohort: (board: string, classNumber: number) =>
    client.get(`/v1/analytics/teacher/cohort`, { params: { board, class_number: classNumber } }),
};
