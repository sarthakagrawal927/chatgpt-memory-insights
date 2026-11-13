import { demoReport, parseDemoData } from "./demo-data";
import type { FullReport } from "./types";

const MAX_DEMO_BYTES = 2 * 1024 * 1024;

type DemoProgress = {
  phase: "download" | "prepare";
  loaded: number;
  total: number | null;
};

export async function loadDemo(options: {
  signal: AbortSignal;
  onProgress: (progress: DemoProgress) => void;
}): Promise<FullReport> {
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(30000)]);
  options.onProgress({ phase: "download", loaded: 0, total: null });
  const response = await fetch("/demo/report-v1.json", {
    signal,
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("The demo is unavailable. Please try again.");
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("The demo response was not valid data. Please try again.");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (declaredLength > MAX_DEMO_BYTES) throw new Error("The demo exceeded its download limit.");
  const total =
    !response.headers.get("content-encoding") &&
    Number.isSafeInteger(declaredLength) &&
    declaredLength > 0
      ? declaredLength
      : null;
  if (!response.body) throw new Error("The demo download was empty. Please try again.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      if (loaded > MAX_DEMO_BYTES) throw new Error("The demo exceeded its download limit.");
      chunks.push(value);
      options.onProgress({ phase: "download", loaded, total });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  signal.throwIfAborted();
  options.onProgress({ phase: "prepare", loaded, total: loaded });
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const report = demoReport(parseDemoData(JSON.parse(new TextDecoder().decode(bytes))));
  signal.throwIfAborted();
  return report;
}
