import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";

import { expect, loginAs, test } from "./fixtures";

/**
 * Accessibility (axe), keyboard-only flows, and responsive layout checks. With
 * CAPTURE_SCREENSHOTS=1 the screens are also saved to docs/screenshots/ (see docs/VISUAL_QA.md).
 */
const CAPTURE = process.env.CAPTURE_SCREENSHOTS === "1";
const SHOTS = "../docs/screenshots";

async function shot(page: Page, name: string) {
  if (CAPTURE) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

/** A zone with a few records to look at (the seeded example.com when demo data is loaded). */
async function sampleZone(request: APIRequestContext): Promise<{ zoneId: string; name: string }> {
  const existing = await (await request.get("/api/v1/hosted-zones?q=example.com&page_size=100")).json();
  const seeded = existing.items.find((zone: { name: string }) => zone.name === "example.com");
  if (seeded) return { zoneId: seeded.zone_id, name: seeded.name };
  const name = `qa-${Date.now()}.example.com`;
  const zone = await (await request.post("/api/v1/hosted-zones", { data: { name, comment: "Visual QA zone" } })).json();
  const records = [
    { name: "www", record_type: "A", values: [{ value: "192.0.2.10" }, { value: "192.0.2.11" }] },
    { name: "@", record_type: "MX", values: [{ priority: 10, exchange: "mail.example.com" }] },
    { name: "_sip._tcp", record_type: "SRV", values: [{ priority: 10, weight: 5, port: 5060, target: "sip.example.com" }] },
    { name: "@", record_type: "CAA", values: [{ flags: 0, tag: "issue", value: "letsencrypt.org" }] },
  ];
  for (const data of records) await request.post(`/api/v1/hosted-zones/${zone.zone_id}/records`, { data });
  return { zoneId: zone.zone_id, name };
}

async function expectNoSeriousA11yViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
  expect(summary, `serious/critical axe violations on ${label}`).toEqual([]);
  return results.violations.filter((v) => v.impact !== "serious" && v.impact !== "critical").map((v) => `${v.id} (${v.impact})`);
}

/** Presses Tab until the focused element matches, failing after `max` presses. */
async function tabTo(page: Page, matches: (el: { tag: string; text: string; label: string }) => boolean, max = 60) {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return { tag: el?.tagName ?? "", text: (el?.textContent ?? "").trim(), label: el?.getAttribute("aria-label") ?? "" };
    });
    if (matches(focused)) return;
  }
  throw new Error("Element not reachable with Tab");
}

async function noHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, "page must not scroll horizontally (tables scroll inside their own container)").toBeLessThanOrEqual(innerWidth);
}

test.describe("accessibility", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("axe finds no serious or critical violations on core pages", async ({ page }) => {
    // Scan settled screens: with reduced motion Cloudscape skips its fade-in transitions, so axe
    // never measures text contrast mid-animation.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await shot(page, "login");
    const minor: Record<string, string[]> = { login: await expectNoSeriousA11yViolations(page, "login") };

    await loginAs(page, "/hosted-zones");
    const { zoneId } = await sampleZone(page.request);

    await page.goto("/hosted-zones");
    await expect(page.getByRole("heading", { level: 1, name: /Hosted zones/ })).toBeVisible();
    await expect(page.getByRole("table", { name: "Hosted zones" }).getByRole("rowheader").first()).toBeVisible();
    await shot(page, "hosted-zones-list");
    minor.list = await expectNoSeriousA11yViolations(page, "hosted zones list");

    await page.goto(`/hosted-zones/${zoneId}`);
    await expect(page.getByRole("table", { name: "Records" }).getByRole("rowheader").first()).toBeVisible();
    await shot(page, "zone-detail-records");
    minor.detail = await expectNoSeriousA11yViolations(page, "zone detail");

    await page.getByRole("table", { name: "Records" }).getByRole("radio").first().check();
    await expect(page.getByRole("button", { name: "Close details panel" })).toBeVisible();
    await shot(page, "zone-detail-split-panel");

    await page.goto(`/hosted-zones/${zoneId}/records/new`);
    await page.getByTestId("record-type-select").getByRole("button").click();
    await page.getByRole("option", { name: /^MX / }).click();
    await expect(page.locator('input[aria-label="Priority 1"]')).toBeVisible();
    await shot(page, "create-record-mx");
    minor.createRecord = await expectNoSeriousA11yViolations(page, "create record");

    await page.goto(`/hosted-zones/${zoneId}`);
    await page.getByRole("button", { name: "Delete zone" }).click();
    await expect(page.getByRole("dialog", { name: "Delete hosted zone" })).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, "delete-zone-modal");
    minor.deleteModal = await expectNoSeriousA11yViolations(page, "delete zone modal");
    await page.getByRole("dialog", { name: "Delete hosted zone" }).getByRole("button", { name: "Cancel" }).click();

    await page.goto("/health-checks");
    await expect(page.getByText("Coming soon")).toBeVisible();
    await shot(page, "placeholder-health-checks");
    minor.placeholder = await expectNoSeriousA11yViolations(page, "placeholder page");

    test.info().annotations.push({ type: "minor-axe-violations", description: JSON.stringify(minor) });
    console.info(`minor axe findings: ${JSON.stringify(minor)}`);
  });
});

