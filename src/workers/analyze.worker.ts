/// <reference lib="webworker" />

import { BlobReader, TextWriter, ZipReader, type FileEntry } from "@zip.js/zip.js";
import { buildEfficiencyReport, parseEfficiency } from "../lib/efficiency";
import { normalizeConversationChunk } from "../lib/export";
import { resolveAnalysisSettings } from "../lib/analysis";
import { buildDeterministicReport, classifyQuestionLensIds } from "../lib/insights";
import { buildReflectionQuestions } from "../lib/reflections";
import { AnalysisRunTimer } from "../lib/performance";
import {
  buildLexicalIndex,
  buildSemanticMemory,
  disposeExtractor,
  searchMemory,
} from "../lib/semantic";
import type {
  ConversationRecord,
  AnalysisSettings,
  AnalysisRuntime,
  FullReport,
  LexicalSearchEntry,
  MemorySnapshot,
  SearchEntry,
  WorkerRequest,
  WorkerResponse,
} from "../lib/types";

const worker = self as DedicatedWorkerGlobalScope;
let searchIndex: SearchEntry[] = [];
let lexicalIndex: LexicalSearchEntry[] = [];
let currentReport: FullReport | null = null;
let generation = 0;
let analysisTimer: AnalysisRunTimer | null = null;
let analysisRuntime: AnalysisRuntime | undefined;

function post(message: WorkerResponse) {
  worker.postMessage(message);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  if (typeof error === "string") return error;
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== "{}" ? serialized : fallback;
  } catch {
    return fallback;
  }
}

function progress(
  phase: Extract<WorkerResponse, { type: "progress" }>["phase"],
  label: string,
  current: number,
  total: number,
  runtime?: AnalysisRuntime
) {
  if (runtime) analysisRuntime = runtime;
  post({
    type: "progress",
    phase,
    label,
    current,
    total,
    timing: analysisTimer?.update(phase, current, total, runtime ?? analysisRuntime),
  });
}

