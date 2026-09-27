/**
 * Converts any axios error into a single human-readable string.
 *
 * Every backend service in this codebase (see UnauthorizedError,
 * ConflictError, ForbiddenError, NotFoundError, and the structured
 * {code, message} detail used by OTP routes) already raises clean,
 * user-facing detail text — so the backend's own message is shown
 * verbatim whenever one is present. The status-code fallbacks below only
 * apply when the response genuinely carries no usable detail at all (a
 * network failure, or an infra-level error — e.g. a proxy/timeout — that
 * never reached the application and so never got the chance to describe
 * itself).
 */
export function parseApiError(err: unknown): string {
  if (!err || typeof err !== "object") return "Something went wrong. Please try again.";

  const error = err as Record<string, any>;

  // Network / no response — nothing from the backend to show.
  if (!error.response) {
    if (error.code === "ECONNABORTED") return "Request timed out. Please try again.";
    return "Unable to connect. Please check your internet connection.";
  }

  const { status, data } = error.response;
  const detail = data?.detail;

  // Structured detail, e.g. OTP routes: {code, message}.
  if (detail && typeof detail === "object" && !Array.isArray(detail) && typeof detail.message === "string") {
    return detail.message;
  }

  // Plain string detail — every custom exception in these services raises one.
  if (typeof detail === "string" && detail.trim()) return detail;

  // Raw Pydantic 422 validation array (only shape without a ready-made message).
  if (Array.isArray(detail)) {
    const messages = detail.map((e: Record<string, any>) => {
      const loc: string[] = e.loc ?? [];
      const field = loc[loc.length - 1] ?? "input";
      const label = field === "body" ? "Request" : field.replace(/_/g, " ");
      const msg = (e.msg as string)
        .replace("Value error, ", "")
        .replace("String should ", "Should ")
        .replace("value is not a valid email address", "Please enter a valid email address");
      return `${label.charAt(0).toUpperCase() + label.slice(1)}: ${msg}.`;
    });
    return messages.join(" ");
  }

  // No usable detail from the backend at all — last-resort generic text.
  const statusMessages: Record<number, string> = {
    400: "The request could not be processed. Please check your input.",
    401: "You are not authorized to perform this action.",
    403: "You do not have permission to perform this action.",
    404: "The requested resource was not found.",
    409: "This already exists.",
    429: "Too many attempts. Please wait a moment and try again.",
    500: "Something went wrong on our end. Please try again in a moment.",
    502: "Service is temporarily unavailable. Please try again shortly.",
    503: "Service is temporarily unavailable. Please try again shortly.",
  };
  return statusMessages[status] ?? "Something went wrong. Please try again.";
}
