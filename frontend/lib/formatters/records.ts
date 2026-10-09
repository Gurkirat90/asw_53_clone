/** "192.0.2.10 + 1 more" for multi-value records; "-" when there are no values. */
export function formatRecordValuesSummary(displayValues: readonly string[]): string {
  if (displayValues.length === 0) return "-";
  if (displayValues.length === 1) return displayValues[0];
  return `${displayValues[0]} + ${displayValues.length - 1} more`;
}
