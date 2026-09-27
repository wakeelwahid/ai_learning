import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { clearCredentials } from "./authSlice";

interface ParentState {
  selectedChildId: string | null;
}

const initialState: ParentState = { selectedChildId: null };

const parentSlice = createSlice({
  name: "parent",
  initialState,
  reducers: {
    setSelectedChildId: (state, action: PayloadAction<string | null>) => {
      state.selectedChildId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(clearCredentials, (state) => {
      state.selectedChildId = null;
    });
  },
});

export const { setSelectedChildId } = parentSlice.actions;
export default parentSlice.reducer;
