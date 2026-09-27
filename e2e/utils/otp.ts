import { execFileSync } from "node:child_process";

/**
 * Dev-only helper: reads the most recent OTP code for a phone number
 * straight out of the auth_service Postgres container. Mirrors the manual
 * testing pattern documented for this stack — there is no SMS provider
 * wired up in dev, so this is the only way to obtain a real OTP.
 *
 * This must run host-side (Node, via docker exec), never inside the
 * browser context.
 */
export function readOtpFromDb(phone: string): string {
  const sql = `SELECT code FROM phone_otps WHERE phone = '${phone}' ORDER BY expires_at DESC LIMIT 1;`;
  const out = execFileSync(
    "docker",
    ["exec", "auth_service_postgres", "psql", "-U", "edtech_user", "-d", "edtech_user", "-t", "-c", sql],
    { encoding: "utf-8" }
  );
  const code = out.trim();
  if (!code) {
    throw new Error(`No OTP found in DB for phone ${phone}`);
  }
  return code;
}
