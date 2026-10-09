import { Suspense } from "react";

import { HostedZoneDetailPage } from "@/components/hosted-zones/HostedZoneDetail";

export default async function HostedZonePage({ params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = await params;
  // The records table keeps page/page_size in the URL (useSearchParams), which needs Suspense.
  return (
    <Suspense>
      <HostedZoneDetailPage zoneId={decodeURIComponent(zoneId)} />
    </Suspense>
  );
}
