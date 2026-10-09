import { EditHostedZonePage } from "@/components/hosted-zones/EditHostedZoneForm";

export default async function EditHostedZoneRoute({ params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = await params;
  return <EditHostedZonePage zoneId={decodeURIComponent(zoneId)} />;
}
