import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/lib/formatters/dateTime";
import { formatRecordValuesSummary } from "@/lib/formatters/records";
import { safeNextPath, loginUrl } from "@/lib/auth/next";

describe("formatDateTime", () => {
  it("formats with the time zone offset", () => {
    expect(formatDateTime("2026-10-09T07:04:56.123456Z", "Asia/Kolkata")).toBe(
      "October 9, 2026, 12:34:56 (UTC+05:30)",
    );
    expect(formatDateTime("2026-10-09T07:04:56Z", "UTC")).toBe("October 9, 2026, 07:04:56 (UTC+00:00)");
  });

  it("returns a dash for missing or invalid input", () => {
    expect(formatDateTime(null)).toBe("-");
    expect(formatDateTime("not a date")).toBe("-");
  });
});

describe("formatRecordValuesSummary", () => {
  it("summarizes multiple values", () => {
    expect(formatRecordValuesSummary(["192.0.2.10", "192.0.2.11", "192.0.2.12"])).toBe("192.0.2.10 + 2 more");
    expect(formatRecordValuesSummary(["192.0.2.10"])).toBe("192.0.2.10");
    expect(formatRecordValuesSummary([])).toBe("-");
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/hosted-zones/Z123?q=a", "/hosted-zones/Z123?q=a"],
    ["/dashboard", "/dashboard"],
    [null, "/hosted-zones"],
    ["", "/hosted-zones"],
    ["//evil.example.com", "/hosted-zones"],
    ["/\\evil.example.com", "/hosted-zones"],
    ["https://evil.example.com", "/hosted-zones"],
    ["javascript:alert(1)", "/hosted-zones"],
    ["/login?next=/x", "/hosted-zones"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it("builds login URLs", () => {
    expect(loginUrl("/hosted-zones?q=a")).toBe("/login?next=%2Fhosted-zones%3Fq%3Da");
    expect(loginUrl("/")).toBe("/login");
  });
});
