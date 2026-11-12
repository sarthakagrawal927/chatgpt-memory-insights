import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const MODEL_REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";

async function createSyntheticArchive() {
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  await writer.add(
    "conversations.json",
    new TextReader(
      JSON.stringify([
        {
          id: "synthetic-1",
          title: "Synthetic garden",
          create_time: 1700000000,
          mapping: {
            prompt: {
              message: {
                id: "prompt-1",
                author: { role: "user" },
                create_time: 1700000000,
                content: { parts: ["How can I grow basil in a small garden?"] },
              },
            },
          },
        },
      ])
    )
  );
  return Buffer.from(await (await writer.close()).arrayBuffer());
}

async function serveBuiltApp() {
  const server = createServer(async (request, response) => {
    try {
      const path = request.url === "/" ? "index.html" : request.url.slice(1).split("?")[0];
      const content = await readFile(new URL(`../dist/${path}`, import.meta.url));
      response.setHeader(
        "content-type",
        path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html"
      );
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function isPinnedModelRequest(request) {
  let original = request;
  while (original.redirectedFrom()) original = original.redirectedFrom();
  const initial = new URL(original.url());
  const current = new URL(request.url());
  return (
    initial.protocol === "https:" &&
    initial.hostname === "huggingface.co" &&
    initial.pathname.startsWith(`/${MODEL_ID}/resolve/${MODEL_REVISION}/`) &&
    current.protocol === "https:" &&
    (current.hostname === "huggingface.co" || current.hostname.endsWith(".hf.co"))
  );
}

async function downloadLocalTrace(page) {
  await page.locator("#analysis-details").evaluate((element) => {
    if (element instanceof HTMLDetailsElement) element.open = true;
  });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-local-trace").click();
  const download = await downloadPromise;
  const tracePath = await download.path();
  const trace = JSON.parse(await readFile(tracePath, "utf8"));
  const milestones = trace.events.map(({ milestone }) => milestone);
  const failureIndex = milestones.lastIndexOf("failure");
  const recoveryIndex = milestones.lastIndexOf("recovery");
  const failure = trace.events[failureIndex];
  const recovery = trace.events[recoveryIndex];
  const insight = trace.events.find((event) => event.milestone === "first_evidence_backed_insight");
  const requiredMilestones = [
    "import_started",
    "import_completed",
    "failure",
    "first_evidence_backed_insight",
    "recovery",
  ];
  return {
    filename: download.suggestedFilename(),
    hasPath: Boolean(tracePath),
    trace,
    qualification: {
      schemaVersion: trace.schemaVersion,
      privacy: /tab-local/.test(trace.privacy),
      missingMilestones: requiredMilestones.filter((milestone) => !milestones.includes(milestone)),
      recoveryAfterFailure: recoveryIndex > failureIndex,
      recoveryAfterFailedAttempt: Boolean(
        failure && recovery && recovery.attempt > failure.attempt
      ),
      recoveryMatchesInsight:
        Boolean(recovery && insight) &&
        recovery.attempt === insight.attempt &&
        recovery.elapsedMs === insight.elapsedMs,
      recoveryDurationMs: recovery?.recoveryDurationMs,
      hasSourceBackedItems: (insight?.sourceBackedItems ?? 0) >= 1,
      errorClass: failure?.errorClass,
      bottleneckStage: trace.bottleneck?.stage,
      bottleneckReason: trace.bottleneck?.reason,
      leaksFixtureText: /synthetic-1|How can I grow basil|synthetic\.zip/i.test(
        JSON.stringify(trace)
      ),
    },
  };
}

async function captureMeasurementScreenshots(page, phase, includeError = false) {
  const artifactDirectory = process.env.MEMORY_MAP_TRACE_ARTIFACT_DIR;
  if (process.env.CI && !artifactDirectory) {
    throw new Error("CI must retain the content-free Memory Map fixture screenshots");
  }
  if (!artifactDirectory) return [];
  await mkdir(artifactDirectory, { recursive: true });
  const filenames = [];
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const detailsPath = join(artifactDirectory, `memory-map-${phase}-details-${width}.jpg`);
    await page
      .locator("#analysis-details")
      .screenshot({ path: detailsPath, type: "jpeg", quality: 85 });
    filenames.push(detailsPath.split("/").at(-1));
    if (includeError) {
      const errorPath = join(artifactDirectory, `memory-map-${phase}-error-${width}.jpg`);
      await page.locator("#error-view").screenshot({ path: errorPath, type: "jpeg", quality: 85 });
      filenames.push(errorPath.split("/").at(-1));
    }
  }
  return filenames;
}

const archive = await createSyntheticArchive();

for (const width of [390, 768, 1280]) {
  test(`synthetic ZIP exposes model-download recovery at ${width}px`, async () => {
    const { server, origin } = await serveBuiltApp();
    let browser;
    try {
      browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route("**/*", (route) =>
        route.request().url().startsWith(origin) ? route.continue() : route.abort()
      );
      await page.goto(origin);
      await page
        .locator("#archive-input")
        .setInputFiles({ name: "synthetic.zip", mimeType: "application/zip", buffer: archive });
      await expect(page.locator("#report-view")).toBeVisible({ timeout: 30000 });
      await expect(page.locator("#error-view")).toBeVisible({ timeout: 30000 });
      await expect(page.locator("#sampling-note")).toContainText("stopped");
      await expect(page.locator("#save-memory")).toBeDisabled();
      await page.locator("#atlas-period").selectOption("all");
      await expect(page.locator("#sampling-note")).toContainText("stopped");
      await expect(page.locator('#memory-search button[type="submit"]')).toBeDisabled();
      const report = await page.locator("#overview-stats").textContent();
      assert.match(report, /Conversations\s*1/);
      await page.locator("#error-reset").click();
      await expect(page.locator("#import-view")).toBeVisible();
      assert.equal(await page.locator("#archive-input").inputValue(), "");
    } finally {
      try {
        await browser?.close();
      } finally {
        await closeServer(server);
      }
    }
  });
}

function routeModelRequests(page, origin, state) {
  page.on("request", (request) => {
    if (isPinnedModelRequest(request)) state.pinnedModelRequested = true;
  });
  page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (isPinnedModelRequest(route.request()) && state.blockPinnedModelRequests) {
      state.blockedPinnedModelRequestCount += 1;
      return route.abort("failed");
    }
    if (
      url.origin === origin ||
      (url.protocol === "https:" &&
        (isPinnedModelRequest(route.request()) ||
          (url.hostname === "cdn.jsdelivr.net" &&
            url.pathname.startsWith("/npm/@huggingface/transformers@3.8.1/dist/"))))
    ) {
      return route.continue();
    }
    return route.abort();
  });
}

async function observeModelFailure(page, archive, state) {
  await page.locator('input[name="model-profile"][value="compact"]').check();
  await page
    .locator("#archive-input")
    .setInputFiles({ name: "synthetic.zip", mimeType: "application/zip", buffer: archive });
  await expect(page.locator("#report-view")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#local-trace-summary")).toContainText("milestones");
  await expect(page.locator("#error-view")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#local-trace-summary")).toContainText("model failure needs recovery");
  const screenshots = await captureMeasurementScreenshots(page, "model-failure", true);
  state.blockPinnedModelRequests = false;
  await page.locator("#error-reset").click();
  await expect(page.locator("#import-view")).toBeVisible();
  return { blockedPinnedModelRequestCount: state.blockedPinnedModelRequestCount, screenshots };
}

async function observeModelRecovery(page, archive) {
  await page
    .locator("#archive-input")
    .setInputFiles({ name: "synthetic.zip", mimeType: "application/zip", buffer: archive });
  await expect(page.locator("#report-view")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#error-view")).toBeHidden();
  await expect(page.locator("#report-timing-status")).toContainText("Complete map ready", {
    timeout: 240000,
  });
  await expect(page.locator("#report-timing-runtime")).toContainText("Compatibility mode · q8");
  await expect(page.locator("#model-profile-note")).toContainText(
    `${MODEL_ID}@${MODEL_REVISION.slice(0, 8)}`
  );
  const coverage = await page.locator("#report-timing-coverage").textContent();
  const coverageMatch = /^(\d+) vectors · selected set preserved$/.exec(coverage ?? "");
  const exported = await downloadLocalTrace(page);
  return {
    coverageMatches: Boolean(coverageMatch),
    coverageVectors: Number(coverageMatch?.[1] ?? 0),
    exported,
  };
}

async function retainFixtureEvidence(exported, state, coverageVectors, screenshots) {
  const artifactDirectory = process.env.MEMORY_MAP_TRACE_ARTIFACT_DIR;
  if (process.env.CI && !artifactDirectory) {
    throw new Error("CI must retain the content-free Memory Map fixture trace");
  }
  if (!artifactDirectory) return;
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    join(artifactDirectory, "memory-map-local-measurement-trace.json"),
    `${JSON.stringify(exported.trace, null, 2)}\n`
  );
  await writeFile(
    join(artifactDirectory, "memory-map-qualification-summary.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        fixture: "synthetic_archive",
        viewportWidths: [390, 768, 1280],
        screenshots,
        pinnedModelRequested: state.pinnedModelRequested,
        blockedPinnedModelRequestCount: state.blockedPinnedModelRequestCount,
        recoveredAfterRetry: exported.qualification.recoveryAfterFailure,
        coverageVectors,
        qualification: exported.qualification,
        bottleneck: exported.trace.bottleneck,
        maxObservedStageDurationsMs: exported.trace.maxObservedStageDurationsMs,
      },
      null,
      2
    )}\n`
  );
}

test("synthetic ZIP completes pinned compact browser WASM inference", {
  timeout: 300000,
}, async () => {
  const { server, origin } = await serveBuiltApp();
  let browser;
  const modelRequests = {
    pinnedModelRequested: false,
    blockPinnedModelRequests: true,
    blockedPinnedModelRequestCount: 0,
  };
  try {
    browser = await chromium.launch({ args: ["--disable-webgpu"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });
    });
    routeModelRequests(page, origin, modelRequests);
    await page.goto(origin);
    const failure = await observeModelFailure(page, archive, modelRequests);
    const blockedPinnedModelRequestCount = failure.blockedPinnedModelRequestCount;
    assert.ok(
      blockedPinnedModelRequestCount > 0,
      "first import model requests must remain blocked"
    );
    assert.ok(
      modelRequests.pinnedModelRequested,
      "the pinned compact model revision must be requested"
    );
    const { coverageMatches, coverageVectors, exported } = await observeModelRecovery(
      page,
      archive
    );
    const screenshots = [
      ...failure.screenshots,
      ...(await captureMeasurementScreenshots(page, "recovered-insight")),
    ];
    const { recoveryDurationMs, ...recoveryQualification } = exported.qualification;
    assert.ok(coverageMatches, "completed coverage must preserve the selected set");
    assert.ok(
      coverageVectors >= 22,
      "coverage must include the fixture conversation, prompt, and 20 topic anchors"
    );
    assert.equal(exported.filename, "memory-map-local-measurement-trace.json");
    assert.ok(exported.hasPath, "the local diagnostic trace must be downloadable");
    assert.deepEqual(recoveryQualification, {
      schemaVersion: 1,
      privacy: true,
      missingMilestones: [],
      recoveryAfterFailure: true,
      recoveryAfterFailedAttempt: true,
      recoveryMatchesInsight: true,
      hasSourceBackedItems: true,
      errorClass: "model_prepare",
      bottleneckStage: "model",
      bottleneckReason: "observed_failure_recovered",
      leaksFixtureText: false,
    });
    assert.ok(Number.isFinite(recoveryDurationMs) && recoveryDurationMs >= 0);
    if (process.env.CI) assert.equal(screenshots.length, 9);
    await retainFixtureEvidence(exported, modelRequests, coverageVectors, screenshots);
    assert.deepEqual(pageErrors, []);
  } finally {
    try {
      await browser?.close();
    } finally {
      await closeServer(server);
    }
  }
});

test("analytics queues initialization until the SDK arrives without collecting archive text", async () => {
  const source = await readFile(new URL("../public/scripts/posthog.js", import.meta.url), "utf8");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  let releaseSdk;
  const ready = new Promise((resolve) => {
    releaseSdk = resolve;
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    if (route.request().url() === "https://memory-map.example/") {
      return route.fulfill({
        contentType: "text/html",
        body: `<input value="SYNTHETIC_PRIVATE_ARCHIVE"><script>${source}</script>`,
      });
    }
    assert.equal(route.request().url(), "https://us-assets.i.posthog.com/static/array.js");
    await ready;
    return route.fulfill({
      contentType: "text/javascript",
      body: `
      const config = window.posthog._i[0][1];
      window.analyticsSettings = { api_host: config.api_host, person_profiles: config.person_profiles, capture_pageview: config.capture_pageview, autocapture: config.autocapture };
      window.analyticsEvents = [];
      window.posthog = { capture: (...args) => window.analyticsEvents.push(args) };
      config.loaded();
    `,
    });
  });
  try {
    await page.goto("https://memory-map.example/", { waitUntil: "domcontentloaded" });
    assert.equal(await page.evaluate(() => window.posthog._i.length), 1);
    assert.deepEqual(errors, []);
    releaseSdk();
    await page.waitForFunction(() => window.analyticsEvents?.length === 1);
    assert.deepEqual(await page.evaluate(() => window.analyticsSettings), {
      api_host: "https://us.i.posthog.com",
      person_profiles: "always",
      capture_pageview: false,
      autocapture: false,
    });
    assert.deepEqual(await page.evaluate(() => window.analyticsEvents), [
      ["page_view", { project_id: "chatgpt-memory-insights" }],
    ]);
    assert.deepEqual(errors, []);
  } finally {
    releaseSdk();
    await browser.close();
  }
});

for (const host of ["localhost", "memory-map.example"]) {
  test(`analytics stays usable with ${host === "localhost" ? "local exclusion" : "blocked SDK"}`, async () => {
    const source = await readFile(new URL("../public/scripts/posthog.js", import.meta.url), "utf8");
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    let sdkRequests = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      if (route.request().url() === `http://${host}/`)
        return route.fulfill({
          contentType: "text/html",
          body: `<button>Import archive</button><script>${source}</script>`,
        });
      sdkRequests += 1;
      return route.abort();
    });
    try {
      await page.goto(`http://${host}/`);
      await expect(page.getByRole("button", { name: "Import archive" })).toBeEnabled();
      assert.deepEqual(errors, []);
      assert.equal(sdkRequests, host === "localhost" ? 0 : 1);
    } finally {
      await browser.close();
    }
  });
}
