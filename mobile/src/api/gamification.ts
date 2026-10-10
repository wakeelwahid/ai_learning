import client from "./client";

// ── XP / Level ────────────────────────────────────────────────────────────────

// Admin-only now (backend requires an admin token). Students never award XP
// directly; it is granted server-side on quiz/battle/activity. Unused by any
// mobile screen — kept only to document the endpoint.
export const awardXP = (userId: string, event: string, referenceId?: string) =>
  client.post("/v1/gamification/xp/award", {
    user_id: userId,
    event,
    reference_id: referenceId,
  });

export const getProfile = (userId: string) =>
  client.get(`/v1/gamification/profile/${userId}`);

export const getLevelInfo = (userId: string) =>
  client.get(`/v1/gamification/level/${userId}`);

// ── Streaks ───────────────────────────────────────────────────────────────────

export const recordActivity = (userId: string) =>
  client.post("/v1/gamification/streak/record", { user_id: userId });

export const getStreak = (userId: string) =>
  client.get(`/v1/gamification/streak/${userId}`);

// ── EduPoints ─────────────────────────────────────────────────────────────────

export const getEduPointsBalance = (userId: string) =>
  client.get(`/v1/gamification/edupoints/balance/${userId}`);

export const getEduPointsHistory = (userId: string, limit = 50) =>
  client.get(`/v1/gamification/edupoints/history/${userId}?limit=${limit}`);

export const getEduPointsShop = (userId: string) =>
  client.get(`/v1/gamification/edupoints/shop/${userId}`);

// Admin-only now (see awardXP note above). Unused by any mobile screen.
export const awardEduPoints = (userId: string, event: string, referenceId?: string) =>
  client.post("/v1/gamification/edupoints/award", {
    user_id: userId,
    event,
    reference_id: referenceId,
  });

export const spendEduPoints = (userId: string, item: string, referenceId?: string) =>
  client.post("/v1/gamification/edupoints/spend", {
    user_id: userId,
    item,
    reference_id: referenceId,
  });

// ── Leaderboard ───────────────────────────────────────────────────────────────

export const getLeaderboard = (limit = 50) =>
  client.get(`/v1/gamification/leaderboard?limit=${limit}`);

export const getRankRewards = () =>
  client.get("/v1/gamification/leaderboard/rank-rewards");

export const getRankUnlock = (userId: string) =>
  client.get(`/v1/gamification/rank-unlock/${userId}`);

// ── Badges ────────────────────────────────────────────────────────────────────

export const getBadges = () =>
  client.get("/v1/gamification/badges");

export const getUserBadges = (userId: string) =>
  client.get(`/v1/gamification/badges/${userId}`);

// ── Season ────────────────────────────────────────────────────────────────────

export const getCurrentSeason = () =>
  client.get("/v1/gamification/season/current");

// ── YouTube Subscribe Claims ─────────────────────────────────────────────────

export const ytClaimStatus = (userId: string) =>
  client.get(`/v1/gamification/youtube-subscribe/claim/${userId}`);

export const ytSubmitClaim = (userId: string, screenshotB64: string) =>
  client.post("/v1/gamification/youtube-subscribe/claim", {
    user_id: userId,
    screenshot_b64: screenshotB64,
  });

// ── Streak Freeze ─────────────────────────────────────────────────────────────

export const getStreakFreezeStatus = (userId: string) =>
  client.get(`/v1/gamification/streaks/freeze/status/${userId}`);

export const purchaseStreakFreeze = (userId: string) =>
  client.post("/v1/gamification/streaks/freeze/purchase", null, { params: { user_id: userId } });

// ── Daily Goal (Student Engagement System) ────────────────────────────────────

export const getTodaysGoal = (userId: string) =>
  client.get(`/v1/gamification/goals/today/${userId}`);

// ── Daily Challenge (single admin-published challenge/day — distinct from
//    the 3-slot Daily Goals above and from multi-day Challenge Programs) ──────

export const getTodayChallenge = (userId: string) =>
  client.get(`/v1/gamification/challenges/today/${userId}`);

export const recordChallengeProgress = (userId: string, challengeId: string, increment = 1) =>
  client.post("/v1/gamification/challenges/progress", { user_id: userId, challenge_id: challengeId, increment });

export const claimChallengeReward = (userId: string, challengeId: string) =>
  client.post("/v1/gamification/challenges/claim", { user_id: userId, challenge_id: challengeId });

export const getWeeklyChallengeStats = (userId: string) =>
  client.get(`/v1/gamification/challenges/weekly/${userId}`);

export const getMonthlyChallengeStats = (userId: string) =>
  client.get(`/v1/gamification/challenges/monthly/${userId}`);

// ── Daily Rewards (Day 1-7 check-in calendar) ─────────────────────────────────

export const getDailyRewardStatus = (userId: string) =>
  client.get(`/v1/gamification/daily-reward/status/${userId}`);

export const claimDailyReward = (userId: string) =>
  client.post(`/v1/gamification/daily-reward/claim/${userId}`);

// ── Friend Activity Feed ──────────────────────────────────────────────────────

export const getMyActivity = (userId: string, limit = 30) =>
  client.get(`/v1/gamification/activity/mine/${userId}`, { params: { limit } });

export const getFriendsActivity = (userId: string, limit = 30) =>
  client.get(`/v1/gamification/activity/friends/${userId}`, { params: { limit } });

// One specific friend's timeline — friendship-gated server-side (403 for
// non-friends). Powers the "tap a friend's name in a chat" activity view.
export const getFriendActivityOf = (friendId: string, limit = 30) =>
  client.get(`/v1/gamification/activity/friend/${friendId}`, { params: { limit } });

// ── Friends Leaderboard (Growth Dashboard) ────────────────────────────────────
// {entries: [{user_id, full_name, avatar_url, total_xp, level, is_me, rank}],
//  friend_count} — ranked server-side, caller included (full_name null for self).

export const getFriendsLeaderboard = (userId: string) =>
  client.get(`/v1/gamification/leaderboard/friends/${userId}`);

// ── Achievement sharing (virality tracking) ───────────────────────────────────

export const recordShareEvent = (userId: string, achievementType: string, platform: string) =>
  client.post("/v1/gamification/share-event", {
    user_id: userId,
    achievement_type: achievementType,
    platform,
  });

// ── Usage Today widget ──────────────────────────────────────────────────────────
// {tier: "free"|"premium", features: {feature_key: {label, used, limit, remaining}}}
// limit/remaining are null for an unlimited feature (any premium tier, or an
// admin-disabled limit) — read-only, never increments anything.

export const getUsageStatus = (userId: string) =>
  client.get(`/v1/gamification/usage/status/${userId}`);
