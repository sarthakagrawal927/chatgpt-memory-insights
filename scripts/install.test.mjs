import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const installer = fileURLToPath(new URL("../public/install.sh", import.meta.url));
const primary = "sarthakagrawal927/chatgpt-memory-insights";
const legacy = "sass-maker/saas-maker";
const binary = Buffer.from("#!/bin/sh\nprintf 'fixture memory-pack\\n'\n");
const checksum = createHash("sha256").update(binary).digest("hex");
const fixtureRoots = [];

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) removeFixture(root);
});

const fakeCurl = `#!${process.execPath}
const fs = require("node:fs");
const config = JSON.parse(fs.readFileSync(process.env.INSTALLER_FIXTURE, "utf8"));
const args = process.argv.slice(2);
const url = args.find((arg) => arg.startsWith("https://"));
const output = args[args.indexOf("-o") + 1];
fs.appendFileSync(config.requests, url + "\\n");
const response = config.responses[url];
if (!response) process.exit(22);
fs.writeFileSync(output, Buffer.from(response, "base64"));
`;

function removeFixture(root) {
  for (const entry of readdirSync(join(root, "temporary"))) {
    const directory = join(root, "temporary", entry);
    for (const filename of ["releases.json", "probe", "memory-pack", "SHA256SUMS"]) {
      const file = join(directory, filename);
      if (existsSync(file)) unlinkSync(file);
    }
    rmdirSync(directory);
  }
  for (const relative of [
    "tools/curl",
    "tools/uname",
    "fixture.json",
    "requests.log",
    "installed/memory-pack",
  ]) {
    const file = join(root, relative);
    if (existsSync(file)) unlinkSync(file);
  }
  for (const directory of ["tools", "temporary", "installed"]) rmdirSync(join(root, directory));
  rmdirSync(root);
}

function api(repository) {
  return `https://api.github.com/repos/${repository}/releases?per_page=100`;
}

function release(repository, tag, target = "x86_64-unknown-linux-musl", corrupt = false) {
  const base = `https://github.com/${repository}/releases/download/${tag}`;
  return {
    [`${base}/memory-pack-${target}`]: binary,
    [`${base}/SHA256SUMS`]: `${corrupt ? "0".repeat(64) : checksum}  memory-pack-${target}\n`,
  };
}

function runInstaller(responses, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "memory-pack-installer-"));
  for (const directory of ["tools", "temporary", "installed"]) mkdirSync(join(root, directory));
  fixtureRoots.push(root);
  writeFileSync(join(root, "tools/curl"), fakeCurl, { mode: 0o755 });
  writeFileSync(
    join(root, "tools/uname"),
    `#!/bin/sh
case "$1" in
  -s) printf '%s\\n' '${options.os ?? "Linux"}' ;;
  -m) printf '%s\\n' '${options.arch ?? "x86_64"}' ;;
  *) exit 1 ;;
esac
`,
    { mode: 0o755 }
  );
  const requests = join(root, "requests.log");
  writeFileSync(requests, "");
  const configuration = join(root, "fixture.json");
  writeFileSync(
    configuration,
    JSON.stringify({
      requests,
      responses: Object.fromEntries(
        Object.entries(responses).map(([url, body]) => [url, Buffer.from(body).toString("base64")])
      ),
    })
  );
  const result = spawnSync("/bin/sh", [installer], {
    encoding: "utf8",
    env: {
      PATH: `${join(root, "tools")}:/usr/bin:/bin:/usr/sbin:/sbin`,
      TMPDIR: join(root, "temporary"),
      INSTALLER_FIXTURE: configuration,
      MEMORY_PACK_BIN_DIR: join(root, "installed"),
      MEMORY_PACK_VERSION: options.version ?? "latest",
    },
  });
  return {
    result,
    requests: readFileSync(requests, "utf8").trim().split("\n"),
    installed: join(root, "installed/memory-pack"),
    leftovers: readdirSync(join(root, "temporary")),
  };
}

