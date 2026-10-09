import { expect, loginAs, signIn, test } from "./fixtures";

test("a signed-out visit to a console page redirects to login with next", async ({ page }) => {
  await page.goto("/hosted-zones");
  await expect(page).toHaveURL("/login?next=%2Fhosted-zones");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("a wrong password shows the generic error", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, "definitely-wrong");
  await expect(page.getByText("Sign-in failed. Check your credentials.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("empty fields are rejected without a request", async ({ page }) => {
  await page.goto("/login");
  let loginRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/auth/login")) loginRequests += 1;
  });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Enter your password.")).toBeVisible();
  expect(loginRequests).toBe(0);
});

test("valid login lands on the original next target", async ({ page }) => {
  await page.goto("/health-checks");
  await expect(page).toHaveURL("/login?next=%2Fhealth-checks");
  await signIn(page);
  await expect(page).toHaveURL("/health-checks");
  await expect(page.getByRole("heading", { level: 1, name: "Health checks" })).toBeVisible();
});

test("a reload keeps the user signed in", async ({ page }) => {
  await loginAs(page, "/hosted-zones");
  await page.reload();
  await expect(page).toHaveURL("/hosted-zones");
  await expect(page.getByRole("heading", { level: 1, name: "Hosted zones" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Demo User/ })).toBeVisible();
});

test("sign out revokes the session and the old cookie stops working", async ({ page, context }) => {
  await loginAs(page, "/hosted-zones");
  const oldCookie = (await context.cookies()).find((cookie) => cookie.name === "route53_session");
  expect(oldCookie?.httpOnly).toBe(true);

  await page.getByRole("button", { name: /Demo User/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("You have signed out.")).toBeVisible();

  await page.goto("/hosted-zones");
  await expect(page).toHaveURL("/login?next=%2Fhosted-zones");

  // Replaying the old (revoked) cookie is rejected by the server.
  const replay = await page.request.get("/api/v1/auth/me", {
    headers: { Cookie: `route53_session=${oldCookie!.value}` },
  });
  expect(replay.status()).toBe(401);
  expect((await replay.json()).error.code).toBe("UNAUTHENTICATED");
});

test("a stale cookie does not loop: it ends on the login page", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "route53_session", value: "stale-token", url: baseURL! }]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login?next=%2Fdashboard");
  await signIn(page);
  await expect(page).toHaveURL("/dashboard");
});
