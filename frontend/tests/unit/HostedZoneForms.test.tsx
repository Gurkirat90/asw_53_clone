import createWrapper from "@cloudscape-design/components/test-utils/dom";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateHostedZoneForm } from "@/components/hosted-zones/CreateHostedZoneForm";
import { DeleteHostedZoneModal } from "@/components/hosted-zones/DeleteHostedZoneModal";
import { EditHostedZonePage } from "@/components/hosted-zones/EditHostedZoneForm";
import type { HostedZoneDetail } from "@/lib/api/types";
import { errorEnvelope, jsonResponse, mockFetch, renderConsolePage } from "../test-utils";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  usePathname: () => "/hosted-zones",
  useSearchParams: () => new URLSearchParams(),
}));

const ZONE: HostedZoneDetail = {
  zone_id: "ZABCDEFGHIJKLMNOPQRST",
  name: "example.com",
  zone_type: "PUBLIC",
  comment: "Demo zone",
  record_count: 3,
  created_at: "2026-10-09T07:00:00Z",
  updated_at: "2026-10-09T07:00:00Z",
  name_servers: ["ns-1.awsdns-01.invalid"],
};

function requests(fetchMock: ReturnType<typeof mockFetch>, method: string) {
  return fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method);
}

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("CreateHostedZoneForm", () => {
  it("rejects an invalid domain without a request", async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();
    renderConsolePage(<CreateHostedZoneForm />);
    await user.type(screen.getByPlaceholderText("example.com"), "http://bad");
    await user.click(screen.getByRole("button", { name: "Create hosted zone" }));
    expect(await screen.findByText("Enter a valid domain name, such as example.com.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a server 422 on the name field", async () => {
    mockFetch({
      "POST /api/v1/hosted-zones": () =>
        jsonResponse(422, errorEnvelope("VALIDATION_ERROR", "The request contains invalid fields.", [
          { field: "name", message: "Server says no." },
        ])),
    });
    const user = userEvent.setup();
    renderConsolePage(<CreateHostedZoneForm />);
    await user.type(screen.getByPlaceholderText("example.com"), "example.com");
    await user.click(screen.getByRole("button", { name: "Create hosted zone" }));
    expect(await screen.findByText("Server says no.")).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("sends one normalized request, disables submit while pending, and navigates on success", async () => {
    let resolve: (response: Response) => void = () => undefined;
    const fetchMock = mockFetch({
      "POST /api/v1/hosted-zones": () => new Promise<Response>((done) => (resolve = done)),
    });
    const user = userEvent.setup();
    renderConsolePage(<CreateHostedZoneForm />);
    await user.type(screen.getByPlaceholderText("example.com"), " Example.COM. ");
    await user.type(screen.getByLabelText("Description"), "  Demo zone ");
    const submit = screen.getByRole("button", { name: "Create hosted zone" });
    await user.dblClick(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);

    expect(requests(fetchMock, "POST")).toHaveLength(1);
    const body = JSON.parse(String(requests(fetchMock, "POST")[0][1]?.body));
    expect(body).toEqual({ name: "example.com", zone_type: "PUBLIC", comment: "Demo zone" });

    resolve(jsonResponse(201, ZONE));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`/hosted-zones/${ZONE.zone_id}`));
    expect(await screen.findByText("Hosted zone example.com created.")).toBeInTheDocument();
  });

  it("shows the simulation notice for a private zone", async () => {
    mockFetch({});
    renderConsolePage(<CreateHostedZoneForm />);
    expect(screen.queryByText(/VPC association is simulated/)).not.toBeInTheDocument();
    createWrapper(document.body).findTiles()!.findInputByValue("PRIVATE")!.click();
    expect(await screen.findByText("VPC association is simulated in Fiftythree. No VPC is created or associated.")).toBeInTheDocument();
  });

  it("asks before discarding a dirty form", async () => {
    mockFetch({});
    const user = userEvent.setup();
    renderConsolePage(<CreateHostedZoneForm />);
    // The form's Cancel (the hidden discard dialog has its own Cancel).
    const formCancel = () => within(createWrapper(document.body).findForm()!.findActions()!.getElement()).getByRole("button", { name: "Cancel" });
    await user.click(formCancel());
    expect(navigation.push).toHaveBeenCalledWith("/hosted-zones");

    navigation.push.mockReset();
    await user.type(screen.getByPlaceholderText("example.com"), "x");
    await user.click(formCancel());
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
  });
});

describe("EditHostedZonePage", () => {
  it("shows name and type read-only and enables Save only after a change", async () => {
    const fetchMock = mockFetch({
      "GET /api/v1/hosted-zones/ZABCDEFGHIJKLMNOPQRST": () => jsonResponse(200, ZONE),
      "PATCH /api/v1/hosted-zones/ZABCDEFGHIJKLMNOPQRST": () => jsonResponse(200, { ...ZONE, comment: "New" }),
    });
    const user = userEvent.setup();
    renderConsolePage(<EditHostedZonePage zoneId={ZONE.zone_id} />);

    const description = await screen.findByLabelText("Description");
    expect(description).toHaveValue("Demo zone");
    expect(screen.getByText("Domain name and type cannot be changed after the hosted zone is created.")).toBeInTheDocument();
    // Name and type are text, not inputs.
    expect(screen.getAllByRole("textbox")).toEqual([description]);
    expect(screen.getByText("example.com")).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    await user.clear(description);
    await user.type(description, "New");
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`/hosted-zones/${ZONE.zone_id}`));
    expect(JSON.parse(String(requests(fetchMock, "PATCH")[0][1]?.body))).toEqual({ comment: "New" });
  });

  it("shows a not-found state for a missing zone", async () => {
    mockFetch({
      "GET /api/v1/hosted-zones/ZMISSING": () => jsonResponse(404, errorEnvelope("NOT_FOUND", "Hosted zone not found.")),
    });
    renderConsolePage(<EditHostedZonePage zoneId="ZMISSING" />);
    expect(await screen.findByText("Hosted zone not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to hosted zones" })).toBeInTheDocument();
  });
});

