import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "sarthakagrawal927/chatgpt-memory-insights";

function verifyCheckout(run) {
  if (run("git", ["branch", "--show-current"]).trim() !== "main") {
    throw new Error("Deploy from main.");
  }
  if (run("git", ["status", "--porcelain"]).trim()) {
    throw new Error("Deploy from a clean checkout.");
  }
  const revision = run("git", ["rev-parse", "HEAD"]).trim();
  if (!/^[a-f0-9]{40}$/u.test(revision)) throw new Error("Invalid source revision.");
  const origin = run("git", ["remote", "get-url", "origin"]).trim();
  if (
    !["https://github.com/", "git@github.com:"].some((prefix) =>
      [repository, `${repository}.git`].some((name) => origin === `${prefix}${name}`)
    )
  ) {
    throw new Error("Origin is not the ChatGPT Insights repository.");
  }
  const remote = run("git", ["ls-remote", "--exit-code", "origin", "refs/heads/main"])
    .trim()
    .split(/\s+/u);
  if (remote.length !== 2 || remote[0] !== revision || remote[1] !== "refs/heads/main") {
    throw new Error("Checkout does not match current origin/main.");
  }
  return revision;
}

function readPushRuns(run, revision) {
  const pages = JSON.parse(
    run("gh", [
      "api",
      "--paginate",
      "--slurp",
      `repos/${repository}/actions/runs?head_sha=${revision}&branch=main&event=push&per_page=100`,
    ])
  );
  if (
    !Array.isArray(pages) ||
    !pages.length ||
    pages.some(
      (page) => !Array.isArray(page.workflow_runs) || !Number.isSafeInteger(page.total_count)
    )
  )
    throw new Error("Invalid GitHub CI evidence.");
  const runs = pages.flatMap((page) => page.workflow_runs);
  if (pages.some((page) => page.total_count > runs.length)) {
    throw new Error("Incomplete GitHub CI evidence.");
  }
  return runs;
}

function verifyPushRun(run, revision) {
  if (
    run.head_sha !== revision ||
    run.head_branch !== "main" ||
    run.event !== "push" ||
    !Number.isSafeInteger(run.id) ||
    !Number.isSafeInteger(run.run_attempt) ||
    typeof run.path !== "string"
  )
    throw new Error("CI does not match the release source.");
}

function verifyPushCi(runs, revision) {
  const latest = new Map();
  for (const run of runs) {
    verifyPushRun(run, revision);
    const previous = latest.get(run.path);
    if (
      !previous ||
      run.id > previous.id ||
      (run.id === previous.id && run.run_attempt > previous.run_attempt)
    )
      latest.set(run.path, run);
  }
  if (
    !latest.has(".github/workflows/ci.yml") ||
    [...latest.values()].some((run) => run.status !== "completed" || run.conclusion !== "success")
  )
    throw new Error("Current source requires successful completed push CI.");
}

export function verifyReleaseSource(run) {
  const revision = verifyCheckout(run);
  verifyPushCi(readPushRuns(run, revision), revision);
  return revision;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const dryRun = process.argv.slice(2);
    if (dryRun.length && (dryRun.length !== 1 || dryRun[0] !== "--dry-run")) {
      throw new Error("Usage: node scripts/deploy.mjs [--dry-run]");
    }
    const run = (command, args) => execFileSync(command, args, { encoding: "utf8" });
    const revision = verifyReleaseSource(run);
    console.log(`Release source verified: ${revision}`);
    if (!dryRun.length) {
      for (const args of [
        ["run", "check"],
        [
          "exec",
          "wrangler",
          "pages",
          "deploy",
          "dist",
          "--project-name",
          "chatgpt-memory-insights",
          "--branch",
          "main",
        ],
      ]) {
        if (args[0] === "exec" && verifyReleaseSource(run) !== revision) {
          throw new Error("Source changed during release checks.");
        }
        const result = spawnSync("pnpm", args, { stdio: "inherit" });
        if (result.error) throw result.error;
        if (result.status !== 0) process.exit(result.status ?? 1);
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
