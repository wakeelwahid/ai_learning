export function parseApiError(err: unknown): string {
  if (!err || typeof err !== "object") return "Something went wrong. Please try again.";

  const error = err as Record<string, any>;

  if (!error.response) {
    if (error.code === "ECONNABORTED") return "Request timed out. Please try again.";
    return "Unable to connect to the server. Please check your connection.";
  }

  const { status, data } = error.response;

  if (status === 401) return "Incorrect email or password.";
  if (status === 403) return "You do not have permission to access the admin panel.";
  if (status === 409) return data?.detail ?? "A conflict occurred. Please try again.";
  if (status === 429) return "Too many login attempts. Please wait before trying again.";
  if (status >= 500) return "Server error. Please try again in a moment.";

  const detail = data?.detail;
  if (!detail) return `Request failed (${status}). Please try again.`;
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail.map((e: Record<string, any>) => {
      const field = (e.loc ?? []).slice(-1)[0] ?? "input";
      return `${String(field).replace(/_/g, " ")}: ${e.msg}`;
    }).join(" | ");
  }

  return "Something went wrong. Please try again.";
}
