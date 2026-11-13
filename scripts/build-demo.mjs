import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "vite";

const [archive, output] = process.argv.slice(2);
if (!archive || !output)
  throw new Error("Usage: node scripts/build-demo.mjs <archive.zip> <output.json>");
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
let archiveReader;
try {
  const { normalizeConversationChunk } = await server.ssrLoadModule("/src/lib/export.ts");
  const { createDemoData } = await server.ssrLoadModule("/src/lib/demo-data.ts");
  const python = spawn(
    "python3",
    [
      "-c",
      "import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); names=sorted(n for n in z.namelist() if n.rsplit('/',1)[-1].startswith('conversations') and n.endswith('.json')); [(sys.stdout.write(json.dumps(json.loads(z.read(n)))+'\\n'),sys.stdout.flush()) for n in names]",
      resolve(archive),
    ],
    { stdio: ["ignore", "pipe", "ignore"] }
  );
  archiveReader = python;
  python.stdout.setEncoding("utf8");
  const exited = new Promise((resolveExit, reject) => {
    python.on("error", reject);
    python.on("close", resolveExit);
  });
  const conversations = [];
  const seen = new Set();
  let pending = "";
  let chunks = 0;
  for await (const chunk of python.stdout) {
    pending += chunk;
    let end = pending.indexOf("\n");
    while (end !== -1) {
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      for (const conversation of normalizeConversationChunk(JSON.parse(line))) {
        if (seen.has(conversation.conversationId)) continue;
        seen.add(conversation.conversationId);
        conversations.push(conversation);
      }
      chunks += 1;
      process.stdout.write(`Read conversation chunk ${chunks}\n`);
      end = pending.indexOf("\n");
    }
  }
  const code = await exited;
  if (code !== 0 || chunks === 0 || pending.trim())
    throw new Error("Could not read conversation chunks from archive");
  const data = createDemoData(conversations);
  const serialized = `${JSON.stringify(data)}\n`;
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), serialized, { mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ output: resolve(output), bytes: Buffer.byteLength(serialized), chunks, totals: data.totals, categories: data.lenses.length, overlaps: data.overlaps.length })}\n`
  );
} catch {
  process.stderr.write(
    "Demo generation failed. No archive content was written to the output log.\n"
  );
  process.exitCode = 1;
} finally {
  if (archiveReader?.exitCode === null) archiveReader.kill();
  await server.close();
}
