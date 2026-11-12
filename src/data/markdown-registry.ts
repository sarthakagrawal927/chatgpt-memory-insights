import { createAgentSurfaceManifest } from "../../vendor/agent-surfaces/manifest.mjs";
import { createAgentSurfaceHandler } from "../../vendor/agent-surfaces/handler.mjs";
import { listMarkdownRoutes } from "../../vendor/agent-surfaces/documents.mjs";
import { publicIdentity, publicPages } from "./public-identity";
import {
  indexCopy,
  aboutCopy,
  capabilityRoutes,
  releases,
  surfaces,
  chatgptExportSteps,
  aboutFacts,
  privacyContract,
} from "./public-content";

function copyMarkdown(copy: { tag: string; text: string }[]) {
  return copy
    .map(({ tag, text }) => {
      const level = /^h[1-6]$/.test(tag) ? Math.max(2, Number(tag[1])) : tag === "strong" ? 3 : 0;
      const prefix = level ? `${"#".repeat(level)} ` : tag === "li" ? "- " : "";
      const labels: Record<string, string> = {
        "Archive text, parsed prompts, fact candidates, embeddings, report, and search index.":
          "Stays here",
        "Pinned embedding-model files from Hugging Face. Your prompt text is not part of that request.":
          "Comes in",
        "Archive upload endpoint, Memory Map account, cross-device sync, or server-side analysis.":
          "Does not exist",
      };
      return `${labels[text] ? `### ${labels[text]}\n\n` : ""}${prefix}${text}`;
    })
    .join("\n\n");
}

const capabilities = capabilityRoutes
  .map(
    (route) =>
      `### ${route.title}\n\n${route.summary}\n\n${route.stops.map((stop) => `#### ${stop.title}\n\n${stop.detail}`).join("\n\n")}`
  )
  .join("\n\n");
const about = copyMarkdown(
  aboutCopy.map((item, index) =>
    index >= 3 && index <= 6
      ? { tag: "p", text: `${aboutFacts[index - 3].value} ${aboutFacts[index - 3].label}` }
      : item
  )
).replace(
  "## Everything the map can show you.",
  `## Everything the map can show you.\n\n${capabilityRoutes.reduce((total, route) => total + route.stops.length, 0)} shipped capabilities across five routes. These are current product behaviors, not a roadmap.\n\n${capabilities}`
);
const homeCopy = indexCopy.flatMap((item, index) => {
  if (index === 4 || index === 5)
    return [{ tag: "li", text: chatgptExportSteps[index - 4].map((part) => part.text).join("") }];
  if (item.text === "Private by construction.") return [item, { tag: "p", text: privacyContract }];
  return index === 6 || index === 7 ? [] : [item];
});
const home = `${copyMarkdown(homeCopy)}\n\n## Agent session archives\n\nInstall on macOS or Linux:\n\n\`\`\`sh\ncurl -fsSL https://chatgpt.significanthobbies.com/install.sh | sh\nmemory-pack --dry-run --list\nmemory-pack\n\`\`\`\n\nDrop the named memory-pack ZIP here without unzipping it. Narrow with \`--since 2026-01-01\`, or use \`--no-history\` for sessions whose full transcript survives.\n\n[Release binaries and checksums](https://github.com/sarthakagrawal927/chatgpt-memory-insights/releases)\n\n[How it works](https://github.com/sarthakagrawal927/chatgpt-memory-insights/tree/main/packer)\n\n[All capabilities](${publicIdentity.url}/about/)`;
const bodies = {
  index: home,
  about,
  changelog: releases
    .map(
      (release) =>
        `## ${release.title}\n\n${release.date}\n\n${release.outcomes.map((outcome) => `- ${outcome}`).join("\n")}`
    )
    .join("\n\n"),
  "used-by": surfaces
    .map(
      (surface) =>
        `## ${surface.name}\n\n${surface.kind}\n\n${surface.detail}${surface.url ? `\n\n[${surface.name}](${surface.url})` : ""}`
    )
    .join("\n\n"),
};
export const markdownPages = Object.fromEntries(
  Object.entries(publicPages).map(([key, page]) => [
    page.path,
    `# ${page.title}\n\n> ${page.description}\n\nCanonical: ${publicIdentity.url}${page.path}\n\n${bodies[key as keyof typeof bodies]}\n\n## Related\n- [Home](${publicIdentity.url}/)\n- [About](${publicIdentity.url}/about/)\n- [Changelog](${publicIdentity.url}/changelog/)\n- [Official export instructions](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data)\n`,
  ])
);
const markdownManifest = createAgentSurfaceManifest({
  ...publicIdentity,
  pages: markdownPages,
});
export const markdownRoutes = listMarkdownRoutes(markdownManifest);
export const handleMarkdown = createAgentSurfaceHandler({
  manifest: markdownManifest,
  preserveMarkdownPaths: ["/pricing.md"],
});
