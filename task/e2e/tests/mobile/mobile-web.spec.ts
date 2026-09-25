import { test, expect } from "@playwright/test";

// Mobile app served via `expo start --web` (Metro web bundler on :8081).
// The real entry point is App.tsx (registerRootComponent), NOT app/index.tsx
// (that leftover expo-router "Hello World" file is dead code never mounted
// — main in package.json/app.json resolves to index.js -> App.tsx).
//
// Unauthenticated boot sequence, confirmed by probing the live app:
//   1. LanguageSelectScreen ("Select Your Language" + English/Hindi/
//      Punjabi/Urdu options + Continue button)
//   2. AuthNavigator's login screen ("Welcome Back" / phone + OTP form)
//
// Metro's dev bundle is large and this is a cold JS bundle load every time,
// so generous timeouts are used throughout.

test("initial screen renders — language selection", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle", timeout: 60_000 });

  await expect(page.getByText("Select Your Language")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Choose your preferred language")).toBeVisible();

  // All four seeded language options are present as real, distinct choices.
  await expect(page.getByText("Hindi", { exact: true })).toBeVisible();
  await expect(page.getByText("Punjabi", { exact: true })).toBeVisible();
  await expect(page.getByText("Urdu", { exact: true })).toBeVisible();

  await expect(page.getByText("Continue", { exact: true })).toBeVisible();
});

test("basic navigation — selecting a language advances to the login screen", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle", timeout: 60_000 });

  await expect(page.getByText("Select Your Language")).toBeVisible({ timeout: 30_000 });

  // "English" appears twice (script preview label + English name label) —
  // click the first match, which is the selectable language card.
  await page.getByText("English", { exact: true }).first().click();
  await page.getByText("Continue", { exact: true }).click();

  // Lands on the real login screen (Welcome Back / phone + OTP), proving
  // in-app navigation between screens works, not just the initial render.
  await expect(page.getByText("Welcome Back")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Sign in to your account")).toBeVisible();
  await expect(page.getByText("Send OTP", { exact: true })).toBeVisible();
});
