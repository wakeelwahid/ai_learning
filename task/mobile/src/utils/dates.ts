const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "05 Sep 2026" — empty string for a missing/invalid value. */
export function formatDayMonYear(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "05 Sep 2026, 14:30" */
export function formatDayMonYearTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDayMonYear(iso)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Parses "YYYY-MM-DD HH:MM" (local time) → Date, or null when malformed. */
export function parseLocalDateTime(input: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (
    date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d ||
    date.getHours() !== h || date.getMinutes() !== mi
  ) return null;
  return date;
}

export function startOfTomorrow(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
}
