import { apiRequest } from "./client";
import type {
  DnsRecord,
  Page,
  RecordCreateRequest,
  RecordListParams,
  RecordUpdateRequest,
} from "./types";

const recordsPath = (zoneId: string) => `/hosted-zones/${encodeURIComponent(zoneId)}/records`;
const recordPath = (zoneId: string, recordId: string) =>
  `${recordsPath(zoneId)}/${encodeURIComponent(recordId)}`;

export function listRecords(zoneId: string, params: RecordListParams = {}, signal?: AbortSignal) {
  return apiRequest<Page<DnsRecord>>(recordsPath(zoneId), { query: params, signal });
}

export function getRecord(zoneId: string, recordId: string, signal?: AbortSignal) {
  return apiRequest<DnsRecord>(recordPath(zoneId, recordId), { signal });
}

export function createRecord(zoneId: string, body: RecordCreateRequest) {
  return apiRequest<DnsRecord>(recordsPath(zoneId), { method: "POST", body });
}

export function updateRecord(zoneId: string, recordId: string, body: RecordUpdateRequest) {
  return apiRequest<DnsRecord>(recordPath(zoneId, recordId), { method: "PATCH", body });
}

export function deleteRecord(zoneId: string, recordId: string) {
  return apiRequest<void>(recordPath(zoneId, recordId), { method: "DELETE" });
}
