import { describe, expect, it } from "vitest";
import { buildEfficiencyReport, parseEfficiency } from "./efficiency";
import type { EfficiencySession } from "./types";

function raw(id: string, turns: number, cacheRead: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    source: "claude-code",
    started_at: 1000,
    turns,
    tokens: { input: 0, output: 100, cache_read: cacheRead, cache_write: 0, reasoning: 0 },
    tool_calls: 10,
    repeated_calls: 0,
    failed_calls: 0,
    tool_result_bytes: 1000,
    whole_file_reads: 0,
    top_tools: [["Bash", 8]],
    top_commands: [["grep", 5]],
    ...extra,
  };
}

describe("parseEfficiency", () => {
  it("reads the archive record", () => {
    const sessions = parseEfficiency({ sessions: [raw("claude-a", 10, 5000)] });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokens.cacheRead).toBe(5000);
    expect(sessions[0].topCommands).toEqual([["grep", 5]]);
  });

  it("survives an archive without the record", () => {
    expect(parseEfficiency(undefined)).toEqual([]);
    expect(parseEfficiency({})).toEqual([]);
    expect(parseEfficiency({ sessions: "nope" })).toEqual([]);
    expect(parseEfficiency({ sessions: [null, 5, { source: "x" }] })).toEqual([]);
  });

  it("defaults missing numbers rather than producing NaN", () => {
    const [session] = parseEfficiency({ sessions: [{ id: "a" }] });
    expect(session.turns).toBe(0);
    expect(session.tokens.cacheRead).toBe(0);
    expect(Number.isNaN(session.toolResultBytes)).toBe(false);
  });
});

