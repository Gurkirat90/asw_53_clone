import createWrapper from "@cloudscape-design/components/test-utils/dom";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecordForm } from "@/components/records/RecordForm";
import { newRecordForm, recordToForm } from "@/components/records/recordFormValues";
import type { DnsRecord, RecordType } from "@/lib/api/types";
import { errorEnvelope, jsonResponse, mockFetch, renderConsolePage } from "../test-utils";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  usePathname: () => "/hosted-zones/ZTEST/records/new",
  useSearchParams: () => new URLSearchParams(),
}));

const ZONE = "example.com";
const RECORDS_URL = "POST /api/v1/hosted-zones/ZTEST/records";

function savedRecord(body: Record<string, unknown>): DnsRecord {
  return {
    id: "rec-1",
    zone_id: "ZTEST",
    name: "www.example.com",
    record_type: body.record_type as "A",
    routing_policy: "SIMPLE",
    ttl_seconds: 300,
    values: [],
    display_values: [],
    comment: null,
    is_system: false,
    created_at: "2026-10-09T07:00:00Z",
    updated_at: "2026-10-09T07:00:00Z",
  };
}

/** The input/textarea with this label (AttributeEditor rows are groups labelled by their first control). */
function field(label: string): HTMLElement {
  const match = maybeField(label);
  if (!match) throw new Error(`No input labelled "${label}"`);
  return match;
}
function maybeField(label: string): HTMLElement | null {
  // Exact aria-label match: column headers ("Value") also label inputs via aria-labelledby.
  return document.querySelector<HTMLElement>(`[aria-label="${CSS.escape(label)}"]`);
}

function renderForm(initial = newRecordForm(), record?: DnsRecord) {
  return renderConsolePage(<RecordForm zoneId="ZTEST" zoneName={ZONE} initial={initial} record={record} />);
}

function chooseType(type: RecordType) {
  const select = createWrapper(document.body).findAllSelects()[0];
  select.openDropdown();
  select.selectOptionByValue(type);
}

