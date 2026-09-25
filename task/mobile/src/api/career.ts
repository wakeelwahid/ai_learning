import client from "./client";

export const opportunityApi = {
  hubSummary: () => client.get("/v1/careers/opportunities/hub-summary"),
  list: (params?: { category?: string; subcategory?: string; active_only?: boolean; limit?: number }) =>
    client.get("/v1/careers/opportunities", { params }),
  get: (id: string) => client.get(`/v1/careers/opportunities/${id}`),
  upcoming: (days = 14) => client.get(`/v1/careers/opportunities/upcoming?days=${days}`),
};

export const careerApi = {
  list: (params?: { category?: string; search?: string; limit?: number }) =>
    client.get("/v1/careers", { params }),
  categories: () => client.get("/v1/careers/categories"),
  get: (idOrSlug: string) => client.get(`/v1/careers/${idOrSlug}`),
  setGoal: (userId: string, careerId: string, isPrimary = false, notes?: string) =>
    client.post(`/v1/careers/goals/set?user_id=${userId}`, {
      career_id: careerId,
      is_primary: isPrimary,
      notes,
    }),
  getGoals: (userId: string) => client.get(`/v1/careers/goals/my?user_id=${userId}`),
  deleteGoal: (userId: string, careerId: string) =>
    client.delete(`/v1/careers/goals/${careerId}?user_id=${userId}`),
  skillGap: (userId: string, careerId: string, studentScores: Record<string, number>) =>
    client.post(`/v1/careers/skill-gap?user_id=${userId}`, {
      career_id: careerId,
      student_scores: studentScores,
    }),
  latestAssessment: (userId: string, careerId: string) =>
    client.get(`/v1/careers/skill-gap/${careerId}/latest?user_id=${userId}`),
  dashboard: (userId: string) => client.get(`/v1/careers/dashboard/my?user_id=${userId}`),
};
