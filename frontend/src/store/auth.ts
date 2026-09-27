import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface AuthUser {
  id: string;
  email: string | null;
  role: string;
  full_name?: string | null;
  school_name?: string | null;
  phone?: string | null;
  phone_verified?: boolean;
  avatar_url?: string | null;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  // Last-known profile-completion state, purely for instant UI decisions
  // (e.g. SmartIndex's redirect target) — NEVER trusted as the actual gate.
  // ProfileGuard always re-verifies against GET /auth/profile-status before
  // rendering a protected route, so this cannot be used to bypass the gate.
  profileComplete: boolean | null;
}

const initialState: AuthState = {
  token: null,
  refreshToken: null,
  user: null,
  profileComplete: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setTokens(state, action: PayloadAction<{ access: string; refresh: string }>) {
      state.token = action.payload.access;
      state.refreshToken = action.payload.refresh;
    },
    setUser(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
    },
    setProfileComplete(state, action: PayloadAction<boolean | null>) {
      state.profileComplete = action.payload;
    },
    logout(state) {
      state.token = null;
      state.refreshToken = null;
      state.user = null;
      state.profileComplete = null;
    },
  },
});

export const { setTokens, setUser, setProfileComplete, logout } = authSlice.actions;
export default authSlice.reducer;
