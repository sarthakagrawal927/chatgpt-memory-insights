import { demoReport, parseDemoData } from "./demo-data";
import type { FullReport } from "./types";

const MAX_DEMO_BYTES = 2 * 1024 * 1024;

type DemoProgress = {
  phase: "download" | "prepare";
  loaded: number;
  total: number | null;
};

class DemoLoadError extends Error {}

export async function loadDemo(options: {
  signal: AbortSignal;
  onProgress: (progress: DemoProgress) => void;
}): Promise<FullReport> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(options.signal.reason);
  options.signal.addEventListener("abort", cancel, { once: true });
  if (options.signal.aborted) cancel();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 30000);
  try {
    return await downloadDemo(controller.signal, options.onProgress);
  } catch (error) {
    if (options.signal.aborted || error instanceof DemoLoadError) throw error;
    throw new DemoLoadError(
      timedOut
        ? "The demo took too long to download. Please try again."
        : "The demo download failed. Please try again.",
      { cause: error }
    );
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", cancel);
  }
}

async function downloadDemo(
  signal: AbortSignal,
  onProgress: (progress: DemoProgress) => void
): Promise<FullReport> {
  signal.throwIfAborted();
  onProgress({ phase: "download", loaded: 0, total: null });
  const response = await fetch("/demo/report-v1.json", {
    signal,
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new DemoLoadError("The demo is unavailable. Please try again.");
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new DemoLoadError("The demo response was not valid data. Please try again.");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (declaredLength > MAX_DEMO_BYTES)
    throw new DemoLoadError("The demo exceeded its download limit.");
  const total =
    !response.headers.get("content-encoding") &&
    Number.isSafeInteger(declaredLength) &&
    declaredLength > 0
      ? declaredLength
      : null;
  if (!response.body) throw new DemoLoadError("The demo download was empty. Please try again.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      if (loaded > MAX_DEMO_BYTES) throw new DemoLoadError("The demo exceeded its download limit.");
      chunks.push(value);
      onProgress({ phase: "download", loaded, total });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  signal.throwIfAborted();
  onProgress({ phase: "prepare", loaded, total: loaded });
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let report: FullReport;
  try {
    report = demoReport(parseDemoData(JSON.parse(new TextDecoder().decode(bytes))));
  } catch (error) {
    throw new DemoLoadError("The demo data could not be read. Please try again.", { cause: error });
  }
  signal.throwIfAborted();
  return report;
}
