#!/usr/bin/env node
"use strict";

// Thin launcher. The real work is a Rust binary, shipped as one optional
// dependency per platform so `npx memory-pack` installs exactly one of them
// and never downloads anything at run time.

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const PACKAGES = {
  "darwin arm64": "@memory-pack/darwin-arm64",
  "darwin x64": "@memory-pack/darwin-x64",
  "linux arm64": "@memory-pack/linux-arm64",
  "linux x64": "@memory-pack/linux-x64",
  "win32 x64": "@memory-pack/win32-x64",
};

function fail(message) {
  process.stderr.write(`memory-pack: ${message}\n`);
  process.exit(1);
}

const platform = `${process.platform} ${process.arch}`;
const packageName = PACKAGES[platform];
if (!packageName) {
  fail(
    `no prebuilt binary for ${platform}. Build it from source instead:\n` +
      "  cargo install --git https://github.com/sarthakagrawal927/chatgpt-memory-insights memory-pack"
  );
}

// Resolving the manifest rather than the binary keeps this working whatever
// the platform package declares in "exports". The extra search paths cover
// symlinked installs (npm link, file: dependencies), where resolution starts
// from the launcher's real path rather than the install tree.
function locate() {
  const attempts = [
    () => require.resolve(`${packageName}/package.json`),
    () =>
      require.resolve(`${packageName}/package.json`, {
        paths: [process.cwd(), __dirname, path.join(__dirname, "..", "..")],
      }),
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      // Try the next strategy.
    }
  }
  return null;
}

const manifest = locate();
if (!manifest) {
  fail(
    `${packageName} is not installed. Optional dependencies may have been skipped;\n` +
      `reinstall without --no-optional, or run: npm install ${packageName}`
  );
}
const binary = path.join(
  path.dirname(manifest),
  "bin",
  process.platform === "win32" ? "memory-pack.exe" : "memory-pack"
);

const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
  fail(`could not run ${binary}: ${result.error.message}`);
}
// Reproduce a signal death as a signal death so shells see the right status.
if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exit(result.status ?? 1);
