import { describe, expect, it } from "vitest";
import { LocalMeasurementTrace } from "./measurement-trace";

describe("local completion measurement trace", () => {
  it("keeps import, source-backed insight, failure, recovery, and a concrete bottleneck", () => {
    const trace = new LocalMeasurementTrace();
    trace.startAttempt(0);
    trace.observeStages([
      { phase: "parse", label: "private label", elapsedMs: 4 },
      { phase: "model", label: "private model detail", elapsedMs: 8 },
    ]);
    trace.importCompleted(11);
    trace.failed(14, "model");
    expect(trace.export().bottleneck?.reason).toBe("observed_failure_unresolved");
    trace.startAttempt(20);
    trace.importCompleted(28);
    trace.firstEvidenceBackedInsight(30, 2);

    const result = trace.export();
    expect(result.events.map(({ milestone }) => milestone)).toEqual([
      "import_started",
      "import_completed",
      "failure",
      "import_started",
      "import_completed",
      "first_evidence_backed_insight",
      "recovery",
    ]);
    expect(result.events[1]).toMatchObject({ milestone: "import_completed", elapsedMs: 11 });
    expect(result.events[2]).toMatchObject({
      milestone: "failure",
      stage: "model",
      errorClass: "model_prepare",
      elapsedMs: 14,
    });
    expect(result.events[5]).toMatchObject({
      milestone: "first_evidence_backed_insight",
      sourceBackedItems: 2,
      elapsedMs: 10,
    });
    expect(result.events[6]).toMatchObject({
      milestone: "recovery",
      attempt: 2,
      elapsedMs: 10,
      recoveryDurationMs: 16,
    });
    expect(result.events[6]?.attempt).toBe(result.events[5]?.attempt);
    expect(result.events[6]?.elapsedMs).toBe(result.events[5]?.elapsedMs);
    expect(result.bottleneck).toEqual({
      stage: "model",
      reason: "observed_failure_recovered",
      nextAction:
        "Implement model-preparation retry from the parsed archive without asking for the ZIP again.",
    });
    expect(result.maxObservedStageDurationsMs).toEqual({ parse: 4, model: 8 });
    expect(result.durationScope).toContain("independent of the latest 16 events");
    expect(JSON.stringify(result)).not.toMatch(/private label|private model detail/);
  });

  it("does not emit an insight event without source-backed items", () => {
    const trace = new LocalMeasurementTrace();
    trace.startAttempt(0);
    trace.firstEvidenceBackedInsight(5, 0);
    expect(trace.export().events).toEqual([
      { milestone: "import_started", attempt: 1, elapsedMs: 0 },
    ]);
  });

  it("retains worker-stop failures instead of substituting a completed stage", () => {
    const trace = new LocalMeasurementTrace();
    trace.startAttempt(10);
    trace.observeStages([{ phase: "parse", label: "private stage", elapsedMs: 90 }]);
    trace.failed(40, null);

    const result = trace.export();
    expect(result.events[1]).toMatchObject({
      milestone: "failure",
      stage: "worker",
      errorClass: "worker_stopped",
      elapsedMs: 30,
    });
    expect(result.bottleneck).toEqual({
      stage: "worker",
      reason: "observed_failure_unresolved",
      nextAction: "Implement a clear worker-stop error and retry path.",
    });
  });

  it("caps the trace to the latest bounded milestones", () => {
    const trace = new LocalMeasurementTrace();
    for (let attempt = 1; attempt <= 20; attempt += 1) trace.startAttempt(attempt);
    const result = trace.export();
    expect(result.events).toHaveLength(16);
    expect(result.events.at(-1)).toEqual({
      milestone: "import_started",
      attempt: 20,
      elapsedMs: 0,
    });
  });
});
