"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { SortOrder } from "@/lib/api/types";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

/** Describes one list page's URL state; param names match the API query params exactly. */
export interface ListQuerySchema<S extends string, F extends string> {
  sortFields: readonly S[];
  defaultSortBy: S;
  defaultSortOrder?: SortOrder;
  /** Filter param name -> allowed values. */
  filters: Record<F, readonly string[]>;
}

export interface ListQueryState<S extends string, F extends string> {
  q: string;
  page: number;
  page_size: number;
  sort_by: S;
  sort_order: SortOrder;
  filters: Record<F, string | undefined>;
}

/** Parses list state from URL params; invalid values fall back to defaults. */
export function parseListQuery<S extends string, F extends string>(
  params: URLSearchParams,
  schema: ListQuerySchema<S, F>,
): ListQueryState<S, F> {
  const pageRaw = params.get("page");
  const page = pageRaw && /^\d+$/.test(pageRaw) && Number(pageRaw) >= 1 ? Number(pageRaw) : 1;
  const sizeRaw = Number(params.get("page_size"));
  const page_size = (PAGE_SIZE_OPTIONS as readonly number[]).includes(sizeRaw)
    ? sizeRaw
    : DEFAULT_PAGE_SIZE;
  const sortRaw = params.get("sort_by");
  const sort_by = schema.sortFields.find((field) => field === sortRaw) ?? schema.defaultSortBy;
  const orderRaw = params.get("sort_order");
  const sort_order: SortOrder =
    orderRaw === "asc" || orderRaw === "desc" ? orderRaw : (schema.defaultSortOrder ?? "asc");
  const filters = {} as Record<F, string | undefined>;
  for (const name of Object.keys(schema.filters) as F[]) {
    const raw = params.get(name);
    filters[name] = raw !== null && schema.filters[name].includes(raw) ? raw : undefined;
  }
  return { q: params.get("q") ?? "", page, page_size, sort_by, sort_order, filters };
}

/** Serializes state to URL params, omitting defaults so URLs stay short. */
export function serializeListQuery<S extends string, F extends string>(
  state: ListQueryState<S, F>,
  schema: ListQuerySchema<S, F>,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  for (const name of Object.keys(schema.filters) as F[]) {
    const value = state.filters[name];
    if (value) params.set(name, value);
  }
  if (state.page !== 1) params.set("page", String(state.page));
  if (state.page_size !== DEFAULT_PAGE_SIZE) params.set("page_size", String(state.page_size));
  if (state.sort_by !== schema.defaultSortBy) params.set("sort_by", state.sort_by);
  if (state.sort_order !== (schema.defaultSortOrder ?? "asc")) params.set("sort_order", state.sort_order);
  return params;
}

/**
 * List state (q, filters, page, page_size, sort_by, sort_order) stored in the URL.
 * Setters use router.replace (no history entry per keystroke). Changing q, a filter, or the
 * page size resets the page to 1.
 */
export function useListQueryState<S extends string, F extends string>(schema: ListQuerySchema<S, F>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const state = useMemo(
    () => parseListQuery(new URLSearchParams(search), schema),
    [search, schema],
  );

  const update = useCallback(
    (patch: Partial<Omit<ListQueryState<S, F>, "filters">> & { filters?: Partial<Record<F, string | undefined>> }) => {
      const next: ListQueryState<S, F> = {
        ...state,
        ...patch,
        filters: { ...state.filters, ...(patch.filters ?? {}) },
      };
      const resetsPage =
        (patch.q !== undefined && patch.q !== state.q) ||
        patch.filters !== undefined ||
        (patch.page_size !== undefined && patch.page_size !== state.page_size);
      if (resetsPage && patch.page === undefined) next.page = 1;
      const query = serializeListQuery(next, schema).toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [state, schema, router, pathname],
  );

  return {
    ...state,
    setQ: useCallback((q: string) => update({ q }), [update]),
    setFilter: useCallback(
      (name: F, value: string | undefined) =>
        update({ filters: { [name]: value } as Partial<Record<F, string | undefined>> }),
      [update],
    ),
    setPage: useCallback((page: number) => update({ page }), [update]),
    setPageSize: useCallback((page_size: number) => update({ page_size }), [update]),
    setSort: useCallback((sort_by: S, sort_order: SortOrder) => update({ sort_by, sort_order }), [update]),
    clearFilters: useCallback(() => {
      const cleared = {} as Record<F, string | undefined>;
      for (const name of Object.keys(schema.filters) as F[]) cleared[name] = undefined;
      update({ q: "", filters: cleared });
    }, [update, schema]),
  };
}
