import SideNavigation from "@cloudscape-design/components/side-navigation";
import createWrapper from "@cloudscape-design/components/test-utils/dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { activeNavHref, NAV_HEADER, NAV_ITEMS } from "@/components/console-shell/navigation";
import { PageChromeProvider, useShellChrome } from "@/components/console-shell/PageChrome";
import { ComingSoonPage } from "@/components/feedback/ComingSoonPage";
import {
  NotificationsFlashbar,
  NotificationsProvider,
  SUCCESS_AUTO_DISMISS_MS,
  useNotifications,
} from "@/components/feedback/NotificationsProvider";
import { TableNoMatchState } from "@/components/feedback/states";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

describe("side navigation", () => {
  it.each([
    ["/hosted-zones", "/hosted-zones"],
    ["/hosted-zones/Z123", "/hosted-zones"],
    ["/hosted-zones/Z123/records/new", "/hosted-zones"],
    ["/traffic-policies", "/traffic-policies"],
    ["/dashboard", "/dashboard"],
    ["/unknown", undefined],
  ])("%s highlights %s", (path, expected) => {
    expect(activeNavHref(path)).toBe(expected);
  });

  it("marks Hosted zones active for a zone detail path", () => {
    const { container } = render(
      <SideNavigation header={NAV_HEADER} items={NAV_ITEMS} activeHref={activeNavHref("/hosted-zones/Z123")} />,
    );
    const active = createWrapper(container).findSideNavigation()!.findActiveLink();
    expect(active?.getElement()).toHaveTextContent("Hosted zones");
  });
});

function ChromeProbe() {
  const { breadcrumbs } = useShellChrome();
  return <div data-testid="crumbs">{breadcrumbs.map((crumb) => crumb.text).join(" > ")}</div>;
}

describe("ComingSoonPage", () => {
  it("renders the title, Coming soon, the scope sentence, and a Hosted zones link", async () => {
    const user = userEvent.setup();
    render(
      <PageChromeProvider>
        <ChromeProbe />
        <ComingSoonPage title="Health checks" href="/health-checks" />
      </PageChromeProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Health checks" })).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByText("Health checks is outside the functional scope of Fiftythree.")).toBeInTheDocument();
    expect(screen.getByTestId("crumbs")).toHaveTextContent("Route 53 > Health checks");
    expect(screen.queryAllByRole("button")).toHaveLength(0);

    await user.click(screen.getByRole("link", { name: "Go to Hosted zones" }));
    expect(push).toHaveBeenCalledWith("/hosted-zones");
  });
});

function NotifyButtons() {
  const { notify } = useNotifications();
  return (
    <>
      <button onClick={() => notify({ type: "success", content: "Hosted zone created" })}>success</button>
      <button onClick={() => notify({ type: "error", content: "Delete failed" })}>error</button>
    </>
  );
}

describe("notifications", () => {
  afterEach(() => vi.useRealTimers());

  it("auto-dismisses success but keeps errors until dismissed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(
      <NotificationsProvider>
        <NotifyButtons />
        <NotificationsFlashbar />
      </NotificationsProvider>,
    );
    await user.click(screen.getByText("success"));
    await user.click(screen.getByText("error"));
    expect(screen.getByText("Hosted zone created")).toBeInTheDocument();
    expect(screen.getByText("Delete failed")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(SUCCESS_AUTO_DISMISS_MS + 50));
    // Flashbar keeps removed items briefly for its exit animation.
    await waitFor(() => expect(screen.queryByText("Hosted zone created")).not.toBeInTheDocument());
    expect(screen.getByText("Delete failed")).toBeInTheDocument();

    const flash = createWrapper(container).findFlashbar()!.findItems()[0];
    await user.click(flash.findDismissButton()!.getElement());
    await waitFor(() => expect(screen.queryByText("Delete failed")).not.toBeInTheDocument());
  });
});

describe("table states", () => {
  it("TableNoMatchState offers Clear filters", async () => {
    const onClear = vi.fn();
    render(<TableNoMatchState onClear={onClear} />);
    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.getByText("We can't find a match.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalled();
  });
});
