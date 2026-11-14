import { mountMemoryAtlas } from "@saas-maker/insight-atlas";
import { forgetSnapshot, loadSnapshot, saveSnapshot } from "../lib/storage";
import { AnalysisLease } from "../lib/analysis-lease";
import {
  buildThreadStrands,
  classifyTrend,
  confidencePreset,
  confidenceThreshold,
  normalizeSettings,
} from "../lib/analysis";
import { formatDuration } from "../lib/performance";
import { LocalMeasurementTrace } from "../lib/measurement-trace";
import { loadDemo } from "../lib/load-demo";
import {
  buildMemoryChatEvidence,
  buildMemoryChatMessages,
  buildMemoryChatFallback,
  MEMORY_CHAT_MODEL,
  planMemoryChatResults,
  validateMemoryChatCitations,
} from "../lib/memory-chat";

mountMemoryAtlas({
  createAnalysisWorker: () =>
    new Worker(new URL("../workers/analyze.worker.ts", import.meta.url), { type: "module" }),
  createMemoryChatWorker: () =>
    new Worker(new URL("../workers/memory-chat.worker.ts", import.meta.url), { type: "module" }),
  analysisLease: new AnalysisLease(navigator.locks),
  measurementTrace: new LocalMeasurementTrace(),
  forgetSnapshot,
  loadSnapshot,
  saveSnapshot,
  buildThreadStrands,
  classifyTrend,
  confidencePreset,
  confidenceThreshold,
  normalizeSettings,
  formatDuration,
  buildMemoryChatEvidence,
  buildMemoryChatMessages,
  buildMemoryChatFallback,
  MEMORY_CHAT_MODEL,
  planMemoryChatResults,
  validateMemoryChatCitations,
  loadDemo,
  developmentSampleUrl: import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get("sample")
    : null,
});