test("latest installs the primary memory-pack tag while ignoring unrelated releases", () => {
  const fixture = runInstaller({
    [api(primary)]: JSON.stringify(
      [{ tag_name: "mcp-v0.1.0" }, { tag_name: "memory-pack-v0.1.3" }],
      null,
      2
    ),
    ...release(primary, "memory-pack-v0.1.3"),
  });
  assert.equal(fixture.result.status, 0, fixture.result.stderr);
  assert.deepEqual(readFileSync(fixture.installed), binary);
  assert.match(fixture.result.stdout, /checksum verified/u);
  assert.ok(!fixture.requests.includes(api(legacy)));
  assert.ok(fixture.requests.every((url) => !url.includes("/latest")));
  assert.deepEqual(fixture.leftovers, []);
});

test("latest uses a legacy memory-pack tag when the primary has no matching release", () => {
  const fixture = runInstaller(
    {
      [api(primary)]: JSON.stringify([{ tag_name: "mcp-v0.1.0" }], null, 2),
      [api(legacy)]: JSON.stringify([{ tag_name: "memory-pack-v0.1.4" }], null, 2),
      ...release(legacy, "memory-pack-v0.1.4", "aarch64-apple-darwin"),
    },
    { os: "Darwin", arch: "arm64" }
  );
  assert.equal(fixture.result.status, 0, fixture.result.stderr);
  assert.deepEqual(readFileSync(fixture.installed), binary);
  assert.match(fixture.result.stdout, /checksum verified/u);
  assert.ok(
    fixture.requests.some((url) => url.includes(`${legacy}/releases/download/memory-pack-v0.1.4/`))
  );
  assert.deepEqual(fixture.leftovers, []);
});

test("API failures fall back to the retained primary tag with a warning and checksum", () => {
  const fixture = runInstaller(release(primary, "memory-pack-v0.1.2"));
  assert.equal(fixture.result.status, 0, fixture.result.stderr);
  assert.deepEqual(fixture.requests.slice(0, 2), [api(primary), api(legacy)]);
  assert.deepEqual(readFileSync(fixture.installed), binary);
  assert.match(fixture.result.stdout, /warning: both release API lookups failed/u);
  assert.match(fixture.result.stdout, /using retained memory-pack-v0.1.2/u);
  assert.match(fixture.result.stdout, /checksum verified/u);
  assert.ok(fixture.requests.every((url) => !url.includes("/latest")));
  assert.deepEqual(fixture.leftovers, []);
});

test("an explicit version falls back to legacy assets without release API lookups", () => {
  const fixture = runInstaller(release(legacy, "memory-pack-v0.1.2"), {
    version: "memory-pack-v0.1.2",
  });
  assert.equal(fixture.result.status, 0, fixture.result.stderr);
  assert.deepEqual(readFileSync(fixture.installed), binary);
  assert.match(fixture.result.stdout, /checksum verified/u);
  assert.ok(fixture.requests.every((url) => !url.startsWith("https://api.github.com/")));
  assert.deepEqual(fixture.leftovers, []);
});

test("a corrupt fallback download is rejected and temporary files are cleaned", () => {
  const fixture = runInstaller(
    release(primary, "memory-pack-v0.1.2", "x86_64-unknown-linux-musl", true)
  );
  assert.equal(fixture.result.status, 1);
  assert.match(fixture.result.stderr, /checksum mismatch/u);
  assert.ok(!existsSync(fixture.installed));
  assert.deepEqual(fixture.leftovers, []);
});

test("successful empty release lists fail without inventing an available version", () => {
  const fixture = runInstaller({ [api(primary)]: "[]", [api(legacy)]: "[]" });
  assert.equal(fixture.result.status, 1);
  assert.match(fixture.result.stderr, /no memory-pack release is available/u);
  assert.ok(!existsSync(fixture.installed));
  assert.deepEqual(fixture.leftovers, []);
});
