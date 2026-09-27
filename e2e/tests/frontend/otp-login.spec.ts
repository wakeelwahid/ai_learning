import { test, expect } from "@playwright/test";
import { readOtpFromDb } from "../../utils/otp";

// Real, end-to-end OTP login against the live dev stack. Phone chosen from
// the seeded users table: role=STUDENT, is_new_user=false, and (crucially)
// profile_complete=true, so a successful verify lands straight on
// /dashboard rather than /profile-complete or /role-select.
//
// Verified manually via curl against the gateway before writing this spec:
//   POST /api/v1/auth/otp/send    {"phone":"+919900474185"}
//   POST /api/v1/auth/otp/verify  {"phone":"+919900474185","otp":"<db code>"}
//   -> {"is_new_user":false,"profile_complete":true,"role" (via /me): "student"}
const STUDENT_PHONE_NATIONAL = "9900474185";
const STUDENT_PHONE_E164 = "+919900474185";

test("real OTP login for a seeded student reaches the dashboard", async ({ page }) => {
  // Skip the one-time language-select gate (see login-validation.spec.ts).
  await page.addInitScript(() => {
    localStorage.setItem("app_language", "en");
  });
  await page.goto("/login");
  await page.getByPlaceholder("98765 43210").fill(STUDENT_PHONE_NATIONAL);
  await page.getByRole("button", { name: /Send OTP/i }).click();

  await expect(page.getByText(/We sent a 6-digit code to/)).toBeVisible({ timeout: 15_000 });

  const otp = readOtpFromDb(STUDENT_PHONE_E164);
  expect(otp).toMatch(/^\d{6}$/);

  const otpInputs = page.locator("div.flex.gap-1\\.5 input, div.flex.gap-2 input");
  for (let i = 0; i < 6; i++) {
    await otpInputs.nth(i).fill(otp[i]);
  }

  await page.getByRole("button", { name: /Verify & Continue/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  // Dashboard greets the logged-in student by name in an <h1>.
  await expect(page.locator("h1")).toBeVisible();
});