test.describe("keyboard only", () => {
  test("create a hosted zone and an A record with the keyboard", async ({ page }) => {
    await loginAs(page, "/hosted-zones");
    const name = `kb-${Date.now()}.example.com`;

    await tabTo(page, (el) => el.tag === "BUTTON" && el.text === "Create hosted zone");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/hosted-zones/new");
    await expect(page.getByPlaceholder("example.com")).toBeFocused();
    await page.keyboard.type(name);
    await tabTo(page, (el) => el.tag === "TEXTAREA");
    await page.keyboard.type("Created with the keyboard");
    await tabTo(page, (el) => el.tag === "BUTTON" && el.text === "Create hosted zone");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/hosted-zones\/Z[A-Z0-9]{20}$/);
    await expect(page.getByText(`Hosted zone ${name} created.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Create record" }).first()).toBeVisible();

    await tabTo(page, (el) => el.tag === "BUTTON" && el.text === "Create record");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/records\/new$/);
    await expect(page.locator('input[aria-label="Record name"]')).toBeFocused();
    await page.keyboard.type("www");
    await tabTo(page, (el) => el.label === "Value 1");
    await page.keyboard.type("192.0.2.10");
    await tabTo(page, (el) => el.tag === "BUTTON" && el.text === "Create records");
    await page.keyboard.press("Enter");
    await expect(page.getByText(`Record www.${name} (A) created.`)).toBeVisible();
  });

  test("the delete dialog traps focus and returns it on close", async ({ page }) => {
    await loginAs(page, "/hosted-zones");
    const { zoneId } = await sampleZone(page.request);
    await page.goto(`/hosted-zones/${zoneId}`);

    await tabTo(page, (el) => el.tag === "BUTTON" && el.text === "Delete zone");
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Delete hosted zone" });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Delete zone" })).toBeFocused();
  });
});

test.describe("responsive layout", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    test(`list and detail fit ${viewport.width}px without page-level horizontal scroll`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await loginAs(page, "/hosted-zones");
      const { zoneId } = await sampleZone(page.request);

      await page.goto("/hosted-zones");
      await expect(page.getByRole("table", { name: "Hosted zones" }).getByRole("rowheader").first()).toBeVisible();
      await noHorizontalOverflow(page);
      if (viewport.width !== 1440) await shot(page, `hosted-zones-list-${viewport.width}`);

      const nav = page.getByRole("navigation", { name: "Route 53 navigation" }).getByRole("link", { name: "Profiles" });
      if (viewport.width < 688) {
        await expect(nav).toBeHidden();
        await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
      } else {
        await expect(nav).toBeVisible();
      }

      await page.goto(`/hosted-zones/${zoneId}`);
      await expect(page.getByRole("table", { name: "Records" }).getByRole("rowheader").first()).toBeVisible();
      await noHorizontalOverflow(page);
      if (viewport.width !== 1440) await shot(page, `zone-detail-${viewport.width}`);
    });
  }
});
