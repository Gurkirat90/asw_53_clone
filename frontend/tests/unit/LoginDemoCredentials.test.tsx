import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { errorEnvelope, jsonResponse, mockFetch, renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

async function renderLogin() {
  vi.resetModules();
  const { LoginForm } = await import("@/app/(auth)/login/LoginForm");
  mockFetch({ "GET /api/v1/auth/me": () => jsonResponse(401, errorEnvelope("UNAUTHENTICATED", "x")) });
  renderWithProviders(<LoginForm />);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("login demo credentials", () => {
  it("shows and fills the configured demo credentials", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_EMAIL", "demo@example.test");
    vi.stubEnv("NEXT_PUBLIC_DEMO_PASSWORD", "shareable-demo-pass");
    await renderLogin();
    expect(screen.getByText("Demo credentials")).toBeInTheDocument();
    expect(screen.getByText("shareable-demo-pass")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use demo credentials" }));
    expect(screen.getByLabelText("Email address")).toHaveValue("demo@example.test");
    expect(screen.getByLabelText("Password")).toHaveValue("shareable-demo-pass");
  });

  it("falls back to the README hint when not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_EMAIL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_PASSWORD", "");
    await renderLogin();
    expect(screen.queryByText("Demo credentials")).not.toBeInTheDocument();
    expect(screen.getByText(/demo credentials from the README/)).toBeInTheDocument();
  });
});
