import type {
  AnalysisPerformance,
  AnalysisPhase,
  AnalysisProgressTiming,
  AnalysisRuntime,
  AnalysisStageTiming,
} from "./types";

const STAGE_LABELS: Record<AnalysisPhase, string> = {
  discover: "Open archive",
  parse: "Read conversations",
  statistics: "Build initial insights",
  model: "Prepare embedding model",
  embed: "Map semantic memory",
  cluster: "Assemble topics and search",
};

export function estimateRemainingMs(
  elapsedMs: number,
  current: number,
  total: number
): number | null {
  if (elapsedMs < 750 || current <= 0 || total <= current) return null;
  const unitsPerMs = current / elapsedMs;
  if (!Number.isFinite(unitsPerMs) || unitsPerMs <= 0) return null;
  const estimate = (total - current) / unitsPerMs;
  return Number.isFinite(estimate) && estimate >= 0 ? estimate : null;
}

export class AnalysisRunTimer {
  private readonly now: () => number;
  private readonly startedAt: number;
  private currentPhase: AnalysisPhase | null = null;
  private currentStartedAt: number;
  private completedStages: AnalysisStageTiming[] = [];
  private smoothedEstimate: number | null = null;
  private firstInsightMs = 0;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
    this.startedAt = now();
    this.currentStartedAt = this.startedAt;
  }

  update(
    phase: AnalysisPhase,
    current: number,
    total: number,
    runtime?: AnalysisRuntime
  ): AnalysisProgressTiming {
    const timestamp = this.now();
    if (phase !== this.currentPhase) {
      this.completeCurrent(timestamp);
      this.currentPhase = phase;
      this.currentStartedAt = timestamp;
      this.smoothedEstimate = null;
    }
    const stageElapsedMs = Math.max(0, timestamp - this.currentStartedAt);
    const rawEstimate =
      phase === "parse" || phase === "embed" || phase === "cluster"
        ? estimateRemainingMs(stageElapsedMs, current, total)
        : null;
    if (rawEstimate !== null) {
      this.smoothedEstimate =
        this.smoothedEstimate === null
          ? rawEstimate
          : this.smoothedEstimate * 0.65 + rawEstimate * 0.35;
    }
    return {
      stageElapsedMs,
      totalElapsedMs: Math.max(0, timestamp - this.startedAt),
      estimatedRemainingMs: this.smoothedEstimate,
      completedStages: [...this.completedStages],
      runtime,
    };
  }

  markInitialInsights(): number {
    if (this.firstInsightMs === 0) {
      this.firstInsightMs = Math.max(1, this.now() - this.startedAt);
    }
    return this.firstInsightMs;
  }

  summary(
    status: AnalysisPerformance["status"],
    runtime?: AnalysisRuntime,
    semanticCandidateCount?: number
  ): AnalysisPerformance {
    const timestamp = this.now();
    const stages = [...this.completedStages];
    if (status === "complete" && this.currentPhase) {
      stages.push({
        phase: this.currentPhase,
        label: STAGE_LABELS[this.currentPhase],
        elapsedMs: Math.max(0, timestamp - this.currentStartedAt),
      });
    }
    const duration = (phase: AnalysisPhase) =>
      stages
        .filter((stage) => stage.phase === phase)
        .reduce((total, stage) => total + stage.elapsedMs, 0);
    return {
      status,
      totalMs: status === "complete" ? Math.max(1, timestamp - this.startedAt) : null,
      initialInsightsMs: this.firstInsightMs || Math.max(1, timestamp - this.startedAt),
      modelMs: duration("model"),
      semanticMs: duration("embed") + duration("cluster"),
      stages,
      runtime,
      semanticCandidateCount,
    };
  }

  private completeCurrent(timestamp: number) {
    if (!this.currentPhase) return;
    this.completedStages.push({
      phase: this.currentPhase,
      label: STAGE_LABELS[this.currentPhase],
      elapsedMs: Math.max(0, timestamp - this.currentStartedAt),
    });
  }
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "Estimating…";
  if (milliseconds < 1_000) return "Under 1 sec";
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}
