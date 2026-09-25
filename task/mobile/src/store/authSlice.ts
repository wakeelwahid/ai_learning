import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "@/api/auth";

interface AuthState {
  token: string | null;
  user:  User | null;
  // Last-known profile-completion state, for instant UI decisions only —
  // NEVER the actual gate. App.tsx always re-verifies against
  // GET /auth/profile-status before showing the main app.
  profileComplete: boolean | null;
}

const initialState: AuthState = { token: null, user: null, profileComplete: null };

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ token: string; user: User }>) => {
      state.token = action.payload.token;
      state.user  = action.payload.user;
    },
    setProfileComplete: (state, action: PayloadAction<boolean | null>) => {
      state.profileComplete = action.payload;
    },
    clearCredentials: (state) => {
      state.token = null;
      state.user  = null;
      state.profileComplete = null;
    },
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) Object.assign(state.user, action.payload);
    },
  },
});

export const { setCredentials, setProfileComplete, clearCredentials, updateUser } = authSlice.actions;
export default authSlice.reducer;
