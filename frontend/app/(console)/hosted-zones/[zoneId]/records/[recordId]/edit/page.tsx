import { RecordFormPage } from "@/components/records/RecordFormPage";

export default async function EditRecordRoute({
  params,
}: {
  params: Promise<{ zoneId: string; recordId: string }>;
}) {
  const { zoneId, recordId } = await params;
  return <RecordFormPage zoneId={decodeURIComponent(zoneId)} recordId={decodeURIComponent(recordId)} />;
}
