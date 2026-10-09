import type { ZoneType } from "@/lib/api/types";

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = { PUBLIC: "Public", PRIVATE: "Private" };

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export const zoneHref = (zoneId: string) => `/hosted-zones/${encodeURIComponent(zoneId)}`;
