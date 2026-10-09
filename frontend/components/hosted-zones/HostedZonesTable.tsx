"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import CollectionPreferences, {
  type CollectionPreferencesProps,
} from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { usePageChrome } from "@/components/console-shell/PageChrome";
import { ErrorState, TableEmptyState, TableNoMatchState } from "@/components/feedback/states";
import { userMessage } from "@/lib/api/errors";
import type { HostedZoneSummary, ZoneListParams, ZoneSortBy, ZoneType } from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters/dateTime";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useFollowHandler } from "@/lib/hooks/useFollowHandler";
import { useZonesList } from "@/lib/hooks/useHostedZones";
import { PAGE_SIZE_OPTIONS, useListQueryState, type ListQuerySchema } from "@/lib/hooks/useListQueryState";

import { DeleteHostedZoneModal } from "./DeleteHostedZoneModal";
import { ZONE_TYPE_LABELS, zoneHref } from "./zoneText";

type ColumnId = "name" | "zone_type" | "record_count" | "comment" | "zone_id" | "created_at";

export const ZONE_LIST_SCHEMA: ListQuerySchema<ZoneSortBy, "zone_type"> = {
  sortFields: ["name", "zone_type", "created_at"],
  defaultSortBy: "name",
  filters: { zone_type: ["PUBLIC", "PRIVATE"] },
};

const TYPE_OPTIONS: SelectProps.Option[] = [
  { value: "", label: "All types" },
  { value: "PUBLIC", label: "Public" },
  { value: "PRIVATE", label: "Private" },
];

const DEFAULT_COLUMNS: CollectionPreferencesProps.ContentDisplayItem[] = [
  { id: "name", visible: true },
  { id: "zone_type", visible: true },
  { id: "record_count", visible: true },
  { id: "comment", visible: true },
  { id: "zone_id", visible: true },
  { id: "created_at", visible: false },
];

const COLUMN_LABELS: Record<ColumnId, string> = {
  name: "Hosted zone name",
  zone_type: "Type",
  record_count: "Record count",
  comment: "Description",
  zone_id: "Hosted zone ID",
  created_at: "Created",
};

function useColumns(onFollow: ReturnType<typeof useFollowHandler>): TableProps.ColumnDefinition<HostedZoneSummary>[] {
  return [
    {
      id: "name",
      header: COLUMN_LABELS.name,
      sortingField: "name",
      cell: (zone) => (
        <Link href={zoneHref(zone.zone_id)} onFollow={onFollow}>
          {zone.name}
        </Link>
      ),
      isRowHeader: true,
    },
    { id: "zone_type", header: COLUMN_LABELS.zone_type, sortingField: "zone_type", cell: (zone) => ZONE_TYPE_LABELS[zone.zone_type] },
    { id: "record_count", header: COLUMN_LABELS.record_count, cell: (zone) => zone.record_count },
    {
      id: "comment",
      header: COLUMN_LABELS.comment,
      maxWidth: 320,
      cell: (zone) =>
        zone.comment ? (
          <span
            title={zone.comment}
            style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {zone.comment}
          </span>
        ) : (
          "-"
        ),
    },
    {
      id: "zone_id",
      header: COLUMN_LABELS.zone_id,
      cell: (zone) => (
        <Box variant="code" color="text-body-secondary">
          {zone.zone_id}
        </Box>
      ),
    },
    { id: "created_at", header: COLUMN_LABELS.created_at, sortingField: "created_at", cell: (zone) => formatDateTime(zone.created_at) },
  ];
}

