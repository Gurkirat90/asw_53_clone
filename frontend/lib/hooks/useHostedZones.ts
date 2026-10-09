"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getZone, listZones } from "@/lib/api/hostedZones";
import { queryKeys } from "@/lib/api/queryKeys";
import { listRecords } from "@/lib/api/records";
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
