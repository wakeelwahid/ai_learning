import client from "./client";

export type BattleType =
  | "solo" | "1v1" | "group" | "public" | "team"
  | "class_battle" | "school_battle" | "subject" | "chapter" | "study_party";

export interface CreateBattleParams {
  battle_type:     BattleType;
  subject?:        string;
  topic?:          string;
  board?:          string;
  class_num?:      number;
  difficulty?:     "easy" | "medium" | "hard";
  question_count?: number;
  time_limit_sec?: number;
  max_players?:    number;
  team_a_name?:    string;
  team_b_name?:    string;
  class_a?:        string;
  class_b?:        string;
  school_a?:       string;
  school_b?:       string;
}

const qs = (userId: string, displayName: string, avatarUrl?: string) =>
  `user_id=${userId}&display_name=${encodeURIComponent(displayName)}${avatarUrl ? `&avatar_url=${encodeURIComponent(avatarUrl)}` : ""}`;

export const battleApi = {
  create: (params: CreateBattleParams, userId: string, displayName: string, avatarUrl?: string) =>
    client.post(`/v1/battles?${qs(userId, displayName, avatarUrl)}`, params),
  // Growth Dashboard "Challenge Friend": one-shot private 1v1 vs an ACCEPTED
  // friend. Friendship is enforced server-side (403 for strangers); the friend
  // is notified (in-app + push) automatically. → {battle_id, invite_code, ...}
  challengeFriend: (params: {
    friend_id: string;
    subject?: string;
    topic?: string;
    difficulty?: "easy" | "medium" | "hard";
    question_count?: number;  // derived server-side from time_limit_sec
    time_limit_sec?: number;  // 10/20/30 min in the UI
    stake_xp?: number;        // 50-500 — winner takes it, loser pays it
  }) => client.post("/v1/battles/challenge", params),
  listOpen: (params?: { subject?: string; limit?: number }) =>
    client.get("/v1/battles/open", { params }),
  join: (inviteCode: string, userId: string, displayName: string, avatarUrl?: string) =>
    client.post(`/v1/battles/join?${qs(userId, displayName, avatarUrl)}`, { invite_code: inviteCode }),
  joinById: (battleId: string, userId: string, displayName: string, avatarUrl?: string) =>
    client.post(`/v1/battles/${battleId}/join-by-id?${qs(userId, displayName, avatarUrl)}`),
  get: (battleId: string) =>
    client.get(`/v1/battles/${battleId}`),
  start: (battleId: string, userId: string) =>
    client.post(`/v1/battles/${battleId}/start?user_id=${userId}`),
  // Host-only: reroll the lobby's question set (same subject/topic, fresh
  // random questions). Other clients receive them via "questions_regenerated".
  regenerateQuestions: (battleId: string) =>
    client.post(`/v1/battles/${battleId}/regenerate-questions`),
  submitAnswer: (battleId: string, userId: string, data: { battle_id: string; question_idx: number; answer: string; time_taken_ms: number }) =>
    client.post(`/v1/battles/${battleId}/answer?user_id=${userId}`, data),
  finish: (battleId: string) =>
    client.post(`/v1/battles/${battleId}/finish`),
  spectate: (battleId: string, userId: string, displayName: string) =>
    client.post(`/v1/battles/${battleId}/spectate?user_id=${userId}&display_name=${encodeURIComponent(displayName)}`),
  stats: (userId: string) =>
    client.get(`/v1/battles/stats/${userId}`),
  history: (userId: string) =>
    client.get(`/v1/battles/history/${userId}`),
  leaderboard: () =>
    client.get("/v1/battles/leaderboard/global"),
  rematch: (battleId: string, userId: string, displayName: string) =>
    client.post(`/v1/battles/${battleId}/rematch`, null, { params: { user_id: userId, display_name: displayName } }),
  getReplay: (battleId: string, userId: string) =>
    client.get(`/v1/battles/${battleId}/replay`, { params: { user_id: userId } }),
  getReview: (battleId: string, userId: string) =>
    client.get(`/v1/battles/${battleId}/review`, { params: { user_id: userId } }),
  myBattles: (userId: string, limit = 10, offset = 0) =>
    client.get("/v1/battles/my", { params: { user_id: userId, limit, offset } }),
};
