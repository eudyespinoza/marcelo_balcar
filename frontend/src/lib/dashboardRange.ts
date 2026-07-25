import { argentinaDateKey } from "./format";

export type DashboardRangePreset = "week" | "month" | "year" | "custom";
export interface DashboardRange { start: string; end: string }

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function dashboardPresetRange(preset: Exclude<DashboardRangePreset, "custom">, today = argentinaDateKey()): DashboardRange {
  const start = dateFromKey(today);
  if (preset === "week") start.setUTCDate(start.getUTCDate() - 6);
  if (preset === "month") start.setUTCDate(start.getUTCDate() - 29);
  if (preset === "year") {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    start.setUTCDate(start.getUTCDate() + 1);
  }
  return { start: dateKey(start), end: today };
}
