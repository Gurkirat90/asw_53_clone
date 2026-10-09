import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { parseListQuery, useListQueryState, type ListQuerySchema } from "@/lib/hooks/useListQueryState";

const navigation = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: vi.fn() }),
  usePathname: () => "/hosted-zones",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const SCHEMA: ListQuerySchema<"name" | "created_at", "zone_type"> = {
  sortFields: ["name", "created_at"],
  defaultSortBy: "name",
  filters: { zone_type: ["PUBLIC", "PRIVATE"] },
};

describe("useListQueryState", () => {
  beforeEach(() => {
    navigation.search = "";
    navigation.replace.mockReset();
  });

  it("uses defaults when the URL has no params", () => {
    const { result } = renderHook(() => useListQueryState(SCHEMA));
    expect(result.current).toMatchObject({
      q: "",
      page: 1,
      page_size: 20,
      sort_by: "name",
      sort_order: "asc",
      filters: { zone_type: undefined },
    });
  });

  it("falls back to defaults for invalid values", () => {
    const state = parseListQuery(
      new URLSearchParams("page=-3&page_size=37&sort_by=comment&sort_order=up&zone_type=SHARED"),
      SCHEMA,
    );
    expect(state).toMatchObject({ page: 1, page_size: 20, sort_by: "name", sort_order: "asc", filters: { zone_type: undefined } });
    expect(parseListQuery(new URLSearchParams("page=abc&page_size=100"), SCHEMA)).toMatchObject({ page: 1, page_size: 100 });
  });

  it("reads valid values", () => {
    navigation.search = "q=web&zone_type=PRIVATE&page=3&page_size=50&sort_by=created_at&sort_order=desc";
    const { result } = renderHook(() => useListQueryState(SCHEMA));
    expect(result.current).toMatchObject({
      q: "web", page: 3, page_size: 50, sort_by: "created_at", sort_order: "desc", filters: { zone_type: "PRIVATE" },
    });
  });

  it("resets the page when q, a filter, or the page size changes", () => {
    navigation.search = "page=4&q=old";
    const { result } = renderHook(() => useListQueryState(SCHEMA));

    act(() => result.current.setQ("new"));
    expect(navigation.replace).toHaveBeenLastCalledWith("/hosted-zones?q=new", { scroll: false });

    act(() => result.current.setFilter("zone_type", "PUBLIC"));
    expect(navigation.replace).toHaveBeenLastCalledWith("/hosted-zones?q=old&zone_type=PUBLIC", { scroll: false });

    act(() => result.current.setPageSize(50));
    expect(navigation.replace).toHaveBeenLastCalledWith("/hosted-zones?q=old&page_size=50", { scroll: false });
  });

  it("keeps the page for sort changes and sets explicit pages", () => {
    navigation.search = "page=2";
    const { result } = renderHook(() => useListQueryState(SCHEMA));
    act(() => result.current.setSort("created_at", "desc"));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/hosted-zones?page=2&sort_by=created_at&sort_order=desc",
      { scroll: false },
    );
    act(() => result.current.setPage(1));
    expect(navigation.replace).toHaveBeenLastCalledWith("/hosted-zones", { scroll: false });
  });

  it("clears search and filters together", () => {
    navigation.search = "q=x&zone_type=PRIVATE&page=2&sort_by=created_at";
    const { result } = renderHook(() => useListQueryState(SCHEMA));
    act(() => result.current.clearFilters());
    expect(navigation.replace).toHaveBeenLastCalledWith("/hosted-zones?sort_by=created_at", { scroll: false });
  });
});

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("updates only after the value stops changing for 300 ms", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: "a" },
    });
    rerender({ value: "ab" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: "abc" });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("abc");
  });
});
