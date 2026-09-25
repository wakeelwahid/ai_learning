import client from "./client";

export const referralApi = {
  getCode:    (userId: string) => client.get(`/v1/referrals/code/${userId}`),
  getRewards: (userId: string) => client.get(`/v1/referrals/rewards/${userId}`),
};
