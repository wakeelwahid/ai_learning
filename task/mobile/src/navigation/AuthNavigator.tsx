import React, { useState } from "react";
import LoginScreen          from "@/screens/auth/LoginScreen";
import RoleSelectScreen     from "@/screens/auth/RoleSelectScreen";
import ProfileCompleteScreen from "@/screens/auth/ProfileCompleteScreen";
// Email/password sign-up has been removed entirely (RegisterScreen.tsx and
// its backend routes are gone) — students/parents sign up and log in with
// Mobile Number + OTP only, which auto-creates a new account on first
// verify. Forgot/reset-password is a separate, still-intact feature (admin
// accounts still use email+password) — its screens are kept, just
// unreached from this navigator since the admin app is a separate web app.
// import ForgotPasswordScreen from "@/screens/auth/ForgotPasswordScreen";
// import ResetPasswordScreen  from "@/screens/auth/ResetPasswordScreen";

interface Props {
  onAuth: () => void;
}

export default function AuthNavigator({ onAuth }: Props) {
  const [screen, setScreen] = useState<"login" | "role-select" | "profile-complete">("login");

  if (screen === "role-select") {
    return <RoleSelectScreen onDone={() => setScreen("profile-complete")} />;
  }

  if (screen === "profile-complete") {
    return <ProfileCompleteScreen onDone={onAuth} />;
  }

  return (
    <LoginScreen
      onLogin={onAuth}
      onRoleSelect={() => setScreen("role-select")}
      onProfileIncomplete={() => setScreen("profile-complete")}
    />
  );
}
