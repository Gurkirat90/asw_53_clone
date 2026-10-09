import type { APIRequestContext, Page } from "@playwright/test";

import { expect, loginAs, test } from "./fixtures";

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

async function createZoneViaApi(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.post("/api/v1/hosted-zones", { data: { name } });
  expect(response.status()).toBe(201);
  return (await response.json()).zone_id as string;
}

async function createRecordViaApi(request: APIRequestContext, zoneId: string, data: Record<string, unknown>) {
  const response = await request.post(`/api/v1/hosted-zones/${zoneId}/records`, { data });
  expect(response.status(), await response.text()).toBe(201);
}

const input = (page: Page, label: string) => page.locator(`input[aria-label="${label}"], textarea[aria-label="${label}"]`);

async function chooseType(page: Page, type: string) {
  await page.getByTestId("record-type-select").getByRole("button").click();
  await page.getByRole("option", { name: new RegExp(`^${type} `) }).click();
}

/** Opens the Tag select of CAA row `row` (0-based; each row's trigger shows its current tag). */
async function chooseCaaTag(page: Page, row: number, tag: string) {
  await page.getByRole("button", { name: /issue/ }).nth(row).click();
  await page.getByRole("option", { name: tag, exact: true }).click();
}

function recordsTable(page: Page) {
  return page.getByRole("table", { name: "Records" });
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function recordRow(page: Page, fqdn: string, type: string) {
  // System rows carry a "System" badge inside the name cell.
  const name = new RegExp(`^${escapeRegExp(fqdn)}(\\s*System)?$`);
  return recordsTable(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name }) })
    .filter({ has: page.getByRole("cell", { name: type, exact: true }) });
}

async function submitCreate(page: Page, zoneId: string) {
  await page.getByRole("button", { name: "Create records" }).click();
  await expect(page).toHaveURL(`/hosted-zones/${zoneId}`);
}

let zoneName: string;
let zoneId: string;

test.beforeEach(async ({ page }) => {
  await loginAs(page, "/hosted-zones");
  zoneName = `records-${unique()}.example.com`;
  zoneId = await createZoneViaApi(page.request, zoneName);
});

test("journey 5: create one record of each type through the UI and they persist", async ({ page }) => {
  const steps: Array<{ name: string; type: string; fill: () => Promise<void>; value: RegExp }> = [
    {
      name: "www", type: "A",
      fill: async () => {
        await input(page, "Value 1").fill("192.0.2.10");
        await page.getByRole("button", { name: "Add value" }).click();
        await input(page, "Value 2").fill("192.0.2.11");
      },
      value: /192\.0\.2\.10 \+ 1 more/,
    },
    { name: "", type: "AAAA", fill: () => input(page, "Value 1").fill("2001:db8::10"), value: /2001:db8::10/ },
    { name: "app", type: "CNAME", fill: () => input(page, "Value").fill("www.example.net"), value: /www\.example\.net/ },
    { name: "", type: "TXT", fill: () => input(page, "Value 1").fill("v=spf1 include:example.net -all"), value: /"v=spf1 include:example\.net -all"/ },
    {
      name: "", type: "MX",
      fill: async () => {
        await input(page, "Priority 1").fill("10");
        await input(page, "Mail server 1").fill("mail.example.com");
        await page.getByRole("button", { name: "Add value" }).click();
        await input(page, "Priority 2").fill("20");
        await input(page, "Mail server 2").fill("mail2.example.com");
      },
      value: /10 mail\.example\.com \+ 1 more/,
    },
    { name: "dev", type: "NS", fill: () => input(page, "Value 1").fill("ns1.example.net"), value: /ns1\.example\.net/ },
    { name: "host-ptr", type: "PTR", fill: () => input(page, "Value 1").fill("host.example.net"), value: /host\.example\.net/ },
    {
      name: "_sip._tcp", type: "SRV",
      fill: async () => {
        await input(page, "Priority 1").fill("10");
        await input(page, "Weight 1").fill("5");
        await input(page, "Port 1").fill("5060");
        await input(page, "Target 1").fill("sip.example.com");
      },
      value: /10 5 5060 sip\.example\.com/,
    },
    {
      name: "", type: "CAA",
      fill: async () => {
        await input(page, "Value 1").fill("letsencrypt.org");
        await page.getByRole("button", { name: "Add value" }).click();
        await chooseCaaTag(page, 1, "iodef");
        await input(page, "Value 2").fill("mailto:security@example.com");
      },
      value: /0 issue "letsencrypt\.org" \+ 1 more/,
    },
  ];

  for (const step of steps) {
    await page.goto(`/hosted-zones/${zoneId}/records/new`);
    if (step.name) await input(page, "Record name").fill(step.name);
    if (step.type !== "A") await chooseType(page, step.type);
    await step.fill();
    await submitCreate(page, zoneId);
    const fqdn = step.name ? `${step.name}.${zoneName}` : zoneName;
    await expect(page.getByText(`Record ${fqdn} (${step.type}) created.`)).toBeVisible();
  }

  await page.reload();
  await expect(page.getByRole("tab", { name: "Records (11)" })).toBeVisible();
  for (const step of steps) {
    const fqdn = step.name ? `${step.name}.${zoneName}` : zoneName;
    const row = recordRow(page, fqdn, step.type);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("300");
    await expect(row).toContainText(step.value);
  }
});

