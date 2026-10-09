"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";

import type { DnsRecord } from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters/dateTime";

import { SYSTEM_RECORD_REASON } from "./recordText";

/** Full details of one record, shown in the split panel. */
export function RecordDetailsPanel({
  record,
  onEdit,
  onDelete,
}: {
  record: DnsRecord;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const reason = record.is_system ? SYSTEM_RECORD_REASON : undefined;
  return (
    <SpaceBetween size="l">
      {record.is_system ? (
        <SpaceBetween size="xxs">
          <StatusIndicator type="info">System record</StatusIndicator>
          <Box variant="small" color="text-body-secondary">
            {SYSTEM_RECORD_REASON}
          </Box>
        </SpaceBetween>
      ) : null}
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onEdit} disabled={record.is_system} disabledReason={reason}>
          Edit
        </Button>
        <Button onClick={onDelete} disabled={record.is_system} disabledReason={reason}>
          Delete
        </Button>
      </SpaceBetween>
      <KeyValuePairs
        columns={3}
        items={[
          { label: "Record name", value: <span style={{ wordBreak: "break-all" }}>{record.name}</span> },
          { label: "Record type", value: record.record_type },
          { label: "Routing policy", value: "Simple" },
          { label: "Alias", value: "No" },
          { label: "TTL (seconds)", value: String(record.ttl_seconds) },
          {
            label: "Value",
            value: (
              <div data-testid="record-values">
                {record.display_values.map((value, index) => (
                  <div key={`${index}-${value}`} style={{ wordBreak: "break-all" }}>
                    {value}
                  </div>
                ))}
              </div>
            ),
          },
          { label: "Comment", value: record.comment ?? "-" },
          { label: "Record ID", value: <Box variant="code">{record.id}</Box> },
          { label: "Created", value: formatDateTime(record.created_at) },
          { label: "Last updated", value: formatDateTime(record.updated_at) },
        ]}
      />
    </SpaceBetween>
  );
}
