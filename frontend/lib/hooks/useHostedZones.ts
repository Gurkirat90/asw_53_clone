"use client";

import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";

import { getZone, listZones } from "@/lib/api/hostedZones";
import { queryKeys } from "@/lib/api/queryKeys";
import { getRecord, listRecords } from "@/lib/api/records";
import type { RecordListParams, ZoneListParams } from "@/lib/api/types";

/** Zones page; keeps the previous page visible while the next loads (keys include every param). */
export function useZonesList(params: ZoneListParams) {
  return useQuery({
    queryKey: queryKeys.zones.list(params),
    queryFn: ({ signal }) => listZones(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useZone(zoneId: string) {
  return useQuery({
    queryKey: queryKeys.zones.detail(zoneId),
    queryFn: ({ signal }) => getZone(zoneId, signal),
  });
}

export function useRecordsList(zoneId: string, params: RecordListParams) {
  return useQuery({
    queryKey: queryKeys.records.list(zoneId, params),
    queryFn: ({ signal }) => listRecords(zoneId, params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useRecord(zoneId: string, recordId: string) {
  return useQuery({
    queryKey: queryKeys.records.detail(zoneId, recordId),
    queryFn: ({ signal }) => getRecord(zoneId, recordId, signal),
  });
}

/** After any record mutation: the records list, the zone detail (record_count), and zone lists. */
export function invalidateAfterRecordChange(queryClient: QueryClient, zoneId: string): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.records.all(zoneId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.zones.detail(zoneId) }),
    queryClient.invalidateQueries({ queryKey: ["zones", "list"] }),
  ]);
}
