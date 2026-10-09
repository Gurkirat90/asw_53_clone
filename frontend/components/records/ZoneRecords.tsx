"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSplitPanel } from "@/components/console-shell/SplitPanelSlot";
import { TableNoMatchState } from "@/components/feedback/states";
import type { DnsRecord } from "@/lib/api/types";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useRecordsList } from "@/lib/hooks/useHostedZones";

import { DeleteRecordModal } from "./DeleteRecordModal";
import { RecordDetailsPanel } from "./RecordDetailsPanel";
import { RecordsTable, recordListParams, type RecordListState } from "./RecordsTable";
import { recordCreateHref, recordEditHref, RECORD_TYPE_ORDER, SYSTEM_RECORD_REASON } from "./recordText";

const TYPE_OPTIONS: SelectProps.Option[] = [
  { value: "", label: "All record types" },
  ...RECORD_TYPE_ORDER.map((type) => ({ value: type, label: type })),
  { value: "SOA", label: "SOA" },
];
const ROUTING_OPTIONS: SelectProps.Option[] = [
  { value: "", label: "All routing policies" },
  { value: "SIMPLE", label: "Simple" },
];

/**
 * The Records tab: search, Type and Routing policy filters, sorting, pagination, single selection
 * with a details split panel, and create/edit/delete. System NS/SOA rows are view-only.
 */
export function ZoneRecords({ zoneId, listState }: { zoneId: string; listState: RecordListState }) {
  const router = useRouter();
  const params = recordListParams(listState);
  // Same query key as RecordsTable, so this shares its request and cache.
  const query = useRecordsList(zoneId, params);
  const data = query.isError ? undefined : query.data;
  const items = data?.items ?? [];

  // Search text: local, pushed to the URL after 300 ms (Enter applies immediately).
  const [filteringText, setFilteringText] = useState(listState.q);
  const [syncedQ, setSyncedQ] = useState(listState.q);
  if (listState.q !== syncedQ) {
    setSyncedQ(listState.q);
    setFilteringText(listState.q);
  }
  const debouncedText = useDebouncedValue(filteringText, 300);
  const { q, setQ } = listState;
  useEffect(() => {
    if (debouncedText === filteringText && debouncedText.trim() !== q) setQ(debouncedText.trim());
  }, [debouncedText, filteringText, q, setQ]);

  // Selection resets when the page or filters change.
  const signature = JSON.stringify(params);
  const [selection, setSelection] = useState<{ signature: string; id: string | null }>({ signature, id: null });
  const selectedId = selection.signature === signature ? selection.id : null;
  const selected = items.find((record) => record.id === selectedId) ?? null;
  const [panelOpen, setPanelOpen] = useState(false);
  const [toDelete, setToDelete] = useState<DnsRecord | null>(null);

  const reason = selected?.is_system ? SYSTEM_RECORD_REASON : undefined;
  const canMutate = Boolean(selected && !selected.is_system);
  const editSelected = () => selected && !selected.is_system && router.push(recordEditHref(zoneId, selected.id));

  useSplitPanel(
    selected
      ? {
          header: selected.name,
          open: panelOpen,
          onToggle: setPanelOpen,
          content: (
            <RecordDetailsPanel record={selected} onEdit={editSelected} onDelete={() => setToDelete(selected)} />
          ),
        }
      : null,
  );

  const recordType = listState.filters.record_type;
  const routing = listState.filters.routing_policy;
  const filtered = Boolean(listState.q || recordType || routing);
  const onlySystem = !filtered && data !== undefined && data.total_items > 0 && items.every((r) => r.is_system) && data.total_pages <= 1;

  return (
    <>
      <RecordsTable
        zoneId={zoneId}
        listState={listState}
        sortingEnabled
        selectionType="single"
        selectedItems={selected ? [selected] : []}
        onSelectionChange={(records) => {
          setSelection({ signature, id: records[0]?.id ?? null });
          setPanelOpen(records.length > 0);
        }}
        headerActions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              iconName="refresh"
              ariaLabel="Refresh records"
              loading={query.isFetching && !query.isPending}
              onClick={() => void query.refetch()}
            />
            <Button disabled={!canMutate} disabledReason={reason} onClick={editSelected}>
              Edit record
            </Button>
            <Button disabled={!canMutate} disabledReason={reason} onClick={() => selected && setToDelete(selected)}>
              Delete record
            </Button>
            <Button variant="primary" onClick={() => router.push(recordCreateHref(zoneId))}>
              Create record
            </Button>
          </SpaceBetween>
        }
        filter={
          <SpaceBetween direction="horizontal" size="xs">
            <div
              style={{ minWidth: 320 }}
              onKeyDown={(event) => {
                if (event.key === "Enter") listState.setQ(filteringText.trim());
              }}
            >
              <TextFilter
                filteringText={filteringText}
                filteringPlaceholder="Filter records by property or value"
                filteringAriaLabel="Filter records by property or value"
                filteringClearAriaLabel="Clear filter"
                countText={filtered && data ? `${data.total_items} ${data.total_items === 1 ? "match" : "matches"}` : undefined}
                onChange={({ detail }) => setFilteringText(detail.filteringText)}
              />
            </div>
            <Select
              selectedOption={TYPE_OPTIONS.find((option) => option.value === (recordType ?? "")) ?? TYPE_OPTIONS[0]}
              options={TYPE_OPTIONS}
              onChange={({ detail }) => listState.setFilter("record_type", detail.selectedOption.value || undefined)}
              inlineLabelText="Type"
              ariaLabel="Record type filter"
            />
            <Select
              selectedOption={ROUTING_OPTIONS.find((option) => option.value === (routing ?? "")) ?? ROUTING_OPTIONS[0]}
              options={ROUTING_OPTIONS}
              onChange={({ detail }) => listState.setFilter("routing_policy", detail.selectedOption.value || undefined)}
              inlineLabelText="Routing policy"
              ariaLabel="Routing policy filter"
            />
          </SpaceBetween>
        }
        empty={filtered ? <TableNoMatchState onClear={listState.clearFilters} /> : undefined}
        footer={
          onlySystem ? (
            <Box textAlign="center" padding={{ vertical: "xs" }}>
              <SpaceBetween size="xs" alignItems="center">
                <Box variant="p" color="text-body-secondary">
                  This hosted zone has only default NS and SOA records.
                </Box>
                <Button onClick={() => router.push(recordCreateHref(zoneId))}>Create record</Button>
              </SpaceBetween>
            </Box>
          ) : undefined
        }
      />
      <DeleteRecordModal
        zoneId={zoneId}
        record={toDelete}
        onDismiss={() => setToDelete(null)}
        onDeleted={() => {
          setSelection({ signature, id: null });
          setPanelOpen(false);
        }}
      />
    </>
  );
}