function postBodies(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

function submit(user: UserEvent) {
  return user.click(screen.getByRole("button", { name: "Create records" }));
}

beforeEach(() => {
  navigation.push.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const EDITOR_LABELS: Record<RecordType, string[]> = {
  A: ["Value 1"],
  AAAA: ["Value 1"],
  NS: ["Value 1"],
  PTR: ["Value 1"],
  TXT: ["Value 1"],
  CNAME: ["Value"],
  MX: ["Priority 1", "Mail server 1"],
  SRV: ["Priority 1", "Weight 1", "Port 1", "Target 1"],
  CAA: ["Flags 1", "Value 1"], // plus a Tag select, asserted through the editor row
};
const ALL_LABELS = [...new Set(Object.values(EDITOR_LABELS).flat())];

describe("RecordForm editors", () => {
  it.each(Object.keys(EDITOR_LABELS) as RecordType[])("%s renders only its own editor", (type) => {
    mockFetch({});
    renderForm();
    chooseType(type);
    for (const label of EDITOR_LABELS[type]) expect(field(label)).toBeInTheDocument();
    for (const label of ALL_LABELS.filter((l) => !EDITOR_LABELS[type].includes(l))) {
      expect(maybeField(label)).not.toBeInTheDocument();
    }
    const editor = createWrapper(document.body).findAttributeEditor();
    expect(editor !== null).toBe(type !== "CNAME");
    const tagSelect = editor?.findRow(1)?.findField(2)?.findControl()?.findSelect() ?? null;
    expect(tagSelect !== null).toBe(type === "CAA");
  });

  it("never offers SOA", () => {
    mockFetch({});
    renderForm();
    const select = createWrapper(document.body).findAllSelects()[0];
    select.openDropdown();
    const values = select.findDropdown().findOptions().map((option) => option.getElement().textContent ?? "");
    expect(values.some((text) => text.startsWith("SOA"))).toBe(false);
    expect(values).toHaveLength(9);
  });

  it("shows Alias and Routing policy disabled with explanations", () => {
    mockFetch({});
    renderForm();
    expect(screen.getByText("Alias records are not supported in Fiftythree.")).toBeInTheDocument();
    expect(screen.getByText("Other routing policies are not available in Fiftythree.")).toBeInTheDocument();
    expect(createWrapper(document.body).findToggle()!.findNativeInput().getElement()).toBeDisabled();
  });
});

type Fill = (user: UserEvent) => Promise<void>;
const VALID: Array<[RecordType, string, Fill, unknown[]]> = [
  ["A", "www", async (u) => {
    await u.type(field("Value 1"), "192.0.2.10");
    await u.click(screen.getByRole("button", { name: "Add value" }));
    await u.type(field("Value 2"), "192.0.2.11");
  }, [{ value: "192.0.2.10" }, { value: "192.0.2.11" }]],
  ["AAAA", "v6", async (u) => u.type(field("Value 1"), "2001:DB8:0:0:0:0:0:10"), [{ value: "2001:db8::10" }]],
  ["CNAME", "app", async (u) => u.type(field("Value"), "www.example.net."), [{ value: "www.example.net" }]],
  ["TXT", "", async (u) => u.type(field("Value 1"), 'v=spf1 include:example.net -all'), [{ value: "v=spf1 include:example.net -all" }]],
  ["NS", "dev", async (u) => u.type(field("Value 1"), "ns1.example.net"), [{ value: "ns1.example.net" }]],
  ["PTR", "10", async (u) => u.type(field("Value 1"), "host.example.net"), [{ value: "host.example.net" }]],
  ["MX", "", async (u) => {
    await u.type(field("Priority 1"), "10");
    await u.type(field("Mail server 1"), "mail.example.com");
  }, [{ priority: 10, exchange: "mail.example.com" }]],
  ["SRV", "_sip._tcp", async (u) => {
    await u.type(field("Priority 1"), "10");
    await u.type(field("Weight 1"), "5");
    await u.type(field("Port 1"), "5060");
    await u.type(field("Target 1"), "sip.example.com");
  }, [{ priority: 10, weight: 5, port: 5060, target: "sip.example.com" }]],
  ["CAA", "", async (u) => {
    await u.type(field("Value 1"), "letsencrypt.org");
    await u.click(screen.getByRole("button", { name: "Add value" }));
    const tag = createWrapper(document.body).findAttributeEditor()!.findRow(2)!.findField(2)!.findControl()!.findSelect()!;
    tag.openDropdown();
    tag.selectOptionByValue("iodef");
    await u.type(field("Value 2"), "mailto:security@example.com");
  }, [{ flags: 0, tag: "issue", value: "letsencrypt.org" }, { flags: 0, tag: "iodef", value: "mailto:security@example.com" }]],
];

describe("RecordForm submission", () => {
  it.each(VALID)("%s sends the exact API payload", async (type, name, fill, values) => {
    const fetchMock = mockFetch({ [RECORDS_URL]: () => jsonResponse(201, savedRecord({ record_type: type })) });
    const user = userEvent.setup();
    renderForm();
    chooseType(type);
    if (name) await user.type(field("Record name"), name);
    await fill(user);
    await submit(user);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/hosted-zones/ZTEST"));
    expect(postBodies(fetchMock)).toEqual([
      { name: name || "@", record_type: type, routing_policy: "SIMPLE", ttl_seconds: 300, values, comment: null },
    ]);
  });

  it("shows the error on the invalid row only and sends nothing", async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();
    renderForm();
    await user.type(field("Value 1"), "192.0.2.10");
    await user.click(screen.getByRole("button", { name: "Add value" }));
    await user.type(field("Value 2"), "192.0.2.300");
    await submit(user);

    const rows = createWrapper(document.body).findAttributeEditor()!.findRows();
    expect(rows[0].findField(1)!.findError()).toBeNull();
    expect(rows[1].findField(1)!.findError()!.getElement()).toHaveTextContent("Enter a valid IPv4 address");
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(field("Value 2")).toHaveFocus());
  });

  it("previews the full record name", async () => {
    mockFetch({});
    const user = userEvent.setup();
    renderForm();
    const nameInput = field("Record name");
    expect(screen.getByText("Full record name: example.com")).toBeInTheDocument();
    await user.type(nameInput, "www");
    expect(screen.getByText("Full record name: www.example.com")).toBeInTheDocument();
    await user.clear(nameInput);
    await user.type(nameInput, "www.example.com");
    expect(screen.getByText("Full record name: www.example.com")).toBeInTheDocument();
    await user.clear(nameInput);
    await user.type(nameInput, "x.other.com.");
    expect(screen.getByText("Full record name: -")).toBeInTheDocument();
    await submit(user);
    expect(await screen.findByText("Record name must be within example.com.")).toBeInTheDocument();
  });

  it("rejects a CNAME at the apex on the name field", async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();
    renderForm();
    chooseType("CNAME");
    await user.type(field("Value"), "www.example.net");
    await submit(user);
    expect(await screen.findByText("CNAME records are not allowed at the zone apex.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks before changing the type when values have content", async () => {
    mockFetch({});
    const user = userEvent.setup();
    renderForm();
    await user.type(field("Value 1"), "192.0.2.10");
    chooseType("MX");
    const dialog = screen.getByRole("dialog", { name: "Change record type?" });
    expect(within(dialog).getByText("The values you entered will be cleared.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(field("Value 1")).toHaveValue("192.0.2.10");

    chooseType("MX");
    await user.click(within(screen.getByRole("dialog", { name: "Change record type?" })).getByRole("button", { name: "Change type" }));
    expect(field("Priority 1")).toHaveValue(null);
    expect(field("Mail server 1")).toHaveValue("");
  });

  it("sets TTL from the presets", async () => {
    mockFetch({});
    const user = userEvent.setup();
    renderForm();
    const ttl = field("TTL (seconds)");
    expect(ttl).toHaveValue(300);
    for (const [label, seconds] of [["60", 60], ["3600", 3600], ["86400", 86400]] as const) {
      await user.click(screen.getByRole("button", { name: `Set TTL to ${label} seconds` }));
      expect(ttl).toHaveValue(seconds);
    }
  });

  it("blocks double submission while pending", async () => {
    let resolve: (response: Response) => void = () => undefined;
    const fetchMock = mockFetch({ [RECORDS_URL]: () => new Promise<Response>((done) => (resolve = done)) });
    const user = userEvent.setup();
    renderForm();
    await user.type(field("Value 1"), "192.0.2.10");
    const button = screen.getByRole("button", { name: "Create records" });
    await user.dblClick(button);
    await user.click(button);
    expect(postBodies(fetchMock)).toHaveLength(1);
    resolve(jsonResponse(201, savedRecord({ record_type: "A" })));
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
  });

  it("maps server 422 details onto the fields and keeps the input", async () => {
    mockFetch({
      [RECORDS_URL]: () =>
        jsonResponse(422, errorEnvelope("VALIDATION_ERROR", "The request contains invalid fields.", [
          { field: "values.1.value", message: "Server: bad second value." },
          { field: "ttl_seconds", message: "Server: bad TTL." },
        ])),
    });
    const user = userEvent.setup();
    renderForm();
    await user.type(field("Value 1"), "192.0.2.10");
    await user.click(screen.getByRole("button", { name: "Add value" }));
    await user.type(field("Value 2"), "192.0.2.11");
    await submit(user);
    expect(await screen.findByText("Server: bad second value.")).toBeInTheDocument();
    expect(screen.getByText("Server: bad TTL.")).toBeInTheDocument();
    expect(field("Value 2")).toHaveValue("192.0.2.11");
  });

  it("shows a 409 conflict as an alert plus a name error and keeps the input", async () => {
    const message = "A record set with this name and type already exists.";
    mockFetch({ [RECORDS_URL]: () => jsonResponse(409, errorEnvelope("RECORD_CONFLICT", message)) });
    const user = userEvent.setup();
    renderForm();
    await user.type(field("Record name"), "www");
    await user.type(field("Value 1"), "192.0.2.10");
    await submit(user);
    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(2));
    expect(field("Record name")).toHaveValue("www");
    expect(navigation.push).not.toHaveBeenCalled();
  });
});

function stored(type: DnsRecord["record_type"], name: string, values: unknown[]): DnsRecord {
  return { ...savedRecord({ record_type: type }), record_type: type, name, values, display_values: [], ttl_seconds: 600, comment: "note" } as DnsRecord;
}

describe("edit prefill", () => {
  it.each([
    ["A", "www.example.com", [{ value: "192.0.2.10" }, { value: "192.0.2.11" }], "www", { "Value 1": "192.0.2.10", "Value 2": "192.0.2.11" }],
    ["AAAA", "example.com", [{ value: "2001:db8::10" }], "", { "Value 1": "2001:db8::10" }],
    ["CNAME", "app.example.com", [{ value: "www.example.net" }], "app", { Value: "www.example.net" }],
    ["TXT", "example.com", [{ value: "v=spf1 -all" }], "", { "Value 1": "v=spf1 -all" }],
    ["NS", "dev.example.com", [{ value: "ns1.example.net" }], "dev", { "Value 1": "ns1.example.net" }],
    ["PTR", "10.example.com", [{ value: "host.example.net" }], "10", { "Value 1": "host.example.net" }],
    ["MX", "example.com", [{ priority: 10, exchange: "mail.example.com" }], "", { "Priority 1": 10, "Mail server 1": "mail.example.com" }],
    ["SRV", "_sip._tcp.example.com", [{ priority: 1, weight: 2, port: 5060, target: "sip.example.com" }], "_sip._tcp",
      { "Priority 1": 1, "Weight 1": 2, "Port 1": 5060, "Target 1": "sip.example.com" }],
    ["CAA", "example.com", [{ flags: 128, tag: "iodef", value: "mailto:a@example.com" }], "", { "Flags 1": 128, "Value 1": "mailto:a@example.com" }],
  ] as const)("%s", (type, fqdn, values, relative, expectedFields) => {
    mockFetch({});
    const record = stored(type, fqdn, [...values]);
    renderForm(recordToForm(record, ZONE), record);
    expect(field("Record name")).toHaveValue(relative);
    expect(field("TTL (seconds)")).toHaveValue(600);
    expect(field("Comment")).toHaveValue("note");
    for (const [label, value] of Object.entries(expectedFields)) expect(field(label)).toHaveValue(value);
    if (type === "CAA") {
      const tag = createWrapper(document.body).findAttributeEditor()!.findRow(1)!.findField(2)!.findControl()!.findSelect()!;
      expect(tag.findTrigger().getElement()).toHaveTextContent("iodef");
    }
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("PATCHes the same record with the full mutable set", async () => {
    const record = stored("A", "www.example.com", [{ value: "192.0.2.10" }]);
    const fetchMock = mockFetch({
      "PATCH /api/v1/hosted-zones/ZTEST/records/rec-1": () => jsonResponse(200, record),
    });
    const user = userEvent.setup();
    renderForm(recordToForm(record, ZONE), record);
    await user.clear(field("TTL (seconds)"));
    await user.type(field("TTL (seconds)"), "60");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/hosted-zones/ZTEST"));
    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(JSON.parse(String(patches[0][1]?.body))).toEqual({
      name: "www", record_type: "A", routing_policy: "SIMPLE", ttl_seconds: 60, values: [{ value: "192.0.2.10" }], comment: "note",
    });
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
});

