import { describe, expect, it } from "vitest";
import { activityMonthWindow } from "./period";
import type { DeterministicReport } from "./types";

function source(
  start: string,
  end: string,
  activeMonths: string[]
): Pick<DeterministicReport, "activityByMonth" | "dateRange"> {
  return {
    dateRange: {
      start: Date.parse(`${start}T00:00:00Z`) / 1_000,
      end: Date.parse(`${end}T00:00:00Z`) / 1_000,
    },
    activityByMonth: activeMonths.map((label) => ({ label, value: 1 })),
  };
}

describe("activity month windows", () => {
  it("uses exact calendar months even when some months had no activity", () => {
    expect(
      activityMonthWindow(source("2023-09-10", "2026-07-26", ["2023-09", "2025-11", "2026-07"]), 3)
    ).toEqual(["2026-05", "2026-06", "2026-07"]);
  });

  it("returns every calendar month for all history", () => {
    expect(
      activityMonthWindow(source("2025-11-10", "2026-02-03", ["2025-11", "2026-02"]), null)
    ).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("falls back to stored activity labels when the date range is absent", () => {
    expect(
      activityMonthWindow(
        {
          dateRange: { start: 0, end: 0 },
          activityByMonth: [
            { label: "2026-01", value: 1 },
            { label: "2026-03", value: 1 },
          ],
        },
        2
      )
    ).toEqual(["2026-02", "2026-03"]);
  });
});
