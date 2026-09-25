import { configureStore, combineReducers } from "@reduxjs/toolkit";
import {
  persistStore, persistReducer, createTransform,
  FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER,
  type PersistConfig,
} from "redux-persist";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import authReducer from "./authSlice";
import parentReducer from "./parentSlice";

const rootReducer = combineReducers({ auth: authReducer, parent: parentReducer });
type RootReducerState = ReturnType<typeof rootReducer>;

// The access token must never be written to disk in plaintext — it lives
// only in SecureStore (see api/secureStorage.ts) and in live Redux state
// for this session. This transform strips it from the "auth" slice on the
// way OUT to AsyncStorage (redux-persist's storage engine) and re-inserts
// `token: null` on the way IN, so a restored session always starts
// token-less; App.tsx's bootstrap effect re-hydrates the real token from
// SecureStore once, right after PersistGate resolves.
const stripToken = createTransform(
  (inboundState: any) => ({ ...inboundState, token: null }),
  (outboundState: any) => outboundState,
  { whitelist: ["auth"] },
);

const persistConfig: PersistConfig<RootReducerState> = {
  key:     "root",
  storage: AsyncStorage,
  whitelist: ["auth"],
  transforms: [stripToken],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState   = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
