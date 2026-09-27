import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface AdminUser {
  id: string;
  email: string;
  role: "admin" | "super_admin";
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AdminUser | null;
}

const initialState: AuthState = {
  token: null,
  refreshToken: null,
  user: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setTokens(state, action: PayloadAction<{ access: string; refresh: string }>) {
      state.token = action.payload.access;
      state.refreshToken = action.payload.refresh;
    },
    setUser(state, action: PayloadAction<AdminUser | null>) {
      state.user = action.payload;
    },
    logout(state) {
      state.token = null;
      state.refreshToken = null;
      state.user = null;
    },
  },
});

export const { setTokens, setUser, logout } = authSlice.actions;
export default authSlice.reducer;
