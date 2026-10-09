import createWrapper from "@cloudscape-design/components/test-utils/dom";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SplitPanelProvider, useSplitPanelState } from "@/components/console-shell/SplitPanelSlot";
import { DeleteRecordModal } from "@/components/records/DeleteRecordModal";
import { useRecordListState } from "@/components/records/RecordsTable";
import { ZoneRecords } from "@/components/records/ZoneRecords";
import type { DnsRecord } from "@/lib/api/types";
import { errorEnvelope, jsonResponse, mockFetch, page, renderConsolePage } from "../test-utils";

const navigation = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  usePathname: () => "/hosted-zones/ZTEST",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const LIST = "GET /api/v1/hosted-zones/ZTEST/records";

function rec(id: string, overrides: Partial<DnsRecord> = {}): DnsRecord {
  return {
    id,
    zone_id: "ZTEST",
    name: "www.example.com",
    record_type: "A",
    routing_policy: "SIMPLE",
    ttl_seconds: 300,
    values: [{ value: "192.0.2.10" }, { value: "192.0.2.11" }],
    display_values: ["192.0.2.10", "192.0.2.11"],
    comment: null,
    is_system: false,
    created_at: "2026-10-09T07:00:00Z",
    updated_at: "2026-10-09T07:00:00Z",
    ...overrides,
  } as DnsRecord;
}

const NS = rec("ns", { name: "example.com", record_type: "NS", is_system: true, values: [{ value: "ns-1.awsdns-01.invalid" }], display_values: ["ns-1.awsdns-01.invalid"], ttl_seconds: 172800 });
const SOA = rec("soa", { name: "example.com", record_type: "SOA", is_system: true, display_values: ["ns-1.awsdns-01.invalid awsdns-hostmaster.invalid 1 7200 900 1209600 86400"], ttl_seconds: 900 } as Partial<DnsRecord>);
const WWW = rec("www");

function PanelProbe() {
  const panel = useSplitPanelState();
  return panel ? <div data-testid="panel">{panel.content}</div> : null;
}

function Harness() {
  const listState = useRecordListState();
  return (
    <SplitPanelProvider>
      <ZoneRecords zoneId="ZTEST" listState={listState} />
      <PanelProbe />
    </SplitPanelProvider>
  );
}

