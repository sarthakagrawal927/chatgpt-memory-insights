import type { AnalysisPhase, AnalysisStageTiming } from "./types";

const MAX_EVENTS = 16;

type MeasurementFailureClass =
  | "archive_read"
  | "model_prepare"
  | "semantic_mapping"
  | "report_assembly"
  | "worker_stopped"
  | "unknown_stage";

type MeasurementMilestone =
  | "import_started"
  | "import_completed"
  | "first_evidence_backed_insight"
  | "failure"
  | "recovery";
type MeasurementStage = AnalysisPhase | "worker";

export type MeasurementEvent = {
  milestone: MeasurementMilestone;
  attempt: number;
  elapsedMs: number;
  stage?: MeasurementStage;
  errorClass?: MeasurementFailureClass;
  recoveryDurationMs?: number;
  sourceBackedItems?: number;
};

export type MeasurementTraceExport = {
  schemaVersion: 1;
  privacy: "tab-local; no archive content, derived text, facts, queries, file names, or identifiers";
  durationScope: "maximum per phase across this tab's attempts; independent of the latest 16 events";
  events: MeasurementEvent[];
  maxObservedStageDurationsMs: Partial<Record<AnalysisPhase, number>>;
  bottleneck: {
    stage: MeasurementStage;
    reason:
      | "observed_failure_recovered"
      | "observed_failure_unresolved"
      | "longest_completed_stage";
    nextAction: string;
  } | null;
};

const PHASES: AnalysisPhase[] = ["discover", "parse", "statistics", "model", "embed", "cluster"];

function failureClassForStage(stage: AnalysisPhase | null): MeasurementFailureClass {
  switch (stage) {
    case "discover":
    case "parse":
      return "archive_read";
    case "statistics":
      return "report_assembly";
    case "model":
      return "model_prepare";
    case "embed":
      return "semantic_mapping";
    case "cluster":
      return "report_assembly";
    case null:
      return "worker_stopped";
    default: {
      const exhaustive: never = stage;
      return exhaustive;
    }
  }
}

function nextActionForStage(stage: MeasurementStage): string {
  switch (stage) {
    case "discover":
    case "parse":
      return "Improve the archive-read recovery message before asking for another ZIP.";
    case "statistics":
      return "Keep import progress visible until the first statistics report is ready.";
    case "model":
      return "Implement model-preparation retry from the parsed archive without asking for the ZIP again.";
    case "embed":
    case "cluster":
      return "Implement semantic-mapping retry from the parsed archive without repeating import.";
    case "worker":
      return "Implement a clear worker-stop error and retry path.";
    default: {
      const exhaustive: never = stage;
      return exhaustive;
    }
  }
}

function boundedDuration(value: number): number {
  return Math.max(0, Math.min(24 * 60 * 60 * 1000, Math.round(value)));
}

export class LocalMeasurementTrace {
  private readonly events: MeasurementEvent[] = [];
  private readonly stageDurationsMs: Partial<Record<AnalysisPhase, number>> = {};
  private attempt = 0;
  private attemptStartedAt: number | null = null;
  private lastFailureAt: number | null = null;
  private lastFailureStage: MeasurementStage | null = null;
  private recoveredFailure = false;
  private importedThisAttempt = false;
  private insightThisAttempt = false;

  startAttempt(now: number): void {
    this.attempt += 1;
    this.attemptStartedAt = now;
    this.importedThisAttempt = false;
    this.insightThisAttempt = false;
    this.push({ milestone: "import_started", attempt: this.attempt, elapsedMs: 0 });
  }

  observeStages(stages: AnalysisStageTiming[]): void {
    for (const stage of stages) {
      const duration = boundedDuration(stage.elapsedMs);
      this.stageDurationsMs[stage.phase] = Math.max(
        this.stageDurationsMs[stage.phase] ?? 0,
        duration
      );
    }
  }

  importCompleted(now: number): void {
    if (this.attemptStartedAt === null || this.importedThisAttempt) return;
    this.importedThisAttempt = true;
    this.push({
      milestone: "import_completed",
      attempt: this.attempt,
      elapsedMs: boundedDuration(now - this.attemptStartedAt),
    });
  }

  firstEvidenceBackedInsight(now: number, sourceBackedItems: number): void {
    if (this.attemptStartedAt === null || this.insightThisAttempt || sourceBackedItems < 1) return;
    this.insightThisAttempt = true;
    const elapsedMs = boundedDuration(now - this.attemptStartedAt);
    this.push({
      milestone: "first_evidence_backed_insight",
      attempt: this.attempt,
      elapsedMs,
      sourceBackedItems: Math.max(1, Math.min(100_000, Math.floor(sourceBackedItems))),
    });
    if (this.lastFailureAt !== null && this.attemptStartedAt > this.lastFailureAt) {
      this.push({
        milestone: "recovery",
        attempt: this.attempt,
        elapsedMs,
        recoveryDurationMs: boundedDuration(now - this.lastFailureAt),
      });
      this.lastFailureAt = null;
      this.recoveredFailure = true;
    }
  }

  failed(now: number, stage: AnalysisPhase | null): void {
    if (this.attemptStartedAt === null) return;
    this.lastFailureAt = now;
    this.lastFailureStage = stage ?? "worker";
    this.recoveredFailure = false;
    this.push({
      milestone: "failure",
      attempt: this.attempt,
      elapsedMs: boundedDuration(now - this.attemptStartedAt),
      stage: this.lastFailureStage,
      errorClass: failureClassForStage(stage),
    });
  }

  hasEvents(): boolean {
    return this.events.length > 0;
  }

  export(): MeasurementTraceExport {
    const failedStage = this.lastFailureStage;
    const longestStage = PHASES.reduce<AnalysisPhase | null>((longest, phase) => {
      if (this.stageDurationsMs[phase] === undefined) return longest;
      if (longest === null) return phase;
      return (this.stageDurationsMs[phase] ?? 0) > (this.stageDurationsMs[longest] ?? 0)
        ? phase
        : longest;
    }, null);
    const bottleneckStage = failedStage ?? longestStage;

    return {
      schemaVersion: 1,
      privacy:
        "tab-local; no archive content, derived text, facts, queries, file names, or identifiers",
      durationScope:
        "maximum per phase across this tab's attempts; independent of the latest 16 events",
      events: this.events.map((event) => ({ ...event })),
      maxObservedStageDurationsMs: { ...this.stageDurationsMs },
      bottleneck: bottleneckStage
        ? {
            stage: bottleneckStage,
            reason: failedStage
              ? this.recoveredFailure
                ? "observed_failure_recovered"
                : "observed_failure_unresolved"
              : "longest_completed_stage",
            nextAction: nextActionForStage(bottleneckStage),
          }
        : null,
    };
  }

  private push(event: MeasurementEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }
}
