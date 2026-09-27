import { test, expect } from "@playwright/test";

// Pure frontend form-validation checks on the real Login page UI. These
// exercise client-side validation only (phoneFieldError / isValidPhone in
// LoginPage.tsx) and never require a backend call to succeed.
//
// The app gates every route behind a one-time language-select screen
// (App.tsx: `langPicked` state, seeded from `localStorage.app_language`).
// Pre-seeding that key before each test's first navigation skips the
// gate so /login renders directly, matching how a returning visitor
// (who already picked a language) experiences the site.
test.describe("Frontend login page — client-side validation", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("app_language", "en");
    });
  });


  test("empty submit is blocked — Send OTP stays disabled", async ({ page }) => {
    await page.goto("/login");
    const sendBtn = page.getByRole("button", { name: /Send OTP/i });
    await expect(sendBtn).toBeDisabled();
  });

  test("a too-short phone number shows a field error and keeps submit disabled", async ({ page }) => {
    await page.goto("/login");
    const phoneInput = page.getByPlaceholder("98765 43210");
    await phoneInput.fill("123");
    await expect(page.getByText("Enter a 10-digit mobile number.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Send OTP/i })).toBeDisabled();
  });

  test("a 10-digit number not starting 6-9 is rejected as invalid", async ({ page }) => {
    await page.goto("/login");
    const phoneInput = page.getByPlaceholder("98765 43210");
    await phoneInput.fill("1234567890");
    await expect(page.getByText("Enter a valid Indian mobile number.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Send OTP/i })).toBeDisabled();
  });

  test("non-digit characters are stripped as typed (input sanitization)", async ({ page }) => {
    await page.goto("/login");
    const phoneInput = page.getByPlaceholder("98765 43210");
    // Use real per-character keystrokes (pressSequentially), not fill(): the
    // input has a native maxLength=10 attribute, so a one-shot fill() of a
    // 20-char string gets silently truncated by the browser BEFORE React's
    // sanitizePhoneInput onChange handler ever runs on the full string —
    // that's a Playwright fill()-vs-real-typing mismatch, not an app bug.
    await phoneInput.pressSequentially("abc98def76543210xyz");
    // sanitizePhoneInput strips non-digits and caps at 10 chars.
    await expect(phoneInput).toHaveValue("9876543210");
  });

  test("a valid 10-digit phone number enables the Send OTP button", async ({ page }) => {
    await page.goto("/login");
    const phoneInput = page.getByPlaceholder("98765 43210");
    await phoneInput.fill("9876543210");
    await expect(page.getByText(/Enter a/)).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Send OTP/i })).toBeEnabled();
  });

  test("wrong-length OTP (fewer than 6 digits) keeps Verify disabled", async ({ page, request }) => {
    await page.goto("/login");
    const phoneInput = page.getByPlaceholder("98765 43210");
    await phoneInput.fill("9876543210");
    await page.getByRole("button", { name: /Send OTP/i }).click();

    // Wait for the OTP step to render (real backend call — send endpoint
    // always returns 200 even without a real SMS provider in dev).
    await expect(page.getByText(/We sent a 6-digit code to/)).toBeVisible({ timeout: 15_000 });

    const otpInputs = page.locator("div.flex.gap-1\\.5 input, div.flex.gap-2 input");
    const count = await otpInputs.count();
    expect(count).toBe(6);

    // Only fill 4 of the 6 digits — an intentionally wrong length.
    for (let i = 0; i < 4; i++) {
      await otpInputs.nth(i).fill(String(i + 1));
    }
    await expect(page.getByRole("button", { name: /Verify & Continue/i })).toBeDisabled();
  });
});
