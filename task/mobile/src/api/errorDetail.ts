/**
 * Human-readable message from an axios error: the backend's `detail` string,
 * or the first `msg` of a pydantic 422 error array, else the fallback.
 */
export function errorDetail(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === "string") return first;
    if (typeof first?.msg === "string") return first.msg;
  }
  return fallback;
}
