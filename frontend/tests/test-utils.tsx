import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { vi } from "vitest";

import { PageChromeProvider } from "@/components/console-shell/PageChrome";
import { NotificationsFlashbar, NotificationsProvider } from "@/components/feedback/NotificationsProvider";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
}

export function renderWithProviders(ui: ReactElement, options?: RenderOptions & { queryClient?: QueryClient }) {
  const queryClient = options?.queryClient ?? createTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}

export function jsonResponse(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  if (status === 204) return new Response(null, { status, headers });
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function errorEnvelope(code: string, message: string, details: { field: string; message: string }[] = []) {
  return { error: { code, message, details, request_id: "req_0123456789abcdef" } };
}

/** Replaces global fetch with a mock that answers by "METHOD /path" (path without query). */
export function mockFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Renders inside the providers a console page needs (query, notifications, page chrome). */
export function renderConsolePage(ui: ReactElement, options?: { queryClient?: QueryClient }) {
  return renderWithProviders(
    <NotificationsProvider>
      <PageChromeProvider>
        {ui}
        <NotificationsFlashbar />
      </PageChromeProvider>
    </NotificationsProvider>,
    options,
  );
}

export function page<T>(items: T[], overrides: Partial<{ page: number; page_size: number; total_items: number; total_pages: number }> = {}) {
  const total = overrides.total_items ?? items.length;
  const size = overrides.page_size ?? 20;
  return {
    items,
    page: overrides.page ?? 1,
    page_size: size,
    total_items: total,
    total_pages: overrides.total_pages ?? Math.ceil(total / size),
  };
}