async function analyze(file: File, settings: AnalysisSettings) {
  const activeGeneration = ++generation;
  searchIndex = [];
  lexicalIndex = [];
  currentReport = null;
  analysisRuntime = undefined;
  analysisTimer = new AnalysisRunTimer();
  progress("discover", "Reading archive directory", 0, 1);

  const zip = new ZipReader(new BlobReader(file));
  try {
    const entries = await zip.getEntries();
    const conversationEntries = entries
      .filter(
        (entry): entry is FileEntry =>
          !entry.directory && /(^|\/)conversations(?:-\d+)?\.json$/i.test(entry.filename)
      )
      .sort((left, right) => left.filename.localeCompare(right.filename));

    if (conversationEntries.length === 0) {
      throw new Error(
        "No conversations JSON was found. Choose the original ChatGPT export ZIP containing conversations.json or conversations-000.json, or an archive built by memory-pack from your Claude Code and Codex sessions."
      );
    }

    // Token and tool accounting, when the packer included it. Absent for a
    // ChatGPT export, which carries no such record.
    const efficiencyEntry = entries.find(
      (entry): entry is FileEntry => !entry.directory && entry.filename === "efficiency.json"
    );
    let efficiency: FullReport["efficiency"] = null;
    if (efficiencyEntry) {
      try {
        const text = await efficiencyEntry.getData(new TextWriter());
        efficiency = buildEfficiencyReport(parseEfficiency(JSON.parse(text)));
      } catch {
        // A damaged record must not cost the visitor their whole report.
        efficiency = null;
      }
    }

    const conversations: ConversationRecord[] = [];
    for (let index = 0; index < conversationEntries.length; index += 1) {
      if (activeGeneration !== generation) return;
      const entry = conversationEntries[index];
      progress("parse", `Parsing ${entry.filename}`, index, conversationEntries.length);
      const text = await entry.getData(new TextWriter());
      const value: unknown = JSON.parse(text);
      const normalized = normalizeConversationChunk(value);
      conversations.push(...normalized);
      post({
        type: "graph-formation",
        conversations: normalized.map((conversation) => ({
          id: conversation.conversationId,
          title: conversation.title,
          date: conversation.date,
          routeIds: classifyQuestionLensIds(conversation.prompts.map((prompt) => prompt.text)),
        })),
        processed: conversations.length,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    progress("statistics", "Building transparent statistics", 0, 1);
    const deterministic = buildDeterministicReport(conversations);
    const analysis = resolveAnalysisSettings(
      settings,
      deterministic.prompts.map((prompt) => prompt.text)
    );
    lexicalIndex = buildLexicalIndex(conversations, deterministic.prompts, deterministic.facts);
    currentReport = {
      generatedAt: Date.now(),
      fileName: file.name,
      analysis,
      deterministic: deterministic.report,
      semantic: null,
      reflections: [],
      efficiency,
    };
    analysisTimer.markInitialInsights();
    currentReport.performance = analysisTimer.summary("running");
    currentReport.reflections = buildReflectionQuestions(currentReport, deterministic.prompts);
    post({ type: "deterministic", report: currentReport });

    progress("model", `Loading the ${analysis.resolvedModelProfile} embedding model`, 0, 100);
    const semantic = await buildSemanticMemory(
      conversations,
      deterministic.prompts,
      deterministic.facts,
      deterministic.report.lenses.threads.candidates.map((candidate) => candidate.id),
      analysis,
      (phase, label, current, total, runtime) => progress(phase, label, current, total, runtime)
    );
    if (activeGeneration !== generation) return;

    searchIndex = semantic.searchIndex;
    currentReport = { ...currentReport, semantic: semantic.report };
    currentReport.reflections = buildReflectionQuestions(currentReport, deterministic.prompts);
    const model = semantic.report.model;
    const semanticCandidateCount =
      model.embeddedConversations +
      model.embeddedQuestions +
      model.embeddedFacts +
      model.embeddedThreadPrompts +
      (model.embeddedTopicAnchors ?? 0);
    currentReport.performance = analysisTimer.summary(
      "complete",
      model.runtime,
      semanticCandidateCount
    );
    const snapshot: MemorySnapshot = {
      version: 3,
      report: currentReport,
      searchIndex,
      lexicalIndex,
    };
    post({ type: "complete", report: currentReport, snapshot });
    analysisTimer = null;
  } catch (error) {
    try {
      await disposeExtractor();
    } catch {
      // The worker will still surface the original analysis error.
    }
    post({
      type: "error",
      message: errorMessage(error, "The archive could not be analyzed."),
      recoverable: Boolean(currentReport),
    });
    analysisTimer = null;
  } finally {
    await zip.close();
  }
}

worker.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "analyze") {
    await analyze(request.file, request.settings);
    return;
  }
  if (request.type === "search") {
    if (!request.query.trim() || searchIndex.length === 0) {
      post({ type: "search-results", query: request.query, results: [] });
      return;
    }
    try {
      const results = await searchMemory(
        request.query.trim(),
        searchIndex,
        lexicalIndex,
        currentReport?.analysis.resolvedModelProfile ?? "compact",
        (phase, label, current, total, runtime) => progress(phase, label, current, total, runtime)
      );
      post({ type: "search-results", query: request.query, results });
    } catch (error) {
      post({
        type: "error",
        message: errorMessage(error, "Memory search failed."),
        recoverable: true,
      });
    }
    return;
  }
  if (request.type === "restore") {
    if (
      request.snapshot.version !== 3 ||
      !request.snapshot.report.analysis?.resolvedModelProfile ||
      !request.snapshot.report.semantic?.model.revision
    ) {
      post({
        type: "error",
        message:
          "This saved memory uses an unsupported version. Forget it and import the archive again.",
        recoverable: false,
      });
      return;
    }
    currentReport = request.snapshot.report;
    searchIndex = request.snapshot.searchIndex.map((entry) => ({
      ...entry,
      embedding:
        entry.embedding instanceof Float32Array
          ? entry.embedding
          : Float32Array.from(entry.embedding as unknown as number[]),
    }));
    lexicalIndex = request.snapshot.lexicalIndex ?? [];
    post({ type: "restored", report: currentReport });
    return;
  }
  generation += 1;
  analysisTimer = null;
  analysisRuntime = undefined;
  searchIndex = [];
  lexicalIndex = [];
  currentReport = null;
  await disposeExtractor();
});
