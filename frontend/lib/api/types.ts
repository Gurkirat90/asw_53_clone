// Types for the whole Route 53 Clone API contract (see docs/API.md).

export interface UserSummary {
  id: string;
  email: string;
  display_name: string;
}

export type ZoneType = "PUBLIC" | "PRIVATE";

export interface HostedZoneSummary {
  zone_id: string;
  name: string;
  zone_type: ZoneType;
  comment: string | null;
  record_count: number;
  created_at: string;
  updated_at: string;
}

export interface HostedZoneDetail extends HostedZoneSummary {
  name_servers: string[];
}

export const USER_RECORD_TYPES = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"] as const;
export type RecordType = (typeof USER_RECORD_TYPES)[number];
export type SystemRecordType = "SOA";
export type AnyRecordType = RecordType | SystemRecordType;
export type RoutingPolicy = "SIMPLE";

export interface SingleValue {
  value: string;
}
export interface MxValue {
  priority: number;
  exchange: string;
}
export interface SrvValue {
  priority: number;
  weight: number;
  port: number;
  target: string;
}
export type CaaTag = "issue" | "issuewild" | "iodef";
export interface CaaValue {
  flags: number;
  tag: CaaTag;
  value: string;
}
export interface SoaValue {
  mname: string;
  rname: string;
  serial: number;
  refresh: number;
  retry: number;
  expire: number;
  minimum: number;
}

export interface RecordValueByType {
  A: SingleValue;
  AAAA: SingleValue;
  CNAME: SingleValue;
  TXT: SingleValue;
  MX: MxValue;
  NS: SingleValue;
  PTR: SingleValue;
  SRV: SrvValue;
  CAA: CaaValue;
  SOA: SoaValue;
}
export type RecordValue = RecordValueByType[AnyRecordType];

interface DnsRecordBase {
  id: string;
  zone_id: string;
  name: string;
  routing_policy: RoutingPolicy;
  ttl_seconds: number;
  display_values: string[];
  comment: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

/** A record set; `record_type` discriminates the shape of `values`. */
export type DnsRecord = {
  [T in AnyRecordType]: DnsRecordBase & { record_type: T; values: RecordValueByType[T][] };
}[AnyRecordType];

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

export type SortOrder = "asc" | "desc";
export type ZoneSortBy = "name" | "zone_type" | "created_at" | "updated_at";
export type RecordSortBy = "name" | "record_type" | "ttl_seconds" | "updated_at";

interface ListParams<S extends string> {
  q?: string;
  page?: number;
  page_size?: number;
  sort_by?: S;
  sort_order?: SortOrder;
}

export interface ZoneListParams extends ListParams<ZoneSortBy> {
  zone_type?: ZoneType;
}

export interface RecordListParams extends ListParams<RecordSortBy> {
  record_type?: AnyRecordType;
  routing_policy?: RoutingPolicy;
}

export interface ZoneCreateRequest {
  name: string;
  zone_type?: ZoneType;
  comment?: string | null;
}

export interface ZoneUpdateRequest {
  comment: string | null;
}

/** Create payload; `values` must match `record_type`. */
export type RecordCreateRequest = {
  [T in RecordType]: {
    name: string;
    record_type: T;
    routing_policy?: RoutingPolicy;
    ttl_seconds?: number;
    values: RecordValueByType[T][];
    comment?: string | null;
  };
}[RecordType];

/** All fields optional; when record_type changes, values must be supplied. */
export interface RecordUpdateRequest {
  name?: string;
  record_type?: RecordType;
  routing_policy?: RoutingPolicy;
  ttl_seconds?: number;
  values?: RecordValueByType[RecordType][];
  comment?: string | null;
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "AUTHENTICATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RECORD_CONFLICT"
  | "SYSTEM_RECORD_PROTECTED"
  | "INTERNAL_ERROR";

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details: ApiFieldError[];
    request_id: string | null;
  };
}
