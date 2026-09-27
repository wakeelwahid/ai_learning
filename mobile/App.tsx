import React, { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

// Keep the native splash screen up until Inter finishes loading, so the
// gate below (render null pre-fonts) never shows a bare white flash.
SplashScreen.preventAutoHideAsync().catch(() => {});

import { store, persistor } from "@/store";
import { LanguageProvider, LANG_KEY } from "@/contexts/LanguageContext";
import { useAppSelector, useAppDispatch } from "@/store";
import { setCredentials, setProfileComplete, clearCredentials } from "@/store/authSlice";
import { authApi } from "@/api/auth";
import { setOnRefreshFailed } from "@/api/client";
import { getAccessToken } from "@/api/secureStorage";

// A failed token refresh (expired/revoked refresh token) must log the user
// out the same way a manual logout does. client.ts can't dispatch directly
// without risking an import cycle (api -> store -> ... -> api), so it calls
// this handler instead — registered once, outside any component, since
// it's wiring two module-level singletons (the axios client, the store)
// together, not per-render state.
setOnRefreshFailed(() => store.dispatch(clearCredentials()));
import LanguageSelectScreen from "@/screens/onboarding/LanguageSelectScreen";
import AuthNavigator         from "@/navigation/AuthNavigator";
import MainNavigator         from "@/navigation/MainNavigator";
import { linking }           from "@/navigation/linking";
import ProfileCompleteScreen from "@/screens/auth/ProfileCompleteScreen";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

function RootNavigator() {
  const token = useAppSelector(s => s.auth.token);
  const user  = useAppSelector(s => s.auth.user);
  const profileComplete = useAppSelector(s => s.auth.profileComplete);
  const dispatch = useAppDispatch();
  const [langReady, setLangReady] = useState<boolean | null>(null);
  const [profileCheck, setProfileCheck] = useState<"checking" | "done">("checking");
  const [tokenBootstrapped, setTokenBootstrapped] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then(val => {
      setLangReady(Boolean(val));
    });
  }, []);

  // The access token is never persisted to disk in plaintext (see
  // store/index.ts's stripToken transform — redux-persist always rehydrates
  // it as null) — re-read the real value from SecureStore once on launch so
  // a returning user with a saved `user` object doesn't get bounced to the
  // login screen every restart. If there's no persisted user either, this
  // is a genuinely fresh install/logout, and staying token-less is correct.
  useEffect(() => {
    if (!user?.id) { setTokenBootstrapped(true); return; }
    getAccessToken()
      .then(stored => {
        if (stored) dispatch(setCredentials({ token: stored, user }));
      })
      .finally(() => setTokenBootstrapped(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Self-heal sessions persisted without a user object (a past login-flow bug
  // stored `user: undefined`, leaving every screen with an empty user id):
  // if we hold a token but no user, fetch /auth/me once and repair the store.
  useEffect(() => {
    if (token && !user?.id) {
      authApi.me()
        .then(async ({ data }) => {
          await AsyncStorage.setItem("auth_user", JSON.stringify(data));
          dispatch(setCredentials({ token, user: data }));
        })
        .catch(() => { /* token invalid/expired — 401 interceptor handles it */ });
    }
  }, [token, user?.id, dispatch]);

  // Re-verify profile completeness against the real backend on every app
  // launch/resume with a stored token — catches a user who force-closed the
  // app mid-ProfileCompleteScreen (LoginScreen already handles the
  // just-logged-in case directly via verifyPhoneOtp's response).
  useEffect(() => {
    if (!token) { setProfileCheck("done"); return; }
    setProfileCheck("checking");
    authApi.profileStatus()
      .then(({ data }) => {
        dispatch(setProfileComplete(data.profile_complete));
        setProfileCheck("done");
      })
      .catch(() => {
        // Fail open on a transient error — token layer alone still gates the app.
        dispatch(setProfileComplete(true));
        setProfileCheck("done");
      });
  }, [token, dispatch]);

  // Web only: NavigationContainer's `linking` config resolves the INITIAL
  // screen from whatever path is already sitting in the browser's address
  // bar (e.g. a stale "/profile" left over from a previous session) the
  // moment MainNavigator mounts. Reset the URL to "/" on a genuine
  // falsy->truthy token transition observed WHILE the app is already
  // settled (past the loading gate) — i.e. a fresh login/signup performed
  // on AuthNavigator — but not on the first settled render even if that
  // render already has a token (a restored persisted session on launch),
  // and not on a later render with no token change (a page refresh on an
  // already-logged-in session, or a real deep link — both left alone).
  const pastLoadingGate = langReady !== null && tokenBootstrapped && !(token && profileCheck === "checking");
  const hasSeenSettledRef = useRef(false);
  const hadTokenRef = useRef(!!token);
  useEffect(() => {
    if (!pastLoadingGate) return;
    if (!hasSeenSettledRef.current) {
      hasSeenSettledRef.current = true;
      hadTokenRef.current = !!token;
      return;
    }
    const hadToken = hadTokenRef.current;
    hadTokenRef.current = !!token;
    if (!hadToken && token && Platform.OS === "web" && typeof window !== "undefined") {
      window.history.replaceState(null, "", "/");
    }
  }, [token, pastLoadingGate]);

  if (langReady === null || !tokenBootstrapped || (token && profileCheck === "checking")) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!langReady) {
    return <LanguageSelectScreen onDone={() => setLangReady(true)} />;
  }

  if (!token) {
    return <AuthNavigator onAuth={() => {}} />;
  }

  if (profileComplete === false) {
    return <ProfileCompleteScreen onDone={() => dispatch(setProfileComplete(true))} />;
  }

  return (
    <NavigationContainer linking={linking}>
      <MainNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  // Load Inter before rendering anything — a loading gate (render null)
  // avoids a flash of the OS system font on first paint. Weights match the
  // ones already loaded on web/admin (400/500/600/700, see theme/colors.ts
  // `typography`).
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <QueryClientProvider client={queryClient}>
            <LanguageProvider>
              <RootNavigator />
              <Toast />
            </LanguageProvider>
          </QueryClientProvider>
        </PersistGate>
      </Provider>
    </SafeAreaProvider>
  );
}
