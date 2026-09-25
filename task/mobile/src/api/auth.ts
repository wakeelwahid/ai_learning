import client from "./client";
import { getRefreshToken } from "./secureStorage";

export interface LoginPayload  { identifier: string; password: string }
export interface UpdateProfilePayload { phone?: string; full_name?: string; school_name?: string; avatar_url?: string }
export interface TokenResponse { access_token: string; refresh_token: string; token_type: string; expires_in: number }

export interface User {
  id:             string;
  user_id?:       string;
  email:          string | null;
  full_name:      string;
  school_name:    string | null;
  // "pending" only ever appears between OTP verify and RoleSelectScreen —
  // see setRole() below; no screen should treat it as a real role.
  // "teacher"/"super_admin" accounts are always admin-created directly with
  // that role — they never pass through RoleSelectScreen/setRole().
  role:           "student" | "parent" | "admin" | "teacher" | "super_admin" | "pending";
  avatar_url:     string | null;
  is_active:      boolean;
  google_id?:     string | null;
  phone?:         string | null;
  phone_verified?: boolean;
}

export interface PhoneOtpSentResponse { sent: boolean; expires_in_seconds: number }
export interface PhoneLoginResponse extends TokenResponse { is_new_user: boolean; profile_complete: boolean }

export interface DeviceSession {
  session_id:  string;
  device_type: string | null;
  os:          string | null;
  browser:     string | null;
  ip_address:  string | null;
  last_seen:   string;
  created_at:  string;
}

export const authApi = {
  // NOTE: /auth/login returns tokens ONLY (TokenResponse) — no user object.
  // Fetch the user via authApi.me() after storing the access token.
  login:          (data: LoginPayload) =>
    client.post<TokenResponse>("/v1/auth/login", data),
  me:             ()                             => client.get<User>("/v1/auth/me"),
  // Backend logout requires the refresh token in the body (it revokes it
  // and blacklists the current access token); a bodyless POST 422s.
  logout:         async () => {
    const refresh_token = (await getRefreshToken()) ?? "";
    return client.post("/v1/auth/logout", { refresh_token });
  },
  refresh:        (refresh_token: string) =>
    client.post<TokenResponse>("/v1/auth/refresh", { refresh_token }),
  googleOAuthUrl: ()                             => client.get<{ redirect_url: string; provider: string }>("/v1/auth/google?mobile=1"),
  profileStatus:  ()                             => client.get<{ profile_complete: boolean }>("/v1/auth/profile-status"),
  sendPhoneOtp:   (phone: string)                => client.post<PhoneOtpSentResponse>("/v1/auth/otp/send", { phone }),
  // Role is no longer sent at verify time — a brand-new account is created
  // with role=pending and the client calls setRole() once, right after
  // this, when is_new_user is true. An existing phone just logs in
  // unaffected.
  verifyPhoneOtp: (phone: string, otp: string) =>
    client.post<PhoneLoginResponse>("/v1/auth/otp/verify", { phone, otp }),
  setRole:        (role: "student" | "parent")   => client.patch<User>("/v1/auth/role", { role }),
  updateProfile:  (data: UpdateProfilePayload)   => client.put<User>("/v1/auth/profile", data),
  forgotPassword: (email: string)                => client.post("/v1/auth/forgot-password", { email }),
  resetPassword:  (token: string, new_password: string) =>
    client.post("/v1/auth/reset-password", { token, new_password }),
  googleVerify:     (id_token: string)     => client.post("/v1/auth/google/verify", { id_token }),
  changePassword: (currentPassword: string, newPassword: string) =>
    client.post("/v1/auth/change-password", { current_password: currentPassword, new_password: newPassword }),
  disconnectGoogle: ()                     => client.post<User>("/v1/auth/google/disconnect"),
  getSessions:      ()                     => client.get<DeviceSession[]>("/v1/auth/sessions"),
  revokeSession:    (sessionId: string)    => client.delete(`/v1/auth/sessions/${sessionId}`),
  deleteAccount:    ()                     => client.delete("/v1/auth/me"),
};
