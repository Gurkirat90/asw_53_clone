"use client";

import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import { useEffect, type ReactNode } from "react";

import { ErrorState, TableEmptyState } from "@/components/feedback/states";
import { userMessage } from "@/lib/api/errors";
import type { AnyRecordType, DnsRecord, RecordListParams, RecordSortBy } from "@/lib/api/types";
import { formatRecordValuesSummary } from "@/lib/formatters/records";
import { useRecordsList } from "@/lib/hooks/useHostedZones";
import { PAGE_SIZE_OPTIONS, useListQueryState, type ListQuerySchema } from "@/lib/hooks/useListQueryState";

const RECORD_TYPE_FILTER_VALUES: readonly AnyRecordType[] = [
  "A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA", "SOA",
];

/** URL state for a zone's records; param names match the API (PROMPT 06 adds q/filters/sorting UI). */
export const RECORD_LIST_SCHEMA: ListQuerySchema<RecordSortBy, "record_type" | "routing_policy"> = {
  sortFields: ["name", "record_type", "ttl_seconds", "updated_at"],
  defaultSortBy: "name",
  filters: { record_type: RECORD_TYPE_FILTER_VALUES, routing_policy: ["SIMPLE"] },
};

export function useRecordListState() {
  return useListQueryState(RECORD_LIST_SCHEMA);
}

export type RecordListState = ReturnType<typeof useRecordListState>;

export function recordListParams(state: RecordListState): RecordListParams {
  return {
    q: state.q || undefined,
    record_type: state.filters.record_type as AnyRecordType | undefined,
    routing_policy: state.filters.routing_policy as "SIMPLE" | undefined,
    page: state.page,
    page_size: state.page_size,
    sort_by: state.sort_by,
    sort_order: state.sort_order,
  };
}

export const RECORD_COLUMNS: TableProps.ColumnDefinition<DnsRecord>[] = [
  {
    id: "name",
    header: "Record name",
    sortingField: "name",
    isRowHeader: true,
    cell: (record) => (
      <SpaceBetween direction="horizontal" size="xs" alignItems="center">
        <span style={{ wordBreak: "break-all" }}>{record.name}</span>
        {record.is_system ? <Badge color="grey">System</Badge> : null}
      </SpaceBetween>
    ),
  },
  { id: "record_type", header: "Type", sortingField: "record_type", cell: (record) => record.record_type },
  { id: "routing_policy", header: "Routing policy", cell: () => "Simple" },
  { id: "alias", header: "Alias", cell: () => "No" },
  { id: "ttl_seconds", header: "TTL (seconds)", sortingField: "ttl_seconds", cell: (record) => record.ttl_seconds },
  {
    id: "value",
    header: "Value/Route traffic to",
    cell: (record) => (
      <span title={record.display_values.join("\n")}>{formatRecordValuesSummary(record.display_values)}</span>
    ),
  },
];

export interface RecordsTableProps {
  zoneId: string;
  /** URL-backed list state from useRecordListState(), owned by the page so filters can share it. */
  listState: RecordListState;
  /** Header action buttons (PROMPT 06: create/edit/delete). */
  headerActions?: ReactNode;
  /** Filter slot (PROMPT 06: search, type and routing filters). */
  filter?: ReactNode;
  /** Empty-state override, e.g. a no-match state when filters are active. */
  empty?: ReactNode;
  /** Controlled selection (PROMPT 06). Omit for a read-only table. */
  selectionType?: TableProps.SelectionType;
  selectedItems?: DnsRecord[];
  onSelectionChange?: (records: DnsRecord[]) => void;
  /** Enables server-side sorting on name/type/TTL (PROMPT 06). */
  sortingEnabled?: boolean;
}

/** A zone's records from the real API with server-side pagination (page/page_size in the URL). */
export function RecordsTable({
  zoneId,
  listState,
  headerActions,
  filter,
  empty,
  selectionType,
  selectedItems,
  onSelectionChange,
  sortingEnabled = false,
}: RecordsTableProps) {
  const query = useRecordsList(zoneId, recordListParams(listState));
  const data = query.isError ? undefined : query.data;
  const totalPages = data?.total_pages ?? 0;
  const { page, setPage } = listState;

  useEffect(() => {
    if (data && !query.isPlaceholderData && data.items.length === 0 && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [data, query.isPlaceholderData, totalPages, page, setPage]);

  const sortingColumn = sortingEnabled
    ? RECORD_COLUMNS.find((column) => column.sortingField === listState.sort_by)
    : undefined;

  return (
    <Table<DnsRecord>
      items={data?.items ?? []}
      trackBy="id"
      columnDefinitions={RECORD_COLUMNS}
      loading={query.isPending}
      loadingText="Loading records"
      variant="borderless"
      selectionType={selectionType}
      selectedItems={selectedItems}
      onSelectionChange={onSelectionChange ? ({ detail }) => onSelectionChange(detail.selectedItems) : undefined}
      sortingDisabled={!sortingEnabled}
      sortingColumn={sortingColumn}
      sortingDescending={listState.sort_order === "desc"}
      onSortingChange={({ detail }) => {
        const field = detail.sortingColumn.sortingField as RecordSortBy | undefined;
        if (field) listState.setSort(field, detail.isDescending ? "desc" : "asc");
      }}
      ariaLabels={{
        tableLabel: "Records",
        selectionGroupLabel: "Record selection",
        itemSelectionLabel: (_state, record) => `${record.name} ${record.record_type}`,
        allItemsSelectionLabel: () => "Select all records",
      }}
      header={
        <Header variant="h2" counter={data ? `(${data.total_items})` : undefined} actions={headerActions}>
          Records
        </Header>
      }
      filter={filter}
      empty={
        query.isError ? (
          <ErrorState title="Unable to load records" message={userMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          (empty ?? <TableEmptyState title="No records" subtitle="This hosted zone has no records." />)
        )
      }
      pagination={
        <Pagination
          currentPageIndex={listState.page}
          pagesCount={Math.max(totalPages, 1)}
          onChange={({ detail }) => listState.setPage(detail.currentPageIndex)}
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
          preferences={{ pageSize: listState.page_size }}
          pageSizePreference={{
            title: "Page size",
            options: PAGE_SIZE_OPTIONS.map((size) => ({ value: size, label: `${size} records` })),
          }}
          onConfirm={({ detail }) => {
            if (detail.pageSize && detail.pageSize !== listState.page_size) listState.setPageSize(detail.pageSize);
          }}
        />
      }
      footer={
        data && data.total_items > 0 ? (
          <Box variant="small" color="text-body-secondary">
            Records are stored in this application&apos;s database only; nothing is published to DNS.
          </Box>
        ) : undefined
      }
    />
  );
}
