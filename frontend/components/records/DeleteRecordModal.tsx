"use client";

import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ConfirmationModal } from "@/components/dialogs/ConfirmationModal";
import { useNotifications } from "@/components/feedback/NotificationsProvider";
import { isApiError, userMessage } from "@/lib/api/errors";
import { deleteRecord } from "@/lib/api/records";
import type { DnsRecord } from "@/lib/api/types";
import { invalidateAfterRecordChange } from "@/lib/hooks/useHostedZones";

import { recordLabel, SYSTEM_RECORD_REASON } from "./recordText";

export interface DeleteRecordModalProps {
  zoneId: string;
  record: DnsRecord | null;
  onDismiss: () => void;
  onDeleted?: (record: DnsRecord) => void;
}

/** Confirms deletion of one record; lists its name, type, and every value. */
export function DeleteRecordModal({ zoneId, record, onDismiss, onDeleted }: DeleteRecordModalProps) {
  const queryClient = useQueryClient();
  const { notify } = useNotifications();
  const mutation = useMutation({
    mutationFn: (target: DnsRecord) => deleteRecord(zoneId, target.id),
    onSuccess: (_result, target) => {
      notify({ type: "success", header: "Success", content: `Record ${recordLabel(target)} deleted.` });
      void invalidateAfterRecordChange(queryClient, zoneId);
      onDeleted?.(target);
      mutation.reset();
      onDismiss();
    },
  });

  const error = mutation.isError
    ? isApiError(mutation.error, "SYSTEM_RECORD_PROTECTED")
      ? SYSTEM_RECORD_REASON
      : userMessage(mutation.error)
    : undefined;

  return (
    <ConfirmationModal
      visible={record !== null}
      header="Delete record"
      confirmLabel="Delete"
      loading={mutation.isPending}
      error={error}
      onConfirm={() => {
        if (record && !mutation.isPending) mutation.mutate(record);
      }}
      onDismiss={() => {
        if (mutation.isPending) return;
        mutation.reset();
        onDismiss();
      }}
    >
      {record ? (
        <SpaceBetween size="xs">
          <span>
            Permanently delete the <strong>{record.record_type}</strong> record <strong>{record.name}</strong>?
            This action can&apos;t be undone.
          </span>
          <Box variant="awsui-key-label">Values</Box>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {record.display_values.map((value, index) => (
              <li key={`${index}-${value}`} style={{ wordBreak: "break-all" }}>
                {value}
              </li>
            ))}
          </ul>
        </SpaceBetween>
      ) : null}
    </ConfirmationModal>
  );
}
