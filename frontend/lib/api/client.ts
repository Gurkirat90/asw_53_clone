// The single HTTP client. Every API call goes through apiRequest().
import type { ApiErrorBody, ApiFieldError } from "./types";

export const API_BASE = "/api/v1";
export const NETWORK_ERROR_MESSAGE = "Unable to reach the service. Check your connection and retry.";

/** Paths whose 401 is an expected answer, not an expired session. */
const UNAUTHENTICATED_EXEMPT_PATHS = new Set(["/auth/login", "/auth/me"]);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiFieldError[];
  readonly requestId: string | null;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    details?: ApiFieldError[];
    requestId?: string | null;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details ?? [];
    this.requestId = options.requestId ?? null;
  }
}

let unauthenticatedHandler: (() => void) | null = null;
let unauthenticatedFired = false;

/** Registers the app-wide reaction to an expired session (redirect to /login). */
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  unauthenticatedHandler = handler;
}

/** Re-arms the 401 handler; called once the login page is shown. */
export function resetUnauthenticatedGuard(): void {
  unauthenticatedFired = false;
}

export type QueryValue = string | number | boolean | null | undefined;

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, QueryValue> | object;
  body?: unknown;
  signal?: AbortSignal;
}

export function buildQueryString(query: ApiRequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, QueryValue>)) {
    if (value === undefined || value === null) continue;
    const text = String(value);
    if (text.trim() === "") continue;
    params.append(key, text);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function isErrorEnvelope(body: unknown): body is ApiErrorBody {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const error = (body as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get("X-Request-ID");
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (isErrorEnvelope(body)) {
    return new ApiError({
      status: response.status,
      code: body.error.code,
      message: body.error.message,
      details: Array.isArray(body.error.details) ? body.error.details : [],
      requestId: body.error.request_id ?? requestId,
    });
  }
  return new ApiError({
    status: response.status,
    code: "UNKNOWN_ERROR",
    message: `The service returned an unexpected response (HTTP ${response.status}).`,
    requestId,
  });
}

function isAbortError(error: unknown): boolean {
  // Checked by name: DOMException is not an Error subclass in every runtime.
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, signal } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = { method, credentials: "same-origin", headers, signal };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}${buildQueryString(query)}`, init);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError({ status: 0, code: "NETWORK_ERROR", message: NETWORK_ERROR_MESSAGE });
  }

  if (!response.ok) {
    const apiError = await toApiError(response);
    if (
      response.status === 401 &&
      !UNAUTHENTICATED_EXEMPT_PATHS.has(path) &&
      !unauthenticatedFired &&
      unauthenticatedHandler
    ) {
      unauthenticatedFired = true;
      unauthenticatedHandler();
    }
    throw apiError;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
