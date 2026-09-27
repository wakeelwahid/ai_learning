import client from "./client";
import { getDeviceId } from "./deviceId";

export const notificationApi = {
  getNotifications: (userId: string, limit = 20) =>
    client.get(`/v1/notifications/user/${userId}`, { params: { limit } }),
  markAllRead: (userId: string) =>
    client.patch(`/v1/notifications/user/${userId}/read`),
  markBulkRead: (notificationIds: string[]) =>
    client.post("/v1/notifications/mark-read", { notification_ids: notificationIds }),
  getPreferences: (userId: string) => client.get(`/v1/notifications/preferences/${userId}`),
  updatePreferences: (userId: string, prefs: Record<string, boolean>) =>
    client.put(`/v1/notifications/preferences/${userId}`, prefs),
  // device_id is a stable per-install identifier (see api/deviceId.ts) —
  // without it, a second device on the same platform would silently evict
  // the first device's token server-side. userId is accepted for backward
  // compatibility with existing callers but ignored server-side (identity
  // always comes from the Bearer token).
  registerPushToken: async (userId: string, token: string, platform: string) => {
    const device_id = await getDeviceId();
    return client.post("/v1/notifications/push-token", { user_id: userId, token, platform, device_id });
  },
  // Call on logout so a signed-out device stops receiving push immediately,
  // rather than continuing to receive notifications for whoever logs in
  // next on the same physical device.
  unregisterPushToken: async () => {
    const device_id = await getDeviceId();
    return client.delete(`/v1/notifications/push-token/${device_id}`);
  },
  submitFeedback: (userId: string, rating: number, category: string, message: string) =>
    client.post("/v1/notifications/feedback", { user_id: userId, rating, category, message }),
};
