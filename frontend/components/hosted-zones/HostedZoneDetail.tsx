"use client";

import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ContentLayout from "@cloudscape-design/components/content-layout";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Tabs from "@cloudscape-design/components/tabs";
import Container from "@cloudscape-design/components/container";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { usePageChrome } from "@/components/console-shell/PageChrome";
import { ErrorState, NotFoundState } from "@/components/feedback/states";
import { RecordsTable, useRecordListState } from "@/components/records/RecordsTable";
import { ApiError } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import type { HostedZoneDetail as Zone } from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters/dateTime";
import { useZone } from "@/lib/hooks/useHostedZones";

import { DeleteHostedZoneModal } from "./DeleteHostedZoneModal";
import { ZONE_TYPE_LABELS, zoneHref } from "./zoneText";

function ComingSoonTab({ feature }: { feature: string }) {
  return (
    <Container>
      <SpaceBetween size="xs">
        <StatusIndicator type="pending">Coming soon</StatusIndicator>
        <Box variant="p">{feature} is not part of this clone.</Box>
      </SpaceBetween>
    </Container>
  );
}

export function HostedZoneDetailPage({ zoneId }: { zoneId: string }) {
  const zone = useZone(zoneId);
  usePageChrome({
    breadcrumbs: [
      { text: "Hosted zones", href: "/hosted-zones" },
      { text: zone.data?.name ?? zoneId, href: zoneHref(zoneId) },
    ],
    contentType: "default",
  });

  // A 404 wins over cached data (the zone may have been deleted since it was cached).
  if (zone.error instanceof ApiError && zone.error.status === 404) {
    return <NotFoundState resourceName="Hosted zone" backHref="/hosted-zones" backText="Back to hosted zones" />;
  }
  if (zone.data) return <HostedZoneDetailContent zone={zone.data} />;
  if (zone.isError) {
    return (
      <ErrorState title="Unable to load the hosted zone" message={userMessage(zone.error)} onRetry={() => void zone.refetch()} />
    );
  }
  return (
    <Box textAlign="center" padding="xxl">
      <Spinner size="large" />
    </Box>
  );
}

function HostedZoneDetailContent({ zone }: { zone: Zone }) {
  const router = useRouter();
  const records = useRecordListState();
  const [activeTab, setActiveTab] = useState("records");
  const [deleting, setDeleting] = useState(false);

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setDeleting(true)}>Delete zone</Button>
              <Button onClick={() => router.push(`${zoneHref(zone.zone_id)}/edit`)}>Edit hosted zone</Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween direction="horizontal" size="xs" alignItems="center">
            <span>{zone.name}</span>
            <Badge color={zone.zone_type === "PUBLIC" ? "blue" : "grey"}>{ZONE_TYPE_LABELS[zone.zone_type]}</Badge>
          </SpaceBetween>
        </Header>
      }
    >
      <SpaceBetween size="l">
        <ExpandableSection variant="container" defaultExpanded headerText="Hosted zone details">
          <div data-testid="zone-details">
          <KeyValuePairs
            columns={3}
            items={[
              { label: "Hosted zone name", value: zone.name },
              { label: "Hosted zone ID", value: zone.zone_id },
              { label: "Description", value: zone.comment ?? "-" },
              { label: "Type", value: `${ZONE_TYPE_LABELS[zone.zone_type]} hosted zone` },
              { label: "Record count", value: String(zone.record_count) },
              { label: "Created", value: formatDateTime(zone.created_at) },
              { label: "Last updated", value: formatDateTime(zone.updated_at) },
              {
                label: "Name servers",
                value: (
                  <SpaceBetween size="xxxs">
                    {zone.name_servers.map((server) => (
                      <Box key={server} variant="code">
                        {server}
                      </Box>
                    ))}
                    <Box variant="small" color="text-body-secondary">
                      Synthetic values for this simulation; not delegated or publicly resolvable.
                    </Box>
                  </SpaceBetween>
                ),
              },
            ]}
          />
          </div>
        </ExpandableSection>
        <Tabs
          activeTabId={activeTab}
          onChange={({ detail }) => setActiveTab(detail.activeTabId)}
          ariaLabel="Hosted zone sections"
          tabs={[
            {
              id: "records",
              label: `Records (${zone.record_count})`,
              content: <RecordsTable zoneId={zone.zone_id} listState={records} />,
            },
            { id: "dnssec", label: "DNSSEC signing", content: <ComingSoonTab feature="DNSSEC signing" /> },
            { id: "tags", label: "Hosted zone tags", content: <ComingSoonTab feature="Hosted zone tag management" /> },
          ]}
        />
      </SpaceBetween>
      <DeleteHostedZoneModal
        zone={deleting ? zone : null}
        onDismiss={() => setDeleting(false)}
        onDeleted={() => router.push("/hosted-zones")}
      />
    </ContentLayout>
  );
}
