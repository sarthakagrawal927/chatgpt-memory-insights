import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyReleaseSource } from "./deploy.mjs";

const revision = "a".repeat(40);
const successfulRun = {
  id: 1,
  run_attempt: 1,
  head_sha: revision,
  head_branch: "main",
  event: "push",
  path: ".github/workflows/ci.yml",
  status: "completed",
  conclusion: "success",
};

function fixture(overrides = {}) {
  const responses = {
    "git branch --show-current": "main\n",
    "git status --porcelain": "",
    "git rev-parse HEAD": revision,
    "git remote get-url origin": "https://github.com/sarthakagrawal927/chatgpt-memory-insights.git",
    "git ls-remote --exit-code origin refs/heads/main": `${revision}\trefs/heads/main\n`,
    ...overrides,
  };
  return (command, args) => {
    if (command === "gh") {
      return JSON.stringify([{ total_count: 1, workflow_runs: [successfulRun] }]);
    }
    const key = [command, ...args].join(" ");
    if (!Object.hasOwn(responses, key)) throw new Error(`Unexpected command: ${key}`);
    return responses[key];
  };
}

test("release source requires a clean main checkout at current remote main", () => {
  assert.equal(verifyReleaseSource(fixture()), revision);
  for (const [command, response] of [
    ["git branch --show-current", "feature"],
    ["git status --porcelain", " M src/pages/index.astro"],
    ["git remote get-url origin", "https://github.com/sass-maker/saas-maker.git"],
    ["git ls-remote --exit-code origin refs/heads/main", `${"b".repeat(40)}\trefs/heads/main`],
  ])
    assert.throws(() => verifyReleaseSource(fixture({ [command]: response })));
});

test("release source rejects missing, stale, failed and pending CI evidence", () => {
  const run = fixture();
  for (const change of [
    { head_sha: "b".repeat(40) },
    { head_branch: "feature" },
    { event: "pull_request" },
    { path: ".github/workflows/other.yml" },
    { conclusion: "failure" },
    { status: "in_progress", conclusion: null },
  ]) {
    const execute = (command, args) =>
      command === "gh"
        ? JSON.stringify([{ total_count: 1, workflow_runs: [{ ...successfulRun, ...change }] }])
        : run(command, args);
    assert.throws(() => verifyReleaseSource(execute));
  }
  for (const pages of [
    [],
    [{ total_count: 0, workflow_runs: [] }],
    [{ total_count: 2, workflow_runs: [successfulRun] }],
    [
      {
        total_count: 2,
        workflow_runs: [
          successfulRun,
          { ...successfulRun, run_attempt: 2, status: "in_progress", conclusion: null },
        ],
      },
    ],
  ]) {
    assert.throws(() =>
      verifyReleaseSource((command, args) =>
        command === "gh" ? JSON.stringify(pages) : run(command, args)
      )
    );
  }
});
