import { describe, expect, it } from "vitest";
import { AnalysisRunTimer, estimateRemainingMs, formatDuration } from "./performance";

describe("analysis timing", () => {
  it("estimates remaining work from measured throughput", () => {
    expect(estimateRemainingMs(2_000, 20, 100)).toBe(8_000);
    expect(estimateRemainingMs(500, 20, 100)).toBeNull();
    expect(estimateRemainingMs(2_000, 0, 100)).toBeNull();
    expect(estimateRemainingMs(2_000, 100, 100)).toBeNull();
  });

  it("keeps monotonic stage and end-to-end timings", () => {
    let now = 0;
    const timer = new AnalysisRunTimer(() => now);
    timer.update("discover", 0, 1);
    now = 400;
    timer.update("parse", 0, 10);
    now = 2_400;
    const parsing = timer.update("parse", 5, 10);
    expect(parsing.stageElapsedMs).toBe(2_000);
    expect(parsing.estimatedRemainingMs).toBe(2_000);
    now = 2_900;
    expect(timer.markInitialInsights()).toBe(2_900);
    timer.update("model", 0, 100);
    now = 4_900;
    timer.update("embed", 0, 200, {
      device: "webgpu",
      dtype: "fp32",
      batchSize: 128,
    });
    now = 8_900;
    timer.update("cluster", 0, 4);
    now = 9_900;
    const summary = timer.summary(
      "complete",
      { device: "webgpu", dtype: "fp32", batchSize: 128 },
      3_573
    );

    expect(summary.totalMs).toBe(9_900);
    expect(summary.initialInsightsMs).toBe(2_900);
    expect(summary.modelMs).toBe(2_000);
    expect(summary.semanticMs).toBe(5_000);
    expect(summary.semanticCandidateCount).toBe(3_573);
    expect(summary.stages.map((stage) => stage.phase)).toEqual([
      "discover",
      "parse",
      "model",
      "embed",
      "cluster",
    ]);
  });

  it("formats compact user-facing durations", () => {
    expect(formatDuration(null)).toBe("Estimating…");
    expect(formatDuration(450)).toBe("Under 1 sec");
    expect(formatDuration(12_400)).toBe("12s");
    expect(formatDuration(188_000)).toBe("3m 08s");
  });
});
