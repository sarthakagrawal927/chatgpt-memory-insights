import type { DeterministicReport } from "./types";

type PeriodSource = Pick<DeterministicReport, "activityByMonth" | "dateRange">;

function timestampMonth(timestamp: number): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp * 1_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 7);
}

function parseMonth(label: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(label)) return null;
  const date = new Date(`${label}-01T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function activityMonthWindow(source: PeriodSource, periodMonths: number | null): string[] {
  const activityLabels = source.activityByMonth
    .map((datum) => datum.label)
    .filter((label) => /^\d{4}-\d{2}$/.test(label))
    .sort();
  const endLabel = timestampMonth(source.dateRange.end) ?? activityLabels.at(-1);
  const startLabel = timestampMonth(source.dateRange.start) ?? activityLabels[0];
  const end = endLabel ? parseMonth(endLabel) : null;
  if (!end) return [];
  const start =
    periodMonths === null
      ? startLabel
        ? parseMonth(startLabel)
        : null
      : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - periodMonths + 1, 1));
  if (!start) return [];

  const months: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}
