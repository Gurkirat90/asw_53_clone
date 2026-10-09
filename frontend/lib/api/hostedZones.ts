import { apiRequest } from "./client";
import type {
  HostedZoneDetail,
  HostedZoneSummary,
  Page,
  ZoneCreateRequest,
  ZoneListParams,
  ZoneUpdateRequest,
} from "./types";

const zonePath = (zoneId: string) => `/hosted-zones/${encodeURIComponent(zoneId)}`;

export function listZones(params: ZoneListParams = {}, signal?: AbortSignal) {
  return apiRequest<Page<HostedZoneSummary>>("/hosted-zones", { query: params, signal });
}

export function getZone(zoneId: string, signal?: AbortSignal) {
  return apiRequest<HostedZoneDetail>(zonePath(zoneId), { signal });
}

export function createZone(body: ZoneCreateRequest) {
  return apiRequest<HostedZoneDetail>("/hosted-zones", { method: "POST", body });
}

export function updateZone(zoneId: string, body: ZoneUpdateRequest) {
  return apiRequest<HostedZoneDetail>(zonePath(zoneId), { method: "PATCH", body });
}

export function deleteZone(zoneId: string) {
  return apiRequest<void>(zonePath(zoneId), { method: "DELETE" });
}
