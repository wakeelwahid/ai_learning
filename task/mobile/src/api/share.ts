import client from "./client";

export const shareApi = {
  getShareCard: (userId: string, achievementType: string) =>
    client.get(`/v1/gamification/share-card/${userId}/${achievementType}`),
  recordShare: (data: { user_id: string; achievement_type: string; platform: string }) =>
    client.post("/v1/gamification/share-event", data),
};
