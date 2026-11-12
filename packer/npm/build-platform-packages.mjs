#!/usr/bin/env node
// Builds one npm package per platform from the binaries in `dist/`, named
// `memory-pack-<rust-target>[.exe]`, and keeps their versions in step with
// Cargo.toml. Run from the `packer` directory:
//
//   node npm/build-platform-packages.mjs
//
// Output lands in `npm/platforms/<package>/`, ready for `npm publish`.

import { mkdir, readFile, readdir, copyFile, writeFile, rm, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packer = join(here, "..");

// Rust target -> the npm package it becomes.
const TARGETS = {
  "aarch64-apple-darwin": { pkg: "@memory-pack/darwin-arm64", os: "darwin", cpu: "arm64" },
  "x86_64-apple-darwin": { pkg: "@memory-pack/darwin-x64", os: "darwin", cpu: "x64" },
  "aarch64-unknown-linux-musl": { pkg: "@memory-pack/linux-arm64", os: "linux", cpu: "arm64" },
  "x86_64-unknown-linux-musl": { pkg: "@memory-pack/linux-x64", os: "linux", cpu: "x64" },
  "x86_64-pc-windows-msvc": { pkg: "@memory-pack/win32-x64", os: "win32", cpu: "x64" },
};

function versionFrom(cargoToml) {
  const match = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("Could not read version from Cargo.toml");
  return match[1];
}

const version = versionFrom(await readFile(join(packer, "Cargo.toml"), "utf8"));
const distDir = join(packer, "dist");
const outDir = join(here, "platforms");

let binaries;
try {
  binaries = await readdir(distDir);
} catch (error) {
  throw new Error(`No dist/ directory. Build binaries into ${distDir} first.`, { cause: error });
}

await rm(outDir, { recursive: true, force: true });
const built = [];

for (const [target, { pkg, os, cpu }] of Object.entries(TARGETS)) {
  const windows = os === "win32";
  const file = `memory-pack-${target}${windows ? ".exe" : ""}`;
  if (!binaries.includes(file)) {
    console.warn(`skipping ${pkg}: ${file} not in dist/`);
    continue;
  }

  const root = join(outDir, pkg.replace("/", "-"));
  await mkdir(join(root, "bin"), { recursive: true });
  const binary = join(root, "bin", `memory-pack${windows ? ".exe" : ""}`);
  await copyFile(join(distDir, file), binary);
  if (!windows) await chmod(binary, 0o755);

  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: pkg,
        version,
        description: `memory-pack binary for ${os} ${cpu}`,
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/sarthakagrawal927/chatgpt-memory-insights.git",
          directory: "packer",
        },
        os: [os],
        cpu: [cpu],
        files: ["bin"],
      },
      null,
      2
    )}\n`
  );
  built.push(pkg);
  console.log(`built ${pkg}@${version}`);
}

// The launcher must be able to ask for every package it might resolve.
const manifestPath = join(here, "package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.version = version;
for (const key of Object.keys(manifest.optionalDependencies)) {
  manifest.optionalDependencies[key] = version;
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

if (built.length === 0) throw new Error("No platform packages were built.");
console.log(`\n${built.length} package(s) in ${outDir}`);
console.log("Publish with: npm publish --access public (each platform, then npm/)");
