import createWrapper from "@cloudscape-design/components/test-utils/dom";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HostedZonesTable } from "@/components/hosted-zones/HostedZonesTable";
import type { HostedZoneSummary } from "@/lib/api/types";
import { errorEnvelope, jsonResponse, mockFetch, page, renderConsolePage } from "../test-utils";

const navigation = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  usePathname: () => "/hosted-zones",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

function zone(name: string, overrides: Partial<HostedZoneSummary> = {}): HostedZoneSummary {
  return {
    zone_id: `Z${name.replace(/[^a-z0-9]/gi, "").toUpperCase().padEnd(20, "0").slice(0, 20)}`,
    name,
    zone_type: "PUBLIC",
    comment: null,
    record_count: 2,
    created_at: "2026-10-09T07:00:00Z",
    updated_at: "2026-10-09T07:00:00Z",
    ...overrides,
  };
}

const ZONES = [zone("example.com", { comment: "Demo zone", record_count: 23 }), zone("example.net", { zone_type: "PRIVATE" })];

function lastUrl(): string {
  return navigation.replace.mock.calls.at(-1)?.[0] as string;
}

function table() {
  return createWrapper(document.body).findTable()!;
}

describe("HostedZonesTable", () => {
  beforeEach(() => {
    navigation.search = "";
    navigation.replace.mockReset();
    navigation.push.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders rows from the API with the header counter", async () => {
    const fetchMock = mockFetch({ "GET /api/v1/hosted-zones": () => jsonResponse(200, page(ZONES)) });
    renderConsolePage(<HostedZonesTable />);
    expect(await screen.findByRole("link", { name: "example.com" })).toHaveAttribute("href", `/hosted-zones/${ZONES[0].zone_id}`);
    expect(screen.getByText("Demo zone")).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/v1/hosted-zones?page=1&page_size=20&sort_by=name&sort_order=asc");
  });

  it("debounces search into the URL and resets the page", async () => {
    navigation.search = "page=3";
    mockFetch({ "GET /api/v1/hosted-zones": () => jsonResponse(200, page(ZONES, { total_items: 60 })) });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderConsolePage(<HostedZonesTable />);
    await screen.findByRole("link", { name: "example.com" });

    await user.type(screen.getByRole("searchbox"), "demo");
    expect(navigation.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    await waitFor(() => expect(lastUrl()).toBe("/hosted-zones?q=demo"));
  });

  it("applies the search immediately on Enter", async () => {
    mockFetch({ "GET /api/v1/hosted-zones": () => jsonResponse(200, page(ZONES)) });
    const user = userEvent.setup();
    renderConsolePage(<HostedZonesTable />);
    await screen.findByRole("link", { name: "example.com" });
    await user.type(screen.getByRole("searchbox"), "net{Enter}");
    expect(lastUrl()).toBe("/hosted-zones?q=net");
  });

  it("sets zone_type from the Type filter", async () => {
    navigation.search = "page=2";
    mockFetch({ "GET /api/v1/hosted-zones": () => jsonResponse(200, page(ZONES, { total_items: 40 })) });
    renderConsolePage(<HostedZonesTable />);
    await screen.findByRole("link", { name: "example.com" });
    const select = createWrapper(document.body).findSelect()!;
    select.openDropdown();
    select.selectOptionByValue("PRIVATE");
    expect(lastUrl()).toBe("/hosted-zones?zone_type=PRIVATE");
  });

  it("maps header sorting to sort_by and sort_order", async () => {
    mockFetch({ "GET /api/v1/hosted-zones": () => jsonResponse(200, page(ZONES)) });
    renderConsolePage(<HostedZonesTable />);
    await screen.findByRole("link", { name: "example.com" });
    table().findColumnSortingArea(2)!.click(); // "Hosted zone name" (already ascending)
    expect(lastUrl()).toBe("/hosted-zones?sort_order=desc");
    table().findColumnSortingArea(3)!.click(); // "Type"
    expect(lastUrl()).toBe("/hosted-zones?sort_by=zone_type");
    expect(table().findColumnSortingArea(4)).toBeNull(); // "Record count" is not sortable
  });

  it("changes the page through pagination and keeps it in the URL", async () => {
    mockFetch({ "GET /api/v1/hosted-zones": () => jsonResponse(200, page(ZONES, { total_items: 45 })) });
    renderConsolePage(<HostedZonesTable />);
    await screen.findByRole("link", { name: "example.com" });
    const pagination = createWrapper(document.body).findPagination()!;
    expect(pagination.findPageNumbers()).toHaveLength(3);
    pagination.findNextPageButton().click();
    expect(lastUrl()).toBe("/hosted-zones?page=2");
  });

  it("shows the empty state when there are no zones at all", async () => {
    mockFetch({ "GET /api/v1/hosted-zones": () => jsonResponse(200, page([])) });
    const user = userEvent.setup();
    renderConsolePage(<HostedZonesTable />);
    expect(await screen.findByText("No hosted zones")).toBeInTheDocument();
    expect(screen.getByText("You don't have any hosted zones.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Create hosted zone" }).at(-1)!);
    expect(navigation.push).toHaveBeenCalledWith("/hosted-zones/new");
  });

  it("shows the no-match state with Clear filters when filtering", async () => {
    navigation.search = "q=nothing&zone_type=PRIVATE";
    mockFetch({ "GET /api/v1/hosted-zones": () => jsonResponse(200, page([])) });
    const user = userEvent.setup();
    renderConsolePage(<HostedZonesTable />);
    expect(await screen.findByText("No matches")).toBeInTheDocument();
    expect(screen.queryByText("No hosted zones")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(lastUrl()).toBe("/hosted-zones");
  });

  it("shows an error with Retry that refetches", async () => {
    let calls = 0;
    mockFetch({
      "GET /api/v1/hosted-zones": () => {
        calls += 1;
        return calls === 1
          ? jsonResponse(500, errorEnvelope("INTERNAL_ERROR", "An unexpected error occurred."))
          : jsonResponse(200, page(ZONES));
      },
    });
    const user = userEvent.setup();
    renderConsolePage(<HostedZonesTable />);
    expect(await screen.findByText("Unable to load hosted zones")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "example.com" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "example.com" })).toBeInTheDocument();
  });

  it("enables View details, Edit, and Delete only with a selection", async () => {
    mockFetch({ "GET /api/v1/hosted-zones": () => jsonResponse(200, page(ZONES)) });
    const user = userEvent.setup();
    renderConsolePage(<HostedZonesTable />);
    await screen.findByRole("link", { name: "example.com" });
    // Scoped to the table header: the (hidden) delete dialog also has a "Delete" button.
    const header = () => within(table().findHeaderSlot()!.getElement());
    for (const name of ["View details", "Edit", "Delete"]) {
      expect(header().getByRole("button", { name })).toBeDisabled();
    }
    table().findRowSelectionArea(1)!.click();
    for (const name of ["View details", "Edit", "Delete"]) {
      expect(header().getByRole("button", { name })).toBeEnabled();
    }
    await user.click(header().getByRole("button", { name: "Edit" }));
    expect(navigation.push).toHaveBeenCalledWith(`/hosted-zones/${ZONES[0].zone_id}/edit`);

    await user.click(header().getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/This will also delete its 23 records/)).toBeInTheDocument();
  });
});
