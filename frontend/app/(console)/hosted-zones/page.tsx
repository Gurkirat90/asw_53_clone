import { Suspense } from "react";

import { HostedZonesTable } from "@/components/hosted-zones/HostedZonesTable";

export default function HostedZonesPage() {
  // List state lives in the URL (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense>
      <HostedZonesTable />
    </Suspense>
  );
}
