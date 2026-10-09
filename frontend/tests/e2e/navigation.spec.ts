import { expect, loginAs, test } from "./fixtures";

const NAV = [
  { link: "Dashboard", path: "/dashboard", heading: "Dashboard", comingSoon: true },
  { link: "Hosted zones", path: "/hosted-zones", heading: "Hosted zones", comingSoon: false },
  { link: "Health checks", path: "/health-checks", heading: "Health checks", comingSoon: true },
  { link: "Profiles", path: "/profiles", heading: "Profiles", comingSoon: true },
  { link: "Traffic policies", path: "/traffic-policies", heading: "Traffic policies", comingSoon: true },
  { link: "Resolver", path: "/resolver", heading: "Resolver", comingSoon: true },
];

test("journey 10: every side navigation item and placeholder page opens with correct breadcrumbs", async ({ page }) => {
  await loginAs(page, "/hosted-zones");
  const sideNav = page.getByRole("navigation", { name: "Route 53 navigation" });

  for (const item of NAV) {
    await sideNav.getByRole("link", { name: item.link, exact: true }).click();
    await expect(page).toHaveURL(item.path);
    await expect(page.getByRole("heading", { level: 1, name: item.heading })).toBeVisible();
    const crumbs = page.getByRole("navigation", { name: "Breadcrumbs" });
    await expect(crumbs).toContainText("Route 53");
    await expect(crumbs).toContainText(item.heading);
    await expect(sideNav.getByRole("link", { name: item.link, exact: true })).toHaveAttribute("aria-current", "page");
    if (item.comingSoon) {
      await expect(page.getByText("Coming soon")).toBeVisible();
      await expect(page.getByText(`${item.heading} is outside the functional scope of Fiftythree.`)).toBeVisible();
    }
  }
});

test("the Coming soon link and the identity link lead to Hosted zones", async ({ page }) => {
  await loginAs(page, "/resolver");
  await page.getByRole("link", { name: "Go to Hosted zones" }).click();
  await expect(page).toHaveURL("/hosted-zones");
  await page.goto("/profiles");
  await page.getByRole("link", { name: "Fiftythree" }).click();
  await expect(page).toHaveURL("/hosted-zones");
});

test("the top bar shows the identity, Global, and the Demo account menu", async ({ page }) => {
  await loginAs(page, "/dashboard");
  await expect(page.getByRole("banner").getByText("Global", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Demo User/ }).click();
  await expect(page.getByText("Demo account").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
});

test("unknown console URLs render the not-found page inside the shell", async ({ page }) => {
  await loginAs(page, "/hosted-zones");
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Route 53 navigation" })).toBeVisible();
  await page.getByRole("link", { name: "Go to Hosted zones" }).click();
  await expect(page).toHaveURL("/hosted-zones");
});

test.describe("narrow viewport", () => {
  test.use({ viewport: { width: 600, height: 800 } });

  test("the side navigation collapses behind the toggle", async ({ page }) => {
    await loginAs(page, "/dashboard");
    const sideNavLink = page.getByRole("navigation", { name: "Route 53 navigation" }).getByRole("link", { name: "Profiles" });
    await expect(sideNavLink).toBeHidden();
    await page.getByRole("button", { name: "Open navigation" }).click();
    await sideNavLink.click();
    await expect(page).toHaveURL("/profiles");
  });
});
