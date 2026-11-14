#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productionPaths = ["src", "scripts"];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result;
}

function failRegressions(label, observed, baseline) {
  const regressions = Object.entries(baseline).filter(([key, maximum]) => observed[key] > maximum);
  if (regressions.length > 0) {
    throw new Error(
      regressions
        .map(([key, maximum]) => `${label} ${key} regressed: ${observed[key]} > ${maximum}`)
        .join("\n")
    );
  }
  if (Object.entries(baseline).some(([key, maximum]) => observed[key] < maximum)) {
    console.log(`${label} improved; lower the checked-in baseline intentionally.`);
  }
}

function checkFormat() {
  const result = run(
    "pnpm",
    [
      "exec",
      "biome",
      "format",
      ".",
      "--javascript-formatter-enabled=true",
      "--css-formatter-enabled=true",
      "--html-formatter-enabled=true",
      "--json-formatter-enabled=true",
      "--reporter=json",
      "--max-diagnostics=none",
    ],
    { allowFailure: true }
  );
  const report = JSON.parse(result.stdout);
  const observed = { files: report.summary.errors };
  if (observed.files > 0) console.error(JSON.stringify(report.diagnostics));
  console.log(`Format: ${observed.files} files differ from the enabled Biome formatter.`);
  // Ratcheted legacy debt: https://github.com/sass-maker/saas-maker/issues/213
  failRegressions("Format", observed, { files: 0 });
}

function checkComplexity() {
  const result = run("uvx", [
    "--from",
    "lizard==1.23.0",
    "lizard",
    ...productionPaths,
    "-x",
    "**/*.test.*",
    "--csv",
  ]);
  const rows = result.stdout
    .trim()
    .split("\n")
    .map((line) => line.match(/^(\d+),(\d+),(\d+),(\d+),(\d+),/u))
    .filter(Boolean)
    .map((match) => match.slice(1).map(Number));
  const observed = {
    functions: rows.length,
    nloc: rows.reduce((sum, row) => sum + row[0], 0),
    violations: rows.filter((row) => row[1] > 15 || row[4] > 100 || row[3] > 7).length,
    maxCcn: Math.max(...rows.map((row) => row[1])),
    maxLength: Math.max(...rows.map((row) => row[4])),
    maxParams: Math.max(...rows.map((row) => row[3])),
  };
  console.log(
    `Complexity: ${observed.functions} functions, ${observed.nloc} NLOC, ` +
      `${observed.violations} violations; max CCN ${observed.maxCcn}, ` +
      `max length ${observed.maxLength}, max params ${observed.maxParams}.`
  );
  // Ratcheted legacy debt: https://github.com/sass-maker/saas-maker/issues/213
  failRegressions("Complexity", observed, {
    violations: 10,
    maxCcn: 28,
    maxLength: 206,
    maxParams: 6,
  });
}

function checkDuplication() {
  const outputDirectory = mkdtempSync(join(tmpdir(), "memory-map-jscpd-"));
  run("pnpm", [
    "exec",
    "jscpd",
    "src",
    "--format",
    "javascript,typescript",
    "--min-lines",
    "8",
    "--min-tokens",
    "60",
    "--mode",
    "strict",
    "--ignore",
    "**/*.test.*,**/node_modules/**,**/coverage/**,**/dist/**",
    "--reporters",
    "json",
    "--output",
    outputDirectory,
    "--silent",
    "--no-tips",
  ]);
  const observed = JSON.parse(readFileSync(join(outputDirectory, "jscpd-report.json"), "utf8"))
    .statistics.total;
  console.log(
    `Duplication: ${observed.duplicatedLines}/${observed.lines} lines ` +
      `(${observed.percentage.toFixed(4)}%), ${observed.clones} groups across ` +
      `${observed.sources} files.`
  );
  // Ratcheted legacy debt: https://github.com/sass-maker/saas-maker/issues/213
  failRegressions("Duplication", observed, {
    clones: 0,
    duplicatedLines: 0,
    percentage: 0,
  });
}

function checkDependencies() {
  const result = run("pnpm", ["audit", "--json"], { allowFailure: true });
  const report = JSON.parse(result.stdout);
  const advisories = Object.values(report.advisories ?? {});
  const count = (severity) =>
    advisories.filter((advisory) => advisory.severity === severity).length;
  console.log(
    `Dependencies: ${count("critical")} critical, ${count("high")} high, ` +
      `${count("moderate")} moderate, ${count("low")} low.`
  );
  if (result.status !== 0 || advisories.length > 0) {
    throw new Error(
      `Dependency audit failed: ${advisories
        .map((advisory) => advisory.github_advisory_id)
        .join(", ")}`
    );
  }
}

function checkSuppressions() {
  const biome = JSON.parse(readFileSync(join(projectRoot, "biome.json"), "utf8"));
  let disabledRules = 0;
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const nested of Object.values(value)) {
      if (nested === "off") disabledRules += 1;
      else visit(nested);
    }
  };
  visit(biome.linter?.rules);

  const result = run(
    "git",
    [
      "grep",
      "-n",
      "-E",
      "(^|[[:space:]])(//|/\\*)[[:space:]]*(biome-ignore|eslint-disable|@ts-ignore|@ts-expect-error|istanbul ignore|c8 ignore)",
      "--",
      ...productionPaths,
    ],
    { allowFailure: true }
  );
  const inline = result.stdout.trim() ? result.stdout.trim().split("\n").length : 0;
  console.log(`Suppressions: ${disabledRules} disabled Biome rules, ${inline} inline directives.`);
  // Ratcheted compatibility debt: https://github.com/sass-maker/saas-maker/issues/213
  failRegressions("Suppressions", { disabledRules, inline }, { disabledRules: 27, inline: 0 });
}

function checkHygiene() {
  const conflicts = run("git", ["grep", "-n", "-E", "^(<<<<<<<|=======|>>>>>>>)", "--", "."], {
    allowFailure: true,
  }).stdout.trim();
  if (conflicts) throw new Error(`Conflict markers:\n${conflicts}`);
  const todos = run(
    "git",
    [
      "grep",
      "-n",
      "-E",
      "TODO|FIXME",
      "--",
      ...productionPaths,
      ":(exclude)scripts/check-code-health.mjs",
    ],
    { allowFailure: true }
  ).stdout.trim();
  if (todos) throw new Error(`Durable TODO/FIXME markers:\n${todos}`);
  run("git", ["diff", "--check", "HEAD", "--", "."]);
  console.log("Repository hygiene: clean.");
}

const checks = {
  complexity: checkComplexity,
  dependencies: checkDependencies,
  duplication: checkDuplication,
  format: checkFormat,
  hygiene: checkHygiene,
  suppressions: checkSuppressions,
};

const selected = process.argv[2];
if (!Object.hasOwn(checks, selected)) {
  console.error(`Usage: check-code-health.mjs <${Object.keys(checks).join("|")}>`);
  process.exit(2);
}

try {
  checks[selected]();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
