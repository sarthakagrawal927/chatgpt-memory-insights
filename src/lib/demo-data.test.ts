import { describe, expect, it } from "vitest";
import { createDemoData, demoReport, demoTopics, parseDemoData } from "./demo-data";
import { normalizeConversation } from "./export";
import { buildDeterministicReport } from "./insights";

function fixture() {
  return [
    {
      id: "private-id-a",
      title: "Private customer Alice",
      date: 1_735_689_600.25,
      prompts: ["Explain Python code for Alice at https://private.invalid", "Plan a job interview"],
    },
    {
      id: "private-id-b",
      title: "Private customer Bob",
      date: 1_738_368_000.5,
      prompts: ["Calculate a portfolio ratio", "Thank you, I appreciate this"],
    },
    {
      id: "private-id-c",
      title: "Private health record",
      date: 1_738_454_400,
      prompts: ["Plan a protein diet and explain nutrition"],
    },
  ].map(
    ({ id, title, date, prompts }) =>
      normalizeConversation({
        id,
        title,
        create_time: date,
        default_model_slug: "Private Model Name",
        mapping: Object.fromEntries(
          prompts.map((text, index) => [
            String(index),
            {
              message: {
                id: `${id}-${index}`,
                author: { role: "user" },
                create_time: date,
                content: { parts: [text] },
              },
            },
          ])
        ),
      })!
  );
}

describe("privacy-safe demo data", () => {
  it("publishes only day precision for the archive date range", () => {
    const data = createDemoData(fixture());
    expect(data.dateRange.start % 86400).toBe(0);
    expect(data.dateRange.end % 86400).toBe(0);
    const value = JSON.parse(JSON.stringify(data));
    value.dateRange.start += 0.25;
    expect(() => parseDemoData(value)).toThrow();
  });

  it("retains the real activity aggregates and strips every arbitrary text field", () => {
    const conversations = fixture();
    const expected = buildDeterministicReport(conversations).report;
    const data = createDemoData(conversations, 1_800_000_000_000);
    const serialized = JSON.stringify(data);
    expect(data.totals).toEqual(expected.totals);
    expect(data.dateRange).toEqual({
      start: Math.floor(expected.dateRange.start / 86400) * 86400,
      end: Math.floor(expected.dateRange.end / 86400) * 86400,
    });
    expect(data.depth).toEqual(expected.depth);
    expect(serialized).not.toMatch(
      /Alice|Bob|private|customer|portfolio|protein|interview|Python|Model|https|title|conversationId|sources|"prompts"/i
    );
    expect(parseDemoData(JSON.parse(serialized))).toEqual(data);
    expect(demoReport(data).deterministic.activityByMonth).toEqual(expected.activityByMonth);
    expect(demoReport(data).deterministic.activityByWeekday).toEqual(expected.activityByWeekday);
    expect(demoReport(data).deterministic.tone).toEqual(expected.tone);
    expect(demoReport(data).deterministic.emotions.counts).toEqual(expected.emotions.counts);
    expect(demoReport(data).deterministic.activityRhythms).toEqual(expected.activityRhythms);
  });

  it("uses real category overlap and never presents it as an embedding result", () => {
    const data = createDemoData(fixture());
    expect(data.overlaps).toContainEqual({ source: "learning", target: "software", count: 1 });
    expect(data.overlaps).toContainEqual({ source: "health", target: "planning", count: 1 });
    expect(
      demoTopics(data).edges.find(
        ({ source, target }) => source === "learning" && target === "software"
      )?.similarity
    ).toBe(1);
    const report = demoReport(data);
    expect(report.semantic).toBeNull();
    expect(report.demo.graphMethod).toBe("question-domain-cooccurrence");
    expect(
      report.demo.topics.every(({ sources, terms }) => sources.length === 0 && terms.length === 0)
    ).toBe(true);
    expect(report.deterministic.exactRepeats).toEqual([]);
    expect(report.deterministic.recurringTerms).toEqual([]);
    expect(report.reflections).toEqual([]);
  });

  it("accepts empty archives without fabricating activity", () => {
    const data = createDemoData([]);
    expect(data.totals.conversations).toBe(0);
    expect(demoTopics(data)).toEqual({ topics: [], edges: [] });
    expect(demoReport(data).deterministic.activityByDay).toEqual([]);
  });

  it.each([
    (value: Record<string, unknown>) => {
      value.title = "private title";
    },
    (value: Record<string, unknown>) => {
      (value.totals as Record<string, unknown>).conversations = 999;
    },
    (value: Record<string, unknown>) => {
      (value.totals as Record<string, unknown>).privateText = "secret";
    },
    (value: Record<string, unknown>) => {
      (value.lenses as Array<Record<string, unknown>>)[0].id = "secret";
    },
    (value: Record<string, unknown>) => {
      (value.days as unknown[][])[0][0] = "https://secret.invalid";
    },
    (value: Record<string, unknown>) => {
      value.weekdays = [0, 0, 0, 0, 0, 0, -1];
    },
    (value: Record<string, unknown>) => {
      value.version = 2;
    },
    (value: Record<string, unknown>) => {
      const days = value.days as unknown[][];
      days.push(days[0]);
    },
    (value: Record<string, unknown>) => {
      const lenses = value.lenses as unknown[];
      lenses[1] = lenses[0];
    },
    (value: Record<string, unknown>) => {
      (value.depth as Record<string, unknown>).medianMessages = "secret";
    },
    (value: Record<string, unknown>) => {
      value.overlaps = [{ source: "health", target: "software", count: 999 }];
    },
  ])("rejects unexpected fields, private strings and inconsistent counts %#", (mutate) => {
    const value = JSON.parse(JSON.stringify(createDemoData(fixture()))) as Record<string, unknown>;
    mutate(value);
    expect(() => parseDemoData(value)).toThrow();
  });
});
