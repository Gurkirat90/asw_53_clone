import Button from "@cloudscape-design/components/button";
import createWrapper from "@cloudscape-design/components/test-utils/dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmationModal } from "@/components/dialogs/ConfirmationModal";

function modal() {
  const wrapper = createWrapper(document.body).findModal();
  if (!wrapper) throw new Error("modal not rendered");
  return wrapper;
}

function confirmButton() {
  return screen.getByRole("button", { name: "Delete" });
}

describe("ConfirmationModal", () => {
  it("requires the typed text before confirming", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal visible header="Delete hosted zone" confirmLabel="Delete" requireTypedText="delete"
        onConfirm={onConfirm} onDismiss={vi.fn()}>
        Delete example.com and its 3 records?
      </ConfirmationModal>,
    );
    expect(screen.getByText('To confirm deletion, type "delete" in the field.')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();

    const input = screen.getByRole("textbox");
    await user.type(input, "delet");
    expect(confirmButton()).toBeDisabled();
    await user.type(input, "e");
    expect(confirmButton()).toBeEnabled();
    await user.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Cancel calls onDismiss without confirming", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ConfirmationModal visible header="Delete record" confirmLabel="Delete" onConfirm={onConfirm} onDismiss={onDismiss}>
        Delete www.example.com?
      </ConfirmationModal>,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows an error inline and stays open", () => {
    render(
      <ConfirmationModal visible header="Delete record" confirmLabel="Delete" error="The service had a problem. Try again."
        onConfirm={vi.fn()} onDismiss={vi.fn()}>
        Delete www.example.com?
      </ConfirmationModal>,
    );
    expect(modal().isVisible()).toBe(true);
    expect(screen.getByText("The service had a problem. Try again.")).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it("disables both actions while loading", () => {
    render(
      <ConfirmationModal visible header="Delete record" confirmLabel="Delete" loading onConfirm={vi.fn()} onDismiss={vi.fn()}>
        Delete?
      </ConfirmationModal>,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("moves focus into the dialog and returns it to the trigger on close", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open dialog</Button>
          <ConfirmationModal visible={open} header="Delete hosted zone" confirmLabel="Delete" requireTypedText="delete"
            onConfirm={vi.fn()} onDismiss={() => setOpen(false)}>
            Delete example.com?
          </ConfirmationModal>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    await user.click(trigger);
    await waitFor(() => expect(modal().getElement().contains(document.activeElement)).toBe(true));

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