/** The Route 53-style hosted zones list: server-side search, filter, sort, and pagination in the URL. */
export function HostedZonesTable() {
  usePageChrome({ breadcrumbs: [{ text: "Hosted zones", href: "/hosted-zones" }], contentType: "table" });
  const router = useRouter();
  const onFollow = useFollowHandler();
  const list = useListQueryState(ZONE_LIST_SCHEMA);
  const zoneType = list.filters.zone_type as ZoneType | undefined;

  const params: ZoneListParams = {
    q: list.q || undefined,
    zone_type: zoneType,
    page: list.page,
    page_size: list.page_size,
    sort_by: list.sort_by,
    sort_order: list.sort_order,
  };
  const query = useZonesList(params);
  const data = query.isError ? undefined : query.data;
  const items = data?.items ?? [];

  // Search text: typed locally, pushed to the URL after 300 ms (Enter applies immediately).
  const [filteringText, setFilteringText] = useState(list.q);
  const [syncedQ, setSyncedQ] = useState(list.q);
  if (list.q !== syncedQ) {
    // The URL changed elsewhere (Clear filters, back/forward): follow it.
    setSyncedQ(list.q);
    setFilteringText(list.q);
  }
  const debouncedText = useDebouncedValue(filteringText, 300);
  const { q, setQ, page, setPage } = list;
  useEffect(() => {
    if (debouncedText === filteringText && debouncedText.trim() !== q) setQ(debouncedText.trim());
  }, [debouncedText, filteringText, q, setQ]);

  // A page past the end (e.g. after deleting the last row on it) snaps back to the last page.
  const totalPages = data?.total_pages ?? 0;
  useEffect(() => {
    if (data && !query.isPlaceholderData && data.items.length === 0 && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [data, query.isPlaceholderData, totalPages, page, setPage]);

  // Selection resets whenever the visible page or filters change.
  const signature = JSON.stringify(params);
  const [selection, setSelection] = useState<{ signature: string; ids: string[] }>({ signature, ids: [] });
  const selectedIds = selection.signature === signature ? selection.ids : [];
  const selectedItems = items.filter((zone) => selectedIds.includes(zone.zone_id));
  const selected = selectedItems[0];

  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [zoneToDelete, setZoneToDelete] = useState<HostedZoneSummary | null>(null);
  const columnDefinitions = useColumns(onFollow);

  const filtered = Boolean(list.q || zoneType);
  const typeOption = TYPE_OPTIONS.find((option) => option.value === (zoneType ?? "")) ?? TYPE_OPTIONS[0];
  const sortingColumn = columnDefinitions.find((column) => column.sortingField === list.sort_by);

  let empty: ReactNode;
  if (query.isError) {
    empty = (
      <ErrorState title="Unable to load hosted zones" message={userMessage(query.error)} onRetry={() => void query.refetch()} />
    );
  } else if (filtered) {
    empty = <TableNoMatchState onClear={list.clearFilters} />;
  } else {
    empty = (
      <TableEmptyState
        title="No hosted zones"
        subtitle="You don't have any hosted zones."
        action={<Button onClick={() => router.push("/hosted-zones/new")}>Create hosted zone</Button>}
      />
    );
  }

  return (
    <>
      <Table<HostedZoneSummary>
        variant="full-page"
        items={items}
        trackBy="zone_id"
        columnDefinitions={columnDefinitions}
        columnDisplay={columns}
        loading={query.isPending}
        loadingText="Loading hosted zones"
        empty={empty}
        selectionType="single"
        selectedItems={selectedItems}
        onSelectionChange={({ detail }) =>
          setSelection({ signature, ids: detail.selectedItems.map((zone) => zone.zone_id) })
        }
        ariaLabels={{
          selectionGroupLabel: "Hosted zone selection",
          itemSelectionLabel: (_state, zone) => zone.name,
          allItemsSelectionLabel: () => "Select all",
          tableLabel: "Hosted zones",
        }}
        sortingColumn={sortingColumn}
        sortingDescending={list.sort_order === "desc"}
        onSortingChange={({ detail }) => {
          const field = detail.sortingColumn.sortingField as ZoneSortBy | undefined;
          if (field) list.setSort(field, detail.isDescending ? "desc" : "asc");
        }}
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={data ? `(${data.total_items})` : undefined}
            description="A hosted zone is a container for records, which include information about how you want to route traffic for a domain and its subdomains. In Fiftythree, records are stored locally."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  iconName="refresh"
                  ariaLabel="Refresh hosted zones"
                  loading={query.isFetching && !query.isPending}
                  onClick={() => void query.refetch()}
                />
                <Button disabled={!selected} onClick={() => selected && router.push(zoneHref(selected.zone_id))}>
                  View details
                </Button>
                <Button disabled={!selected} onClick={() => selected && router.push(`${zoneHref(selected.zone_id)}/edit`)}>
                  Edit
                </Button>
                <Button disabled={!selected} onClick={() => selected && setZoneToDelete(selected)}>
                  Delete
                </Button>
                <Button variant="primary" onClick={() => router.push("/hosted-zones/new")}>
                  Create hosted zone
                </Button>
              </SpaceBetween>
            }
          >
            Hosted zones
          </Header>
        }
        filter={
          <SpaceBetween direction="horizontal" size="xs">
            <div
              style={{ minWidth: 360 }}
              onKeyDown={(event) => {
                if (event.key === "Enter") list.setQ(filteringText.trim());
              }}
            >
              <TextFilter
                filteringText={filteringText}
                filteringPlaceholder="Search hosted zones by name or description"
                filteringAriaLabel="Search hosted zones by name or description"
                filteringClearAriaLabel="Clear search"
                countText={filtered && data ? `${data.total_items} ${data.total_items === 1 ? "match" : "matches"}` : undefined}
                onChange={({ detail }) => setFilteringText(detail.filteringText)}
              />
            </div>
            <Select
              selectedOption={typeOption}
              options={TYPE_OPTIONS}
              onChange={({ detail }) => list.setFilter("zone_type", detail.selectedOption.value || undefined)}
              ariaLabel="Type"
              inlineLabelText="Type"
            />
          </SpaceBetween>
        }
        pagination={
          <Pagination
            currentPageIndex={list.page}
            pagesCount={Math.max(totalPages, 1)}
            onChange={({ detail }) => list.setPage(detail.currentPageIndex)}
            ariaLabels={{
              nextPageLabel: "Next page",
              previousPageLabel: "Previous page",
              pageLabel: (pageNumber) => `Page ${pageNumber}`,
            }}
          />
        }
        preferences={
          <CollectionPreferences
            title="Preferences"
            confirmLabel="Confirm"
            cancelLabel="Cancel"
            preferences={{ pageSize: list.page_size, contentDisplay: columns }}
            pageSizePreference={{
              title: "Page size",
              options: PAGE_SIZE_OPTIONS.map((size) => ({ value: size, label: `${size} hosted zones` })),
            }}
            contentDisplayPreference={{
              title: "Column preferences",
              options: DEFAULT_COLUMNS.map((column) => ({
                id: column.id,
                label: COLUMN_LABELS[column.id as ColumnId],
                alwaysVisible: column.id === "name",
              })),
            }}
            onConfirm={({ detail }) => {
              if (detail.contentDisplay) setColumns([...detail.contentDisplay]);
              if (detail.pageSize && detail.pageSize !== list.page_size) list.setPageSize(detail.pageSize);
            }}
          />
        }
      />
      <DeleteHostedZoneModal zone={zoneToDelete} onDismiss={() => setZoneToDelete(null)} />
    </>
  );
}
