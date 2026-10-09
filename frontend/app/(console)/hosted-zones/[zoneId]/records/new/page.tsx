import { RecordFormPage } from "@/components/records/RecordFormPage";

export default async function CreateRecordRoute({ params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = await params;
  return <RecordFormPage zoneId={decodeURIComponent(zoneId)} />;
}
