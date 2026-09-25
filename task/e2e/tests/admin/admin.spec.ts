import { test, expect } from "@playwright/test";

// Real admin/superadmin credentials — email+password login (not OTP).
// Password comes from services/auth_service/.env ADMIN_PASSWORD.
const ADMIN_EMAIL = "admin@edtech.com";
const ADMIN_PASSWORD = "jxu97VGPnHVR9mIK7vsv!";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByPlaceholder("admin@edtech.com").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("••••••••").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in to Admin Panel" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test.describe("Admin panel", () => {
  test("rejects empty submit and shows a client-side error", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in to Admin Panel" }).click();
    await expect(page.getByText("Please enter email and password.")).toBeVisible();
    // Still on the login page, never navigated anywhere.
    await expect(page).toHaveURL(/\/login/);
  });

  test("rejects wrong credentials with a real backend error", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("admin@edtech.com").fill(ADMIN_EMAIL);
    await page.getByPlaceholder("••••••••").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in to Admin Panel" }).click();
    await expect(page.locator("text=/Login failed|Invalid|incorrect/i")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("logs in with real admin credentials and reaches the dashboard", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("Users page loads real user data", async ({ page }) => {
    await login(page);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
    // The users table should render at least one real row (seeded data exists).
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });
  });

  test("Payments page loads", async ({ page }) => {
    await login(page);
    await page.goto("/payments");
    await expect(page.getByRole("heading", { name: "Payments & Subscriptions" })).toBeVisible();
  });

  test("Moderation page loads", async ({ page }) => {
    await login(page);
    await page.goto("/moderation");
    await expect(page.getByRole("heading", { name: "Moderation", exact: true })).toBeVisible();
  });

  test("Contact Messages page (added this session) renders", async ({ page }) => {
    await login(page);
    await page.goto("/contact-messages");
    await expect(page.getByRole("heading", { name: "Contact Messages" })).toBeVisible();
    await expect(page.getByText("Submissions from the public Contact Us page")).toBeVisible();
    // Either the empty state or the data table must render — both are real,
    // meaningful outcomes (not a crash / blank page).
    await expect(
      page.getByText("No messages").or(page.locator("table"))
    ).toBeVisible({ timeout: 15_000 });
  });

  test("sidebar navigation link for Contact Messages exists and works", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Contact Messages" }).click();
    await expect(page).toHaveURL(/\/contact-messages/);
    await expect(page.getByRole("heading", { name: "Contact Messages" })).toBeVisible();
  });
});
