import type { DnsRecord, RecordType } from "@/lib/api/types";
import { DEFAULT_TTL, emptyValueRow, VALUE_KEYS, type RecordFormValues, type ValueRow } from "@/lib/validation/dns";

export function newRecordForm(): RecordFormValues {
  return { name: "", type: "A", ttl: String(DEFAULT_TTL), comment: "", values: [emptyValueRow("A")] };
}

/** The relative part of an FQDN in `zone` ("" for the apex), as typed in the name input. */
export function relativeName(fqdn: string, zone: string): string {
  if (fqdn === zone) return "";
  if (fqdn.endsWith(`.${zone}`)) return fqdn.slice(0, -(zone.length + 1));
  return `${fqdn}.`;
}

/** Prefills the form from a stored user record (structured values become strings). */
export function recordToForm(record: DnsRecord, zone: string): RecordFormValues {
  const type = record.record_type as RecordType;
  const values: ValueRow[] = (record.values as unknown as Record<string, unknown>[]).map((value) => {
    const row: ValueRow = {};
    for (const key of VALUE_KEYS[type]) row[key] = String(value[key] ?? "");
    return row;
  });
  return {
    name: relativeName(record.name, zone),
    type,
    ttl: String(record.ttl_seconds),
    comment: record.comment ?? "",
    values: values.length ? values : [emptyValueRow(type)],
  };
}

/** True when a row differs from a fresh row of its type (i.e. the user typed something). */
export function rowHasContent(type: RecordType, row: ValueRow): boolean {
  const empty = emptyValueRow(type);
  return VALUE_KEYS[type].some((key) => (row[key] ?? "").trim() !== (empty[key] ?? "").trim());
}
