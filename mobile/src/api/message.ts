import client from "./client";

export const messageApi = {
  getThreads: (userId: string) =>
    client.get("/v1/users/messages/threads", { params: { user_id: userId } }),
  getThread: (otherUserId: string, userId: string, since?: string) =>
    client.get(`/v1/users/messages/thread/${otherUserId}`, {
      params: { user_id: userId, ...(since ? { since } : {}) },
    }),
  send: (recipientId: string, userId: string, content: string) =>
    client.post("/v1/users/messages/send", { recipient_id: recipientId, content }, { params: { user_id: userId } }),
  unreadCount: (userId: string) =>
    client.get("/v1/users/messages/unread-count", { params: { user_id: userId } }),
};