test("journey 6: search, Type filter, and pagination are server-side and in the URL", async ({ page }) => {
  await createRecordViaApi(page.request, zoneId, { name: "www", record_type: "A", values: [{ value: "192.0.2.10" }, { value: "192.0.2.11" }] });
  await createRecordViaApi(page.request, zoneId, { name: "@", record_type: "MX", values: [{ priority: 10, exchange: "mail.example.com" }] });
  for (let n = 1; n <= 25; n += 1) {
    await createRecordViaApi(page.request, zoneId, { name: `host-${String(n).padStart(2, "0")}`, record_type: "A", values: [{ value: `198.51.100.${n}` }] });
  }
  await page.goto(`/hosted-zones/${zoneId}`);
  const search = page.getByRole("searchbox", { name: "Filter records by property or value" });

  await search.fill("192.0.2.11");
  await expect(page).toHaveURL(/q=192\.0\.2\.11/);
  await expect(recordsTable(page).getByRole("rowheader")).toHaveCount(1);
  await expect(recordRow(page, `www.${zoneName}`, "A")).toHaveCount(1);

  await search.fill("host-07");
  await expect(page).toHaveURL(/q=host-07/);
  await expect(recordsTable(page).getByRole("rowheader")).toHaveText([`host-07.${zoneName}`]);

  await search.fill("");
  await expect(page).not.toHaveURL(/q=/);
  await page.getByRole("button", { name: /Record type filter/ }).click();
  await page.getByRole("option", { name: "MX", exact: true }).click();
  await expect(page).toHaveURL(/record_type=MX/);
  await expect(recordsTable(page).getByRole("cell", { name: "MX", exact: true })).toHaveCount(1);
  await expect(recordsTable(page).getByRole("cell", { name: "A", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Record type filter/ }).click();
  await page.getByRole("option", { name: "All record types" }).click();
  await expect(page).not.toHaveURL(/record_type=/);

  // 29 records (25 + www + MX + NS + SOA) at 10 per page.
  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("radio", { name: "10 records" }).check();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page).toHaveURL(/page_size=10/);
  await expect(recordsTable(page).getByRole("rowheader")).toHaveCount(10);
  await page.getByRole("button", { name: "Page 3" }).click();
  await expect(page).toHaveURL(/page=3/);
  await expect(recordsTable(page).getByRole("rowheader")).toHaveCount(9);
  await page.reload();
  await expect(page).toHaveURL(/page=3/);
  await expect(recordsTable(page).getByRole("rowheader")).toHaveCount(9);
});

