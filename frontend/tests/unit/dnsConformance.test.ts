import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validateZoneName } from "@/lib/validation/dns";

interface FixtureCase {
  id: string;
  kind: string;
  zone?: string;
  input: unknown;
  valid: boolean;
  expected?: unknown;
}

// Tests run with frontend/ as the working directory.
const fixturePath = resolve(process.cwd(), "../shared/dns-validation-cases.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf-8")) as { version: number; cases: FixtureCase[] };
const zoneCases = fixture.cases.filter((testCase) => testCase.kind === "zone_name");

describe("zone name conformance (shared/dns-validation-cases.json)", () => {
  it("loads the shared fixture", () => {
    expect(fixture.version).toBe(1);
    expect(zoneCases.length).toBeGreaterThan(20);
  });

  it.each(zoneCases.map((testCase) => [testCase.id, testCase] as const))("%s", (_id, testCase) => {
    const result = validateZoneName(testCase.input);
    if (testCase.valid) {
      expect(result).toEqual({ ok: true, normalized: testCase.expected });
    } else {
      expect(result.ok).toBe(false);
    }
  });
});
