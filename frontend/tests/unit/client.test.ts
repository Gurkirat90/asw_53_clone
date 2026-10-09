import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listZones } from "@/lib/api/hostedZones";
import {
  ApiError,
  apiRequest,
  buildQueryString,
  NETWORK_ERROR_MESSAGE,
  resetUnauthenticatedGuard,
  setUnauthenticatedHandler,
} from "@/lib/api/client";
import { fieldErrorsFromApiError, userMessage } from "@/lib/api/errors";
import { errorEnvelope, jsonResponse } from "../test-utils";

/** Stubs fetch: a function returns a fresh Response per call; anything else is thrown. */
function stubFetch(result: (() => Response) | unknown) {
  const fn = vi.fn(async () => {
    if (typeof result === "function") return (result as () => Response)();
    throw result;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("apiRequest", () => {
  beforeEach(() => {
    resetUnauthenticatedGuard();
  });
  afterEach(() => {
    setUnauthenticatedHandler(null);
    vi.unstubAllGlobals();
  });

  it("parses the error envelope into ApiError", async () => {
    stubFetch(() =>
      jsonResponse(422, errorEnvelope("VALIDATION_ERROR", "The request contains invalid fields.", [
        { field: "values.1.value", message: "Enter a valid IPv4 address." },
      ])),
    );
    const error = await apiRequest("/hosted-zones", { method: "POST", body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "The request contains invalid fields.",
      requestId: "req_0123456789abcdef",
      details: [{ field: "values.1.value", message: "Enter a valid IPv4 address." }],
    });
  });

  it("falls back to UNKNOWN_ERROR when the body is not the envelope", async () => {
    stubFetch(() => new Response("<html>bad gateway</html>", { status: 502, headers: { "X-Request-ID": "req_x" } }));
    const error = await apiRequest("/hosted-zones").catch((e) => e);
    expect(error).toMatchObject({ status: 502, code: "UNKNOWN_ERROR", requestId: "req_x" });
    expect(userMessage(error)).toBe("The service had a problem. Try again.");
  });

  it("returns undefined for 204", async () => {
    stubFetch(() => jsonResponse(204));
    await expect(apiRequest("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("sends JSON with same-origin credentials only when there is a body", async () => {
    const fetchMock = stubFetch(() => jsonResponse(200, { ok: true }));
    await apiRequest("/auth/login", { method: "POST", body: { email: "a" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/login");
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe('{"email":"a"}');

    await apiRequest("/auth/me");
    const [, getInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect((getInit.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(getInit.body).toBeUndefined();
  });

  it("serializes query params, skipping undefined, null, and empty values", async () => {
    expect(buildQueryString({ q: "  ", zone_type: undefined, page: 2, page_size: 20, sort_by: null })).toBe(
      "?page=2&page_size=20",
    );
    expect(buildQueryString({ q: "a b&c" })).toBe("?q=a+b%26c");
    expect(buildQueryString({})).toBe("");
    const fetchMock = stubFetch(() =>
      jsonResponse(200, { items: [], page: 1, page_size: 20, total_items: 0, total_pages: 0 }),
    );
    await listZones({ q: "example", zone_type: "PUBLIC", page: 1 });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/v1/hosted-zones?q=example&zone_type=PUBLIC&page=1");
  });

  it("maps network failures to NETWORK_ERROR", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    const error = await apiRequest("/hosted-zones").catch((e) => e);
    expect(error).toMatchObject({ status: 0, code: "NETWORK_ERROR", message: NETWORK_ERROR_MESSAGE });
  });

  it("re-throws aborts untouched", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    stubFetch(abort);
    await expect(apiRequest("/hosted-zones")).rejects.toBe(abort);
  });

  it("calls the 401 handler once per burst and not for /auth/login or /auth/me", async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    const unauthenticated = () => jsonResponse(401, errorEnvelope("UNAUTHENTICATED", "Sign in again."));

    vi.stubGlobal("fetch", vi.fn(async () => unauthenticated()));
    await apiRequest("/auth/me").catch(() => undefined);
    await apiRequest("/auth/login", { method: "POST", body: {} }).catch(() => undefined);
    expect(handler).not.toHaveBeenCalled();

    await Promise.all([
      apiRequest("/hosted-zones").catch(() => undefined),
      apiRequest("/hosted-zones/Z1").catch(() => undefined),
      apiRequest("/hosted-zones/Z1/records").catch(() => undefined),
    ]);
    expect(handler).toHaveBeenCalledTimes(1);

    resetUnauthenticatedGuard();
    await apiRequest("/hosted-zones").catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe("fieldErrorsFromApiError", () => {
  it("keys messages by dot path, keeping the first per field", () => {
    const error = new ApiError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "invalid",
      details: [
        { field: "name", message: "Enter a valid domain name." },
        { field: "values.0.priority", message: "Enter a whole number." },
        { field: "name", message: "second message" },
      ],
    });
    expect(fieldErrorsFromApiError(error)).toEqual({
      name: "Enter a valid domain name.",
      "values.0.priority": "Enter a whole number.",
    });
    expect(fieldErrorsFromApiError(new Error("boom"))).toEqual({});
  });

  it("never exposes non-API error text", () => {
    expect(userMessage(new Error("Traceback: secret"))).toBe("Something went wrong. Try again.");
    expect(userMessage(new ApiError({ status: 409, code: "RECORD_CONFLICT", message: "Already exists." }))).toBe(
      "Already exists.",
    );
  });
});
