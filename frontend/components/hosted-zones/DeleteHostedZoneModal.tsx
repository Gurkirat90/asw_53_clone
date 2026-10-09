"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ConfirmationModal } from "@/components/dialogs/ConfirmationModal";
import { useNotifications } from "@/components/feedback/NotificationsProvider";
import { deleteZone } from "@/lib/api/hostedZones";
import { userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/api/queryKeys";
import type { HostedZoneSummary } from "@/lib/api/types";

import { pluralize } from "./zoneText";

type ZoneToDelete = Pick<HostedZoneSummary, "zone_id" | "name" | "record_count">;

export interface DeleteHostedZoneModalProps {
  zone: ZoneToDelete | null;
  onDismiss: () => void;
  /** Called after the server confirmed the deletion (e.g. navigate away from the detail page). */
  onDeleted?: (zone: ZoneToDelete) => void;
}

/** Typed-confirmation delete of a hosted zone and all of its records. */
export function DeleteHostedZoneModal({ zone, onDismiss, onDeleted }: DeleteHostedZoneModalProps) {
  const queryClient = useQueryClient();
  const { notify } = useNotifications();
  const mutation = useMutation({
    mutationFn: (target: ZoneToDelete) => deleteZone(target.zone_id),
    onSuccess: (_result, target) => {
      onDeleted?.(target);
      // Mark the deleted zone's cached data stale without refetching it: refetching a mounted
      // detail page would just 404. A later visit refetches and shows the not-found state.
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones.detail(target.zone_id), refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: queryKeys.records.all(target.zone_id), refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: ["zones", "list"] });
      notify({ type: "success", header: "Success", content: `Hosted zone ${target.name} deleted.` });
      mutation.reset();
      onDismiss();
    },
  });

  const close = () => {
    if (mutation.isPending) return;
    mutation.reset();
    onDismiss();
  };

  return (
    <ConfirmationModal
      visible={zone !== null}
      header="Delete hosted zone"
      confirmLabel="Delete"
      requireTypedText="delete"
      loading={mutation.isPending}
      error={mutation.isError ? userMessage(mutation.error) : undefined}
      onConfirm={() => {
        if (zone && !mutation.isPending) mutation.mutate(zone);
      }}
      onDismiss={close}
    >
      {zone ? (
        <>
          Permanently delete hosted zone <strong>{zone.name}</strong> ({zone.zone_id})? This will also
          delete its {pluralize(zone.record_count, "record")}, including the default NS and SOA records.
          This action can&apos;t be undone.
        </>
      ) : null}
    </ConfirmationModal>
  );
}