describe("DeleteHostedZoneModal", () => {
  it("requires typing delete, states the record count, and cancel sends nothing", async () => {
    const fetchMock = mockFetch({});
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    renderConsolePage(<DeleteHostedZoneModal zone={ZONE} onDismiss={onDismiss} />);

    expect(screen.getByText(/This will also delete its 3 records, including the default NS and SOA records/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "delete");
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the singular for one record", () => {
    mockFetch({});
    renderConsolePage(<DeleteHostedZoneModal zone={{ ...ZONE, record_count: 1 }} onDismiss={vi.fn()} />);
    expect(screen.getByText(/delete its 1 record,/)).toBeInTheDocument();
  });

  it("keeps the modal open with an inline error when the server fails", async () => {
    mockFetch({
      "DELETE /api/v1/hosted-zones/ZABCDEFGHIJKLMNOPQRST": () =>
        jsonResponse(500, errorEnvelope("INTERNAL_ERROR", "An unexpected error occurred.")),
    });
    const onDismiss = vi.fn();
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    renderConsolePage(<DeleteHostedZoneModal zone={ZONE} onDismiss={onDismiss} onDeleted={onDeleted} />);
    await user.type(screen.getByRole("textbox"), "delete");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("The service had a problem. Try again.")).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("deletes, notifies, and calls onDeleted on success", async () => {
    mockFetch({ "DELETE /api/v1/hosted-zones/ZABCDEFGHIJKLMNOPQRST": () => jsonResponse(204) });
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    renderConsolePage(<DeleteHostedZoneModal zone={ZONE} onDismiss={vi.fn()} onDeleted={onDeleted} />);
    await user.type(screen.getByRole("textbox"), "delete");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(await screen.findByText("Hosted zone example.com deleted.")).toBeInTheDocument();
  });
});
