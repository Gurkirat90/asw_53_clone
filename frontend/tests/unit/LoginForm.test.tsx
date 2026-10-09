import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/app/(auth)/login/LoginForm";
import { errorEnvelope, jsonResponse, mockFetch, renderWithProviders } from "../test-utils";

const navigation = vi.hoisted(() => ({ search: "", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const USER = { id: "u1", email: "demo@example.test", display_name: "Demo User" };
const signedOutMe = () => jsonResponse(401, errorEnvelope("UNAUTHENTICATED", "Sign in again."));

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText("Email address"), email);
  if (password) await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    navigation.search = "";
    navigation.replace.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rejects empty fields without sending a login request", async () => {
    const fetchMock = mockFetch({ "GET /api/v1/auth/me": signedOutMe });
    renderWithProviders(<LoginForm />);
    await fillAndSubmit("", "");

    expect(await screen.findByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/auth/login"))).toBe(false);
  });

  it("shows the generic message on 401", async () => {
    mockFetch({
      "GET /api/v1/auth/me": signedOutMe,
      "POST /api/v1/auth/login": () =>
        jsonResponse(401, errorEnvelope("AUTHENTICATION_FAILED", "Sign-in failed. Check your credentials.")),
    });
    renderWithProviders(<LoginForm />);
    await fillAndSubmit("demo@example.test", "wrong");

    expect(await screen.findByText("Sign-in failed. Check your credentials.")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("maps server field errors onto the fields", async () => {
    mockFetch({
      "GET /api/v1/auth/me": signedOutMe,
      "POST /api/v1/auth/login": () =>
        jsonResponse(422, errorEnvelope("VALIDATION_ERROR", "The request contains invalid fields.", [
          { field: "email", message: "Enter no more than 254 characters." },
        ])),
    });
    renderWithProviders(<LoginForm />);
    await fillAndSubmit("demo@example.test", "x");
    expect(await screen.findByText("Enter no more than 254 characters.")).toBeInTheDocument();
  });

  it("navigates to the validated next path after signing in", async () => {
    navigation.search = "next=%2Fhosted-zones%2FZ123%3Fq%3Dwww";
    let signedIn = false;
    mockFetch({
      "GET /api/v1/auth/me": () => (signedIn ? jsonResponse(200, USER) : signedOutMe()),
      "POST /api/v1/auth/login": () => {
        signedIn = true;
        return jsonResponse(200, USER);
      },
    });
    renderWithProviders(<LoginForm />);
    await fillAndSubmit("demo@example.test", "e2e-demo-password");
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/hosted-zones/Z123?q=www"));
  });

  it("ignores an unsafe next and falls back to /hosted-zones", async () => {
    navigation.search = "next=%2F%2Fevil.example.com";
    mockFetch({
      "GET /api/v1/auth/me": signedOutMe,
      "POST /api/v1/auth/login": () => jsonResponse(200, USER),
    });
    renderWithProviders(<LoginForm />);
    await fillAndSubmit("demo@example.test", "pw");
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/hosted-zones"));
  });

  it("redirects an already signed-in user", async () => {
    mockFetch({ "GET /api/v1/auth/me": () => jsonResponse(200, USER) });
    renderWithProviders(<LoginForm />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/hosted-zones"));
  });

  it("focuses the email field first", async () => {
    mockFetch({ "GET /api/v1/auth/me": signedOutMe });
    renderWithProviders(<LoginForm />);
    await waitFor(() => expect(screen.getByLabelText("Email address")).toHaveFocus());
  });
});
