import { test } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

test("built public HTML and Markdown stay in sync", () => {
  const root = process.argv[2]
    ? resolve(process.argv[2])
    : fileURLToPath(new URL("../dist/", import.meta.url));
  const catalog = JSON.parse(readFileSync(join(root, "api/md/_catalog"), "utf8"));
  const paths = new Set(catalog.map((route) => route.path));
  const skips = new Map();
  const failures = [];
  let html = 0;
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      if (!entry.name.endsWith(".html")) continue;
      const body = readFileSync(file, "utf8");
      const canonical = body.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
      if (!canonical) {
        failures.push(`Missing canonical: ${file}`);
        continue;
      }
      if (/<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(body)) {
        if (paths.has(new URL(canonical).pathname))
          failures.push(`Noindex page registered: ${canonical}`);
        continue;
      }
      const path = new URL(canonical).pathname;
      if (skips.has(path)) continue;
      html++;
      if (!paths.has(path)) failures.push(`Missing renderer: ${path}`);
      if (!/<meta\b[^>]*name="ai-summary"/i.test(body)) failures.push(`Missing summary: ${path}`);
      if (!/<link\b[^>]*rel="alternate"[^>]*type="text\/markdown"/i.test(body))
        failures.push(`Missing alternate: ${path}`);
    }
  }
  walk(root);
  for (const route of catalog) {
    const body = readFileSync(join(root, new URL(route.md).pathname), "utf8");
    assert.ok(body.includes(`Canonical: ${route.url}`), `Missing canonical in ${route.md}`);
    assert.ok(body.startsWith("# "), `Missing title in ${route.md}`);
  }
  const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(urls).size, urls.length, "Duplicate sitemap URLs");
  assert.deepEqual(
    new Set(urls.map((url) => new URL(url).pathname)),
    paths,
    "Sitemap/registry mismatch"
  );
  const sitemapPaths = new Set(urls.map((url) => new URL(url).pathname));
  const apiAi = JSON.parse(readFileSync(join(root, "api-ai.json"), "utf8"));
  for (const surface of apiAi.surfaces) {
    const path = new URL(surface.url).pathname;
    assert.ok(sitemapPaths.has(path), `Catalog surface missing from sitemap: ${path}`);
  }
  for (const key of ["agentGuidance", "commercialState"]) {
    const advertised = apiAi[key];
    assert.equal(typeof advertised, "string", `Missing api-ai ${key}`);
    const path = new URL(advertised).pathname.slice(1);
    assert.ok(existsSync(join(root, path)), `Missing advertised file: ${path}`);
  }
  const full = readFileSync(join(root, "llms-full.txt"), "utf8");
  assert.ok(full.length < 500000, "Full export exceeds budget");
  assert.match(full, /<!-- source: https:\/\/chatgpt.significanthobbies.com\//);
  assert.equal(failures.length, 0, failures.join("\n"));
  console.log(
    JSON.stringify(
      {
        publicHtmlChecked: html,
        registeredRoutes: paths.size,
        sitemapUrls: urls.length,
        fullExportCharacters: full.length,
        skipped: Object.fromEntries(skips),
      },
      null,
      2
    )
  );
});
