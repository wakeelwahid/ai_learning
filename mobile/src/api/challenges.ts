import client from "./client";

export const challengeApi = {
  listPublished: () => client.get("/v1/gamification/challenge-programs/published"),
  getById: (id: string) => client.get(`/v1/gamification/challenge-programs/${id}`),
  join: (id: string) => client.post(`/v1/gamification/challenge-programs/${id}/join`),
  getEnrollment: (userId: string, programId: string) =>
    client.get(`/v1/gamification/challenge-programs/enrollments/${userId}/${programId}`),
  getMyEnrollments: (userId: string) =>
    client.get(`/v1/gamification/challenge-programs/enrollments/${userId}`),
};
