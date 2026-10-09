import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalizeRecordName,
  validateCaa,
  validateHostnameTarget,
  validateIPv4,
  validateIPv6,
  validateMx,
  validateSrv,
  validateTtl,
  validateTxt,
  validateZoneName,
} from "@/lib/validation/dns";

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

type Outcome = { ok: true; normalized: unknown } | { ok: false };

const RUNNERS: Record<string, (testCase: FixtureCase) => Outcome> = {
  zone_name: (c) => validateZoneName(c.input),
  record_name: (c) => canonicalizeRecordName(c.input, c.zone ?? ""),
  hostname: (c) => validateHostnameTarget(c.input),
  ipv4: (c) => validateIPv4(c.input),
  ipv6: (c) => validateIPv6(c.input),
  ttl: (c) => validateTtl(c.input),
  txt: (c) => validateTxt(c.input),
  mx: (c) => validateMx(c.input),
  srv: (c) => validateSrv(c.input),
  caa: (c) => validateCaa(c.input),
};

describe("DNS validation conformance (shared/dns-validation-cases.json)", () => {
  it("covers every kind in the fixture", () => {
    expect(fixture.version).toBe(1);
    expect(new Set(fixture.cases.map((c) => c.kind))).toEqual(new Set(Object.keys(RUNNERS)));
    expect(fixture.cases.length).toBeGreaterThanOrEqual(80);
  });

  it.each(fixture.cases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const result = RUNNERS[testCase.kind](testCase);
    if (testCase.valid) {
      expect(result).toEqual({ ok: true, normalized: testCase.expected });
    } else {
      expect(result.ok).toBe(false);
    }
  });
});
