import type { DnsRecord, RecordType } from "@/lib/api/types";

export const SYSTEM_RECORD_REASON =
  "Default NS and SOA records are managed by the hosted zone and can't be edited or deleted.";

export const RECORD_TYPE_DESCRIPTIONS: Record<RecordType, string> = {
  A: "Routes traffic to an IPv4 address",
  AAAA: "Routes traffic to an IPv6 address",
  CAA: "Restricts CAs that can create SSL/TLS certificates for the domain",
  CNAME: "Routes traffic to another domain name",
  MX: "Specifies mail servers",
  NS: "Name servers for a hosted zone",
  PTR: "Maps an IP address to a domain name",
  SRV: "Application-specific values that identify servers",
  TXT: "Used to verify email senders and for application-specific values",
};

/** Route 53 lists record types alphabetically. */
export const RECORD_TYPE_ORDER: RecordType[] = ["A", "AAAA", "CAA", "CNAME", "MX", "NS", "PTR", "SRV", "TXT"];

export const recordLabel = (record: Pick<DnsRecord, "name" | "record_type">) => `${record.name} (${record.record_type})`;

export const recordEditHref = (zoneId: string, recordId: string) =>
  `/hosted-zones/${encodeURIComponent(zoneId)}/records/${encodeURIComponent(recordId)}/edit`;
export const recordCreateHref = (zoneId: string) => `/hosted-zones/${encodeURIComponent(zoneId)}/records/new`;
