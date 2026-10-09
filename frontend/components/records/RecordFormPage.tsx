"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";

import { usePageChrome } from "@/components/console-shell/PageChrome";
import { ErrorState, NotFoundState } from "@/components/feedback/states";
import { zoneHref } from "@/components/hosted-zones/zoneText";
import { ApiError } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import type { HostedZoneDetail } from "@/lib/api/types";
import { useFollowHandler } from "@/lib/hooks/useFollowHandler";
import { useRecord, useZone } from "@/lib/hooks/useHostedZones";

import { RecordForm } from "./RecordForm";
import { newRecordForm, recordToForm } from "./recordFormValues";
import { recordCreateHref, recordEditHref, SYSTEM_RECORD_REASON } from "./recordText";

function Loading() {
  return (
    <Box textAlign="center" padding="xxl">
      <Spinner size="large" />
    </Box>
  );
}

const is404 = (error: unknown) => error instanceof ApiError && error.status === 404;

/** /hosted-zones/[zoneId]/records/new and /records/[recordId]/edit. */
export function RecordFormPage({ zoneId, recordId }: { zoneId: string; recordId?: string }) {
  const zone = useZone(zoneId);
  usePageChrome({
    breadcrumbs: [
      { text: "Hosted zones", href: "/hosted-zones" },
      { text: zone.data?.name ?? zoneId, href: zoneHref(zoneId) },
      recordId
        ? { text: "Edit record", href: recordEditHref(zoneId, recordId) }
        : { text: "Create record", href: recordCreateHref(zoneId) },
    ],
    contentType: "form",
  });

  if (is404(zone.error)) {
    return <NotFoundState resourceName="Hosted zone" backHref="/hosted-zones" backText="Back to hosted zones" />;
  }
  if (zone.isError) {
    return <ErrorState title="Unable to load the hosted zone" message={userMessage(zone.error)} onRetry={() => void zone.refetch()} />;
  }
  if (!zone.data) return <Loading />;
  if (!recordId) return <RecordForm zoneId={zoneId} zoneName={zone.data.name} initial={newRecordForm()} />;
  return <EditRecordLoader zone={zone.data} recordId={recordId} />;
}

function EditRecordLoader({ zone, recordId }: { zone: HostedZoneDetail; recordId: string }) {
  const record = useRecord(zone.zone_id, recordId);
  const onFollow = useFollowHandler();
  if (is404(record.error)) {
    return <NotFoundState resourceName="Record" backHref={zoneHref(zone.zone_id)} backText={`Back to ${zone.name}`} />;
  }
  if (record.isError) {
    return <ErrorState title="Unable to load the record" message={userMessage(record.error)} onRetry={() => void record.refetch()} />;
  }
  if (!record.data) return <Loading />;
  if (record.data.is_system) {
    return (
      <SpaceBetween size="m">
        <Alert type="info" header="This record can't be edited" statusIconAriaLabel="Info">
          {SYSTEM_RECORD_REASON}
        </Alert>
        <Link href={zoneHref(zone.zone_id)} onFollow={onFollow}>
          Back to {zone.name}
        </Link>
      </SpaceBetween>
    );
  }
  return (
    <RecordForm
      key={`${record.data.id}-${record.data.updated_at}`}
      zoneId={zone.zone_id}
      zoneName={zone.name}
      initial={recordToForm(record.data, zone.name)}
      record={record.data}
    />
  );
}