describe("buildEfficiencyReport", () => {
  it("returns nothing when no session was measured", () => {
    expect(buildEfficiencyReport([])).toBeNull();
    const unmeasured = parseEfficiency({ sessions: [raw("a", 0, 0, { tool_calls: 0 })] });
    expect(buildEfficiencyReport(unmeasured)).toBeNull();
  });

  it("shows cost per turn rising with session length", () => {
    const sessions = parseEfficiency({
      sessions: [
        raw("short-1", 10, 50_000),
        raw("short-2", 10, 50_000),
        raw("long-1", 500, 150_000_000),
      ],
    });
    const report = buildEfficiencyReport(sessions);
    if (!report) throw new Error("expected a report");

    expect(report.scaling[0].label).toBe("Under 25 turns");
    expect(report.scaling.at(-1)?.label).toBe("250 turns and up");
    expect(report.scaling.at(-1)!.tokensPerTurn).toBeGreaterThan(report.scaling[0].tokensPerTurn);

    const scaling = report.findings.find((f) => f.id === "session-length");
    expect(scaling?.severity).toBe("high");
    expect(scaling?.issue).toMatch(/costs \d+× a turn/);
    expect(scaling?.action).toMatch(/End a session/);
  });

  it("says nothing about concentration on a small archive", () => {
    const few = parseEfficiency({
      sessions: [raw("a", 12, 400_000), raw("b", 9, 300_000), raw("c", 15, 500_000)],
    });
    const report = buildEfficiencyReport(few);
    expect(report?.findings.some((f) => f.id === "concentration")).toBe(false);
    // Totals and the curve are still worth showing.
    expect(report?.totals.sessions).toBe(3);
    expect(report?.costliest.length).toBe(3);
  });

  it('counts sessions in prose without saying "1 sessions"', () => {
    const sessions = parseEfficiency({
      sessions: [
        raw("whale", 900, 9_000_000_000),
        ...Array.from({ length: 24 }, (_, index) => raw(`s${index}`, 10, 1000)),
      ],
    });
    const found = buildEfficiencyReport(sessions)?.findings.find((f) => f.id === "concentration");
    expect(found?.issue).toContain("2 sessions");
    expect(found?.issue).not.toMatch(/\b1 sessions\b/);
  });

  it("reports concentration only when it is real", () => {
    const even = parseEfficiency({
      sessions: Array.from({ length: 25 }, (_, index) => raw(`s${index}`, 10, 1000)),
    });
    expect(buildEfficiencyReport(even)?.findings.some((f) => f.id === "concentration")).toBe(false);

    const skewed = parseEfficiency({
      sessions: [
        raw("whale", 900, 9_000_000_000),
        ...Array.from({ length: 24 }, (_, index) => raw(`s${index}`, 10, 1000)),
      ],
    });
    const report = buildEfficiencyReport(skewed);
    const found = report?.findings.find((f) => f.id === "concentration");
    expect(found?.severity).toBe("high");
    expect(report?.costliest[0].id).toBe("whale");
    expect(report?.concentration[0].label).toBe("Top 1%");
  });

  it("raises waste findings past their thresholds and not before", () => {
    const clean = parseEfficiency({ sessions: [raw("a", 10, 1000)] });
    const quiet = buildEfficiencyReport(clean);
    expect(quiet?.findings.some((f) => ["repeated-calls", "failed-calls"].includes(f.id))).toBe(
      false
    );

    const noisy = parseEfficiency({
      sessions: [
        raw("a", 10, 1000, {
          tool_calls: 1000,
          repeated_calls: 200,
          failed_calls: 90,
          whole_file_reads: 60,
        }),
      ],
    });
    const report = buildEfficiencyReport(noisy);
    const ids = report?.findings.map((f) => f.id) ?? [];
    expect(ids).toContain("repeated-calls");
    expect(ids).toContain("failed-calls");
    expect(ids).toContain("whole-file-reads");
    // Severity ordering puts the worst first.
    expect(report?.findings[0].severity).toBe("high");
  });

  it("gives every finding an issue and an action", () => {
    const sessions = parseEfficiency({
      sessions: [
        raw("long", 600, 400_000_000, {
          tool_calls: 900,
          repeated_calls: 120,
          failed_calls: 40,
          whole_file_reads: 40,
        }),
        raw("short", 8, 20_000),
      ],
    });
    const report = buildEfficiencyReport(sessions);
    expect(report?.findings.length).toBeGreaterThan(2);
    for (const found of report?.findings ?? []) {
      expect(found.issue.length).toBeGreaterThan(10);
      expect(found.action.length).toBeGreaterThan(10);
      expect(found.evidence.length).toBeGreaterThan(5);
    }
  });

  it("ignores sessions with no token record when scaling", () => {
    const sessions = parseEfficiency({
      sessions: [
        raw("measured", 10, 500_000),
        // Same band, but nothing was recorded for it.
        raw("unmeasured", 10, 0, { tokens: { cache_read: 0, input: 0, output: 0 } }),
      ],
    });
    const report = buildEfficiencyReport(sessions);
    const band = report?.scaling.find((b) => b.label === "Under 25 turns");
    expect(band?.sessions).toBe(1);
    expect(band?.tokensPerTurn).toBe(50_000);
  });

  it("states large numbers in compact units", () => {
    const sessions = parseEfficiency({
      sessions: [
        raw("whale", 900, 9_000_000_000, {
          tool_result_bytes: 4_300_000_000,
          whole_file_reads: 99,
        }),
        ...Array.from({ length: 19 }, (_, index) => raw(`s${index}`, 10, 1000)),
      ],
    });
    const report = buildEfficiencyReport(sessions);
    const evidence = (report?.findings ?? []).map((f) => f.evidence).join(" ");
    expect(evidence).toMatch(/\d+(\.\d)?B tokens/);
    expect(evidence).toMatch(/4\.3GB/);
    expect(evidence).not.toMatch(/\d{4,}M/);
  });

  it("aggregates commands across sessions", () => {
    const sessions: EfficiencySession[] = parseEfficiency({
      sessions: [
        raw("a", 10, 1000, {
          top_commands: [
            ["grep", 5],
            ["cat", 2],
          ],
        }),
        raw("b", 10, 1000, { top_commands: [["grep", 3]] }),
      ],
    });
    expect(buildEfficiencyReport(sessions)?.commands[0]).toEqual(["grep", 8]);
  });
});
