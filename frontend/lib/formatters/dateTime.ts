/**
 * Formats an ISO timestamp like "October 9, 2026, 12:34:56 (UTC+05:30)" in the viewer's time
 * zone (or `timeZone` when given). Returns "-" for missing or invalid input.
 */
export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const offset = get("timeZoneName").replace(/^GMT/, "") || "+00:00";
  return `${get("month")} ${get("day")}, ${get("year")}, ${get("hour")}:${get("minute")}:${get("second")} (UTC${offset})`;
}
