import type { Page } from "@playwright/test";

import { expect, loginAs, test } from "./fixtures";

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

async function createZone(page: Page, name: string, options: { comment?: string; privateZone?: boolean } = {}) {
  await page.goto("/hosted-zones/new");
  await page.getByPlaceholder("example.com").fill(name);
  if (options.comment) await page.getByLabel("Description").fill(options.comment);
  if (options.privateZone) await page.getByText("Private hosted zone", { exact: true }).click();
  await page.getByRole("button", { name: "Create hosted zone" }).click();
  await expect(page).toHaveURL(/\/hosted-zones\/Z[A-Z0-9]{20}$/);
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(name.replace(/\./g, "\\.")) })).toBeVisible();
  return page.url().split("/").pop()!;
}

async function search(page: Page, text: string) {
  const box = page.getByRole("searchbox", { name: "Search hosted zones by name or description" });
  await box.fill(text);
  if (text) await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(text).replace(/\./g, "\\.")}`));
  else await expect(page).not.toHaveURL(/q=/);
}

function zoneLink(page: Page, name: string) {
  return page.getByRole("link", { name, exact: true });
}

test.beforeEach(async ({ page }) => {
  await loginAs(page, "/hosted-zones");
});

test("journey 2: create a zone, find it, and it persists with system records", async ({ page }) => {
  const name = `e2e-${unique()}.example.com`;
  await createZone(page, name, { comment: "Created by Playwright" });
  await expect(page.getByText(`Hosted zone ${name} created.`)).toBeVisible();

  await page.goto("/hosted-zones");
  await search(page, name);
  await expect(zoneLink(page, name)).toBeVisible();
  await expect(page.getByText("Created by Playwright")).toBeVisible();
  await page.reload();
  await expect(zoneLink(page, name)).toBeVisible();

  await zoneLink(page, name).click();
  const details = page.locator("[data-testid=zone-details]");
  await expect(details.getByText("Record count")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Records (2)" })).toBeVisible();
  const records = page.getByRole("table", { name: "Records" });
  await expect(records.getByRole("row")).toHaveCount(3); // header + NS + SOA
  await expect(records.getByRole("cell", { name: "NS", exact: true })).toBeVisible();
  await expect(records.getByRole("cell", { name: "SOA", exact: true })).toBeVisible();
  await expect(records.getByText("System")).toHaveCount(2);
});

test("journey 3: search and the Type filter narrow the list", async ({ page }) => {
  const id = unique();
  const alpha = `alpha-${id}.example.com`;
  const beta = `beta-${id}.example.net`;
  await createZone(page, alpha);
  await createZone(page, beta, { privateZone: true });

  await page.goto("/hosted-zones");
  await search(page, `alpha-${id}`);
  await expect(zoneLink(page, alpha)).toBeVisible();
  await expect(zoneLink(page, beta)).toHaveCount(0);
  await expect(page.getByText("1 match", { exact: true }).filter({ visible: true })).toBeVisible();

  await search(page, id);
  await expect(zoneLink(page, alpha)).toBeVisible();
  await expect(zoneLink(page, beta)).toBeVisible();

  await page.getByRole("button", { name: /All types/ }).click();
  await page.getByRole("option", { name: "Private" }).click();
  await expect(page).toHaveURL(/zone_type=PRIVATE/);
  await expect(zoneLink(page, beta)).toBeVisible();
  await expect(zoneLink(page, alpha)).toHaveCount(0);

  await search(page, "");
  for (const row of await page.getByRole("table", { name: "Hosted zones" }).getByRole("row").all()) {
    if ((await row.getByRole("cell").count()) > 0) await expect(row).toContainText("Private");
  }
});

test("journey 4: edit the description and it persists", async ({ page }) => {
  const name = `edit-${unique()}.example.com`;
  const zoneId = await createZone(page, name, { comment: "Before" });
  await page.getByRole("button", { name: "Edit hosted zone" }).click();
  await expect(page).toHaveURL(`/hosted-zones/${zoneId}/edit`);
  await expect(page.getByText("Domain name and type cannot be changed after the hosted zone is created.")).toBeVisible();
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();
  await page.getByLabel("Description").fill("After edit");
  await save.click();

  await expect(page).toHaveURL(`/hosted-zones/${zoneId}`);
  await expect(page.getByText(`Hosted zone ${name} updated.`)).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-testid=zone-details]").getByText("After edit")).toBeVisible();

  await page.goto("/hosted-zones");
  await search(page, name);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("After edit");
});

test("journey 9 (zones): cancel keeps the zone; typed confirmation deletes it", async ({ page, allowApiError }) => {
  const name = `delete-${unique()}.example.com`;
  const zoneId = await createZone(page, name);
  await page.goto("/hosted-zones");
  await search(page, name);
  const row = page.getByRole("row", { name: new RegExp(name) });
  await row.getByRole("radio").check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Delete hosted zone" });
  await expect(dialog).toContainText("This will also delete its 2 records, including the default NS and SOA records.");
  await expect(dialog.getByRole("button", { name: "Delete" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(zoneLink(page, name)).toBeVisible();

  await row.getByRole("radio").check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`Hosted zone ${name} deleted.`)).toBeVisible();
  await expect(zoneLink(page, name)).toHaveCount(0);
  await expect(page.getByText("No matches")).toBeVisible();

  allowApiError(new RegExp(`status of 404 .*hosted-zones/${zoneId}`));
  await page.goto(`/hosted-zones/${zoneId}`);
  await expect(page.getByText("Hosted zone not found")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to hosted zones" })).toBeVisible();
});

test("deleting from the detail page returns to the list", async ({ page }) => {
  const name = `detail-delete-${unique()}.example.com`;
  await createZone(page, name);
  await page.getByRole("button", { name: "Delete zone" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete hosted zone" });
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL("/hosted-zones");
  await expect(page.getByText(`Hosted zone ${name} deleted.`)).toBeVisible();
});

test("an invalid domain shows the field error and creates nothing", async ({ page }) => {
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/hosted-zones")) posts += 1;
  });
  await page.goto("/hosted-zones/new");
  await page.getByPlaceholder("example.com").fill("http://bad");
  await page.getByRole("button", { name: "Create hosted zone" }).click();
  await expect(page.getByText("Enter a valid domain name, such as example.com.")).toBeVisible();
  await expect(page).toHaveURL("/hosted-zones/new");
  expect(posts).toBe(0);
});

test("URL state is applied on a direct load", async ({ page }) => {
  const request = page.waitForRequest((req) => req.url().includes("/api/v1/hosted-zones?"));
  await page.goto("/hosted-zones?q=example&page_size=10");
  expect((await request).url()).toContain("q=example");
  expect((await request).url()).toContain("page_size=10");
  await expect(page.getByRole("searchbox", { name: "Search hosted zones by name or description" })).toHaveValue("example");
});

test("an unknown zone id shows the not-found state", async ({ page, allowApiError }) => {
  allowApiError(/status of 404 .*hosted-zones\/ZDOESNOTEXIST0000000A/);
  await page.goto("/hosted-zones/ZDOESNOTEXIST0000000A");
  await expect(page.getByText("Hosted zone not found")).toBeVisible();
});
