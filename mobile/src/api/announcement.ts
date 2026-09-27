import client from "./client";

export const announcementApi = {
  list: (activeOnly = true) =>
    client.get("/v1/notifications/announcements", { params: { active_only: activeOnly } }),
};
