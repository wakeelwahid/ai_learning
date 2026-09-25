import client from "./client";

export interface CreateProfilePayload {
  user_id:      string;
  full_name:    string;
  board?:       string;
  class_number?: number;
  school_name?: string;
}

export const userApi = {
  studyTime: (userId: string) =>
    client.get(`/v1/users/study-time/${userId}`),
  createProfile: (data: CreateProfilePayload) =>
    client.post("/v1/users/profile", data),
};
