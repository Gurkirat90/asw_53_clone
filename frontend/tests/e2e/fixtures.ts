import { expect, test as base, type Page } from "@playwright/test";

export const DEMO_EMAIL = "demo@example.test";
export const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "e2e-demo-password";

/**
 * Chrome logs every non-2xx fetch as a console error ("Failed to load resource ... 401").
 * Only expected 401s from the API (the login page's session probe, a wrong password, a revoked
 * cookie) are tolerated; every other console error or page error fails the test.
 */
const EXPECTED_ERRORS = [/Failed to load resource: the server responded with a status of 401/];

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        const url = message.location().url;
        const expected = EXPECTED_ERRORS.some((pattern) => pattern.test(text)) && url.includes("/api/v1/");
        if (!expected) errors.push(`${text} (${url})`);
      });
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      await use(errors);
      expect(errors, "browser console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function signIn(page: Page, password = DEMO_PASSWORD) {
  await page.getByLabel("Email address").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Opens a protected page via the login redirect and signs in. */
export async function loginAs(page: Page, path = "/hosted-zones") {
  await page.goto(path);
  await expect(page).toHaveURL(/\/login/);
  await signIn(page);
  await expect(page.getByRole("button", { name: /Demo User/ })).toBeVisible();
}