test("journey 7: edit TTL and add a value updates the row in place", async ({ page }) => {
  await createRecordViaApi(page.request, zoneId, { name: "www", record_type: "A", values: [{ value: "192.0.2.10" }] });
  await page.goto(`/hosted-zones/${zoneId}`);
  const counter = page.getByRole("tab", { name: "Records (3)" });
  await expect(counter).toBeVisible();

  await recordRow(page, `www.${zoneName}`, "A").getByRole("radio").check();
  await page.getByRole("button", { name: "Edit record" }).click();
  await expect(page).toHaveURL(/\/records\/.+\/edit$/);
  await expect(input(page, "Record name")).toHaveValue("www");
  await input(page, "TTL (seconds)").fill("60");
  await page.getByRole("button", { name: "Add value" }).click();
  await input(page, "Value 2").fill("192.0.2.12");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(`/hosted-zones/${zoneId}`);
  await expect(page.getByText(`Record www.${zoneName} (A) updated.`)).toBeVisible();
  const row = recordRow(page, `www.${zoneName}`, "A");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("60");
  await expect(row).toContainText("192.0.2.10 + 1 more");
  await expect(page.getByRole("tab", { name: "Records (3)" })).toBeVisible();
});

test("journey 8: delete with cancel, then confirm; system records are protected", async ({ page }) => {
  await createRecordViaApi(page.request, zoneId, { name: "old", record_type: "TXT", values: [{ value: "remove me" }] });
  await page.goto(`/hosted-zones/${zoneId}`);
  const row = recordRow(page, `old.${zoneName}`, "TXT");

  await row.getByRole("radio").check();
  await page.getByRole("button", { name: "Delete record" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete record" });
  await expect(dialog).toContainText('"remove me"');
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(1);

  await page.getByRole("button", { name: "Delete record" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`Record old.${zoneName} (TXT) deleted.`)).toBeVisible();
  await page.reload();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Records (2)" })).toBeVisible();

  for (const type of ["NS", "SOA"]) {
    await recordRow(page, zoneName, type).getByRole("radio").check();
    await expect(page.getByRole("button", { name: "Edit record" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Delete record" })).toBeDisabled();
  }
  await expect(
    page.getByText("Default NS and SOA records are managed by the hosted zone and can't be edited or deleted.").filter({ visible: true }).first(),
  ).toBeVisible();
});

test("server and client rules are shown on the right fields", async ({ page, allowApiError }) => {
  await createRecordViaApi(page.request, zoneId, { name: "www", record_type: "A", values: [{ value: "192.0.2.10" }] });

  // CNAME where an A exists: 409 conflict alert, input preserved.
  allowApiError(/status of 409 .*\/records/);
  await page.goto(`/hosted-zones/${zoneId}/records/new`);
  await input(page, "Record name").fill("www");
  await chooseType(page, "CNAME");
  await input(page, "Value").fill("app.example.net");
  await page.getByRole("button", { name: "Create records" }).click();
  await expect(page.getByText(/A CNAME record can't share the name/).first()).toBeVisible();
  await expect(input(page, "Record name")).toHaveValue("www");
  await expect(input(page, "Value")).toHaveValue("app.example.net");

  // CNAME at the apex (blank name): field error, no request.
  await page.goto(`/hosted-zones/${zoneId}/records/new`);
  await chooseType(page, "CNAME");
  await input(page, "Value").fill("app.example.net");
  await page.getByRole("button", { name: "Create records" }).click();
  await expect(page.getByText("CNAME records are not allowed at the zone apex.")).toBeVisible();

  // A bad IPv4 in the second row.
  await page.goto(`/hosted-zones/${zoneId}/records/new`);
  await input(page, "Record name").fill("multi");
  await input(page, "Value 1").fill("192.0.2.20");
  await page.getByRole("button", { name: "Add value" }).click();
  await input(page, "Value 2").fill("192.0.2.300");
  await page.getByRole("button", { name: "Create records" }).click();
  await expect(page.getByText("Enter a valid IPv4 address, such as 192.0.2.10.")).toHaveCount(1);
  await expect(page).toHaveURL(`/hosted-zones/${zoneId}/records/new`);
});

test("journey 9 (records): deleting the zone removes its records", async ({ page }) => {
  await createRecordViaApi(page.request, zoneId, { name: "www", record_type: "A", values: [{ value: "192.0.2.10" }] });
  await page.goto(`/hosted-zones/${zoneId}`);
  await page.getByRole("button", { name: "Delete zone" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete hosted zone" });
  await expect(dialog).toContainText("3 records");
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL("/hosted-zones");

  expect((await page.request.get(`/api/v1/hosted-zones/${zoneId}`)).status()).toBe(404);
  expect((await page.request.get(`/api/v1/hosted-zones/${zoneId}/records`)).status()).toBe(404);
});
