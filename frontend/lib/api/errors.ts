import { ApiError } from "./client";

/** Field errors keyed by dot path (e.g. "values.1.priority"); first message per field wins. */
export function fieldErrorsFromApiError(error: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!(error instanceof ApiError)) return result;
  for (const detail of error.details) {
    if (detail.field && !(detail.field in result)) result[detail.field] = detail.message;
  }
  return result;
}

const GENERIC_MESSAGE = "Something went wrong. Try again.";

/** A safe, user-facing message. Server messages are already user-safe; anything else is not. */
export function userMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status >= 500 || error.code === "UNKNOWN_ERROR") {
      return error.status >= 500 ? "The service had a problem. Try again." : GENERIC_MESSAGE;
    }
    return error.message || GENERIC_MESSAGE;
  }
  return GENERIC_MESSAGE;
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/** Retry only transient failures: network errors and 5xx, never 4xx. */
export function isRetryableError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500);
}