function table() {
  return createWrapper(document.body).findTable()!;
}
function header() {
  return within(table().findHeaderSlot()!.getElement());
}
function lastUrl() {
  return navigation.replace.mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
  navigation.search = "";
  navigation.replace.mockReset();
  navigation.push.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ZoneRecords", () => {
  it("renders rows, the counter, and summarized values", async () => {
    mockFetch({ [LIST]: () => jsonResponse(200, page([NS, SOA, WWW])) });
    renderConsolePage(<Harness />);
    expect(await screen.findByText("192.0.2.10 + 1 more")).toBeInTheDocument();
    expect(header().getByText("(3)")).toBeInTheDocument();
    expect(screen.getAllByText("System")).toHaveLength(2);
  });

  it("updates the URL from search and filters and resets the page", async () => {
    navigation.search = "page=2";
    mockFetch({ [LIST]: () => jsonResponse(200, page([WWW], { total_items: 30 })) });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderConsolePage(<Harness />);
    await screen.findByText("192.0.2.10 + 1 more");

    await user.type(screen.getByRole("searchbox"), "192.0.2.11");
    vi.advanceTimersByTime(300);
    await waitFor(() => expect(lastUrl()).toBe("/hosted-zones/ZTEST?q=192.0.2.11"));

    const [typeSelect, routingSelect] = createWrapper(document.body).findTable()!.findFilterSlot()!.findAllSelects();
    typeSelect.openDropdown();
    typeSelect.selectOptionByValue("MX");
    expect(lastUrl()).toBe("/hosted-zones/ZTEST?record_type=MX");
    routingSelect.openDropdown();
    routingSelect.selectOptionByValue("SIMPLE");
    expect(lastUrl()).toBe("/hosted-zones/ZTEST?routing_policy=SIMPLE");
  });

  it("disables Edit and Delete with the reason for a system row", async () => {
    mockFetch({ [LIST]: () => jsonResponse(200, page([NS, SOA, WWW])) });
    renderConsolePage(<Harness />);
    await screen.findByText("192.0.2.10 + 1 more");
    expect(header().getByRole("button", { name: "Edit record" })).toBeDisabled();

    table().findRowSelectionArea(1)!.click(); // NS (system)
    expect(header().getByRole("button", { name: "Edit record" })).toHaveAttribute("aria-disabled", "true");
    expect(header().getByRole("button", { name: "Delete record" })).toHaveAttribute("aria-disabled", "true");
    expect(within(screen.getByTestId("panel")).getAllByText(/can't be edited or deleted/).length).toBeGreaterThan(0);

    table().findRowSelectionArea(3)!.click(); // www (user record)
    expect(header().getByRole("button", { name: "Edit record" })).toBeEnabled();
    expect(header().getByRole("button", { name: "Delete record" })).toBeEnabled();
  });

  it("shows every value in the details panel", async () => {
    mockFetch({ [LIST]: () => jsonResponse(200, page([WWW])) });
    renderConsolePage(<Harness />);
    await screen.findByText("192.0.2.10 + 1 more");
    table().findRowSelectionArea(1)!.click();
    const values = within(screen.getByTestId("record-values"));
    expect(values.getByText("192.0.2.10")).toBeInTheDocument();
    expect(values.getByText("192.0.2.11")).toBeInTheDocument();
  });

  it("shows the only-system notice when the zone has just NS and SOA", async () => {
    mockFetch({ [LIST]: () => jsonResponse(200, page([NS, SOA])) });
    const user = userEvent.setup();
    renderConsolePage(<Harness />);
    expect(await screen.findByText("This hosted zone has only default NS and SOA records.")).toBeInTheDocument();
    const createButtons = screen.getAllByRole("button", { name: "Create record" });
    await user.click(createButtons.at(-1)!);
    expect(navigation.push).toHaveBeenCalledWith("/hosted-zones/ZTEST/records/new");
  });

  it("shows the no-match state with Clear filters", async () => {
    navigation.search = "q=nothing&record_type=MX";
    mockFetch({ [LIST]: () => jsonResponse(200, page([])) });
    const user = userEvent.setup();
    renderConsolePage(<Harness />);
    expect(await screen.findByText("No matches")).toBeInTheDocument();
    expect(screen.queryByText("This hosted zone has only default NS and SOA records.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(lastUrl()).toBe("/hosted-zones/ZTEST");
  });

  it("shows an error with Retry", async () => {
    let calls = 0;
    mockFetch({
      [LIST]: () => (++calls === 1 ? jsonResponse(500, errorEnvelope("INTERNAL_ERROR", "x")) : jsonResponse(200, page([WWW]))),
    });
    const user = userEvent.setup();
    renderConsolePage(<Harness />);
    expect(await screen.findByText("Unable to load records")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("192.0.2.10 + 1 more")).toBeInTheDocument();
  });

  it("maps sortable headers to sort_by/sort_order", async () => {
    mockFetch({ [LIST]: () => jsonResponse(200, page([WWW])) });
    renderConsolePage(<Harness />);
    await screen.findByText("192.0.2.10 + 1 more");
    table().findColumnSortingArea(6)!.click(); // TTL (seconds)
    expect(lastUrl()).toBe("/hosted-zones/ZTEST?sort_by=ttl_seconds");
  });
});

describe("DeleteRecordModal", () => {
  it("lists the record and Cancel sends no request", async () => {
    const fetchMock = mockFetch({});
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    renderConsolePage(<DeleteRecordModal zoneId="ZTEST" record={WWW} onDismiss={onDismiss} />);
    const dialog = screen.getByRole("dialog", { name: "Delete record" });
    expect(within(dialog).getByText("192.0.2.11")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes, notifies, and refetches the list", async () => {
    let listCalls = 0;
    const fetchMock = mockFetch({
      "DELETE /api/v1/hosted-zones/ZTEST/records/www": () => jsonResponse(204),
      [LIST]: () => {
        listCalls += 1;
        return jsonResponse(200, page([NS, SOA]));
      },
    });
    const user = userEvent.setup();
    renderConsolePage(
      <>
        <Harness />
        <DeleteRecordModal zoneId="ZTEST" record={WWW} onDismiss={vi.fn()} />
      </>,
    );
    await waitFor(() => expect(listCalls).toBe(1));
    // The records tab has its own (hidden, empty) delete dialog; use the one showing this record.
    const dialog = screen.getAllByRole("dialog", { name: "Delete record" }).find((d) => within(d).queryByText("192.0.2.11"))!;
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Record www.example.com (A) deleted.")).toBeInTheDocument();
    await waitFor(() => expect(listCalls).toBe(2));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
  });

  it("keeps the dialog open with the protected explanation on 409", async () => {
    mockFetch({
      "DELETE /api/v1/hosted-zones/ZTEST/records/www": () =>
        jsonResponse(409, errorEnvelope("SYSTEM_RECORD_PROTECTED", "System records are managed automatically.")),
    });
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    renderConsolePage(<DeleteRecordModal zoneId="ZTEST" record={WWW} onDismiss={onDismiss} />);
    await user.click(within(screen.getByRole("dialog", { name: "Delete record" })).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/managed by the hosted zone and can't be edited or deleted/)).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
