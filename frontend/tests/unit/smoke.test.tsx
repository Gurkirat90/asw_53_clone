import Button from "@cloudscape-design/components/button";
import createWrapper from "@cloudscape-design/components/test-utils/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

function ClickCounter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <Button onClick={() => setCount((value) => value + 1)}>Increment</Button>
      <p>Clicked {count} times</p>
    </div>
  );
}

describe("frontend test harness", () => {
  it("renders a Cloudscape Button and handles clicks", async () => {
    const user = userEvent.setup();
    const { container } = render(<ClickCounter />);

    const button = createWrapper(container).findButton();
    expect(button).not.toBeNull();
    expect(button!.getElement()).toHaveTextContent("Increment");

    await user.click(screen.getByRole("button", { name: "Increment" }));
    expect(screen.getByText("Clicked 1 times")).toBeInTheDocument();
  });
});
