import type { RecordListParams, ZoneListParams } from "./types";

export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  zones: {
    all: ["zones"] as const,
    list: (params: ZoneListParams) => ["zones", "list", params] as const,
    detail: (zoneId: string) => ["zones", "detail", zoneId] as const,
  },
  records: {
    all: (zoneId: string) => ["records", zoneId] as const,
    list: (zoneId: string, params: RecordListParams) => ["records", zoneId, "list", params] as const,
    detail: (zoneId: string, recordId: string) => ["records", zoneId, "detail", recordId] as const,
  },
};
