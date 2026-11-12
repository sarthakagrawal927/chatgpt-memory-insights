export const capabilityRoutes = [
  {
    code: "A",
    className: "route-cobalt",
    title: "Your questions, counted honestly",
    summary:
      "Fast local rules read the full parsed export first, so useful totals arrive even if the embedding model cannot load.",
    stops: [
      {
        title: "History overview",
        detail:
          "Conversations, messages, your prompts, approximate words, active days, date range, and longest activity streak.",
      },
      {
        title: "Conversation depth",
        detail: "Median message depth plus short, medium, and deep conversation groups.",
      },
      {
        title: "Activity rhythms",
        detail:
          "A monthly cadence graph switches between conversation count and approximate word count, filters by any overlapping question route, and shows the selected total and peak month.",
      },
      {
        title: "Recurring terms",
        detail: "Frequently used meaningful terms that can surface themes worth revisiting.",
      },
      {
        title: "Exact repeated questions",
        detail:
          "Near-identical wording grouped with count, first ask, last ask, and source conversations.",
      },
      {
        title: "10 overlapping question domains",
        detail:
          "Math, health, software, money, career, learning, creative work, relationships, travel, and planning—each with query count, conversation count, monthly history, and evidence.",
      },
      {
        title: "Likely typo signals",
        detail:
          "A deliberately small disclosed misspelling list plus repeated-word checks—not a grammar or writing-quality score.",
      },
      {
        title: "Possible thread changes",
        detail:
          "Low-overlap adjacent prompts flag conversations that may contain several tracks before deeper semantic segmentation runs.",
      },
    ],
  },
  {
    code: "B",
    className: "route-signal",
    title: "Meaning, not just matching words",
    summary:
      "A pinned embedding model runs inside the browser to connect differently worded questions, conversations, facts, and strands.",
    stops: [
      {
        title: "Automatic model selection",
        detail:
          "Chooses a compact English profile or multilingual profile from the writing systems in your prompts; manual selection remains available.",
      },
      {
        title: "Visible model cost",
        detail:
          "Shows the pinned model, revision, selection reason, and approximate first-download size: about 90 MB for accelerated compact analysis, 24 MB for compact compatibility mode, or 135 MB multilingual.",
      },
      {
        title: "Accelerated browser inference",
        detail:
          "Uses WebGPU with larger bounded batches when the compact model and browser support it, then retries the complete ordered workload in portable WebAssembly mode when needed.",
      },
      {
        title: "Progressive conversation graph",
        detail:
          "Every parsed conversation becomes a distinct stop in a live deterministic route sketch, which stays visible through semantic analysis and hands off to the final embedding-backed topology.",
      },
      {
        title: "Semantic topic clusters",
        detail:
          "Groups sampled conversations by meaning and names them against 20 broad topic anchors plus distinctive terms from your history.",
      },
      {
        title: "Interactive topic graph",
        detail:
          "Node size represents conversation count; edges represent semantic proximity; selecting a node opens its evidence.",
      },
      {
        title: "Semantic repeated questions",
        detail:
          "Finds similar intent even when the wording changed, while keeping these groups distinct from exact repeats.",
      },
      {
        title: "Four memory states",
        detail:
          "Current, updated, explicitly refuted, and possible contradiction—detected only from first-person statements, never assistant assertions.",
      },
      {
        title: "Memory change history",
        detail:
          "Keeps earlier and later wording, dates, update or refutation cues, semantic similarity, lexical overlap, confidence, and source conversations.",
      },
      {
        title: "Semantic conversation strands",
        detail:
          "Splits substantial multi-prompt conversations into ordered strands with visible boundaries, snippets, continuity, and confidence.",
      },
    ],
  },
  {
    code: "C",
    className: "route-violet",
    title: "How your map changes over time",
    summary:
      "Monthly evidence distinguishes a momentary spike from a theme that is growing, fading, returning, or holding steady.",
    stops: [
      {
        title: "Topic evolution",
        detail: "Monthly histories and local trend labels for semantic topic clusters.",
      },
      {
        title: "Question-domain evolution",
        detail:
          "See whether health, software, planning, learning, and the other lenses become more or less prominent.",
      },
      {
        title: "Language-signal evolution",
        detail:
          "Tracks curiosity, frustration, urgency, uncertainty, excitement, appreciation, and neutral/direct wording by month.",
      },
      {
        title: "Five explicit trend states",
        detail:
          "Emerging, fading, resurfacing, steady, or not enough history—descriptions of the series, never explanations of why you changed.",
      },
      {
        title: "Positive, neutral, and negative wording",
        detail:
          "A compact lexical tone distribution and negative-wording rate, explicitly separated from personality or mental-health claims.",
      },
      {
        title: "Evidence-backed reflection questions",
        detail:
          "Open questions triggered by repeats, changed or refuted memories, possible contradictions, frustration-wording spikes, stale memories, dormant themes, recurring terms, and activity peaks.",
      },
      {
        title: "Six-view visual atlas",
        detail:
          "A coordinated activity calendar, question-mix chart, language matrix, repeat landscape, topic-momentum plot, and conversation-shape board, each with readable data and source evidence.",
      },
      {
        title: "One global view period",
        detail:
          "Switch between the recent 3, 6, 12, or 24 calendar months and all history; the activity calendar, cadence graph, topic movement, query tone, and language signals stay aligned to the same window, including inactive months.",
      },
      {
        title: "Seven-slide Story mode",
        detail:
          "A keyboard-, swipe-, and touch-friendly presentation turns scale, cadence, question routes, repeats, language, and topic movement into an evidence-aware personal recap.",
      },
    ],
  },
  {
    code: "D",
    className: "route-teal",
    title: "Search that explains itself",
    summary:
      "The derived index is useful as memory because search results and every inferred insight retain a route back to the conversation evidence.",
    stops: [
      {
        title: "Natural-language memory search",
        detail:
          "Search conversations, individual questions, fact candidates, topics, and semantic strands with a hybrid semantic and lexical index.",
      },
      {
        title: "Visible graph traversal",
        detail:
          "Each memory question creates a temporary query node, highlights up to four topic routes, and shows the route from question to topic to evidence before an answer appears.",
      },
      {
        title: "Local memory conversation",
        detail:
          "An optional pinned 77M browser model turns retrieved evidence into a short conversational answer without receiving the full ZIP.",
      },
      {
        title: "Six-stop evidence boundary",
        detail:
          "The local generator receives at most six labelled excerpts and four recent chat turns, keeping context inspectable and browser work bounded.",
      },
      {
        title: "Citation checks, not answer verification",
        detail:
          "Local drafts are labelled unverified. Missing or unknown citations and repeated instructions are withheld; recognized S1–S6 citations do not establish answer accuracy. Source excerpts remain available for review.",
      },
      {
        title: "Change-aware and repeat-aware retrieval",
        detail:
          "Questions about changed, updated, refuted, or repeated memories prioritize the matching structured ledger state instead of relying on similarity alone.",
      },
      {
        title: "Short conversational continuity",
        detail:
          "The panel retains only the four most recent turns for follow-ups; generated answers never become facts, graph edges, or saved memory.",
      },
      {
        title: "Typed, scored results",
        detail:
          "Each result identifies what it is, shows why it matched, includes a similarity score, and opens its topic or source.",
      },
      {
        title: "Evidence drawer",
        detail:
          "Topics, repeats, facts, domains, typo signals, strands, trends, language signals, and reflections all open supporting conversations.",
      },
      {
        title: "Adjustable evidence confidence",
        detail:
          "Exploratory, balanced, conservative, and custom thresholds refilter inferred repeats, memory changes, strand boundaries, and reflections without rereading the ZIP.",
      },
      {
        title: "Transparent sampling",
        detail:
          "The report states how many conversations, prompts, facts, and thread prompts were embedded versus the full parsed totals.",
      },
      {
        title: "Keyboard and non-graph access",
        detail:
          "A complete topic list mirrors the SVG graph; graph nodes, tabs, dialogs, search, and import controls support keyboard use and visible focus.",
      },
    ],
  },
  {
    code: "E",
    className: "route-amber",
    title: "Private and recoverable by construction",
    summary:
      "There is no application server waiting for the archive. Parsing, analysis, search, and optional persistence happen on the device.",
    stops: [
      {
        title: "Original ZIP import",
        detail:
          "Accepts current ChatGPT exports containing one or more conversations*.json files; no manual unzipping required.",
      },
      {
        title: "Incremental split-file parsing",
        detail:
          "Reads large conversation chunks sequentially in a Web Worker instead of loading the whole archive into the page at once.",
      },
      {
        title: "Attachments stay unread",
        detail: "Binary attachments, chat.html, and unrelated export files are ignored.",
      },
      {
        title: "No archive upload",
        detail:
          "Conversation text is not sent to an application API, account system, analytics payload, or model endpoint.",
      },
      {
        title: "Deterministic fallback",
        detail:
          "Totals, activity, domains, exact repeats, wording signals, typo candidates, and initial thread candidates remain useful if embeddings fail.",
      },
      {
        title: "Nothing saved by default",
        detail:
          "The page does not persist the archive or derived index unless you explicitly choose “Keep on this device.”",
      },
      {
        title: "Device-local save, restore, and forget",
        detail:
          "An opt-in IndexedDB snapshot restores the derived report and search index; incompatible old snapshots are rejected and removed; Forget deletes the saved copy.",
      },
      {
        title: "Visible progress and recovery",
        detail:
          "Parse, statistics, model, embedding, and clustering stages report progress; analysis can be cancelled, errors explain recovery, and a new archive resets the report.",
      },
      {
        title: "Step-by-step wait estimates",
        detail:
          "A live six-stop route separates archive opening, parsing, initial insights, model preparation, semantic mapping, and final assembly, with elapsed time and a continuously revised remaining-time estimate.",
      },
      {
        title: "Complete execution receipt",
        detail:
          "After the map is ready, a distinct end-to-end timer includes parsing, model download and preparation, embeddings, and report assembly alongside initial-insight time, compute route, and preserved candidate coverage.",
      },
      {
        title: "Explicit chat-model lifecycle",
        detail:
          "The local generator loads only after consent, discloses its approximately 105 MB cached download and English focus, and can be unloaded independently at any time.",
      },
      {
        title: "Single-tab compute guard",
        detail:
          "A browser lock prevents duplicate heavyweight archive analysis across tabs, while reset, unload, errors, and page exit terminate model workers and release the lock.",
      },
    ],
  },
] as const;

export const releases = [
  {
    date: "2026-07-28",
    title: "Memory Map launched",
    outcomes: [
      "ChatGPT export ZIPs can be analyzed entirely in the browser without uploading conversation history to an application server.",
      "The first report connected recurring questions, themes, activity, language signals, and source evidence.",
    ],
  },
  {
    date: "2026-07-28",
    title: "A visual atlas and seven-slide story",
    outcomes: [
      "Six period-aware charts make activity, question mix, language, repeats, topic movement, and conversation shape explorable.",
      "Story mode turns the report into a keyboard-, touch-, and swipe-friendly guided view with evidence detours.",
    ],
  },
  {
    date: "2026-07-28",
    title: "Graph-routed, local Memory Chat",
    outcomes: [
      "An opt-in local model can answer through a visible question-to-topic-to-evidence route.",
      "Bounded evidence packs and citation validation withhold unsupported drafts rather than presenting them as grounded.",
    ],
  },
  {
    date: "2026-07-28",
    title: "Faster analysis with clearer timing",
    outcomes: [
      "WebGPU acceleration and an order-preserving WebAssembly fallback reduce semantic analysis time across supported devices.",
      "The progress view now separates stages, elapsed time, estimated wait, and the final execution receipt.",
    ],
  },
];

export const surfaces = [
  {
    name: "SaaS Maker directory",
    url: "https://sassmaker.com",
    kind: "Public",
    detail:
      "Memory Map is listed in the public product directory at sassmaker.com, alongside the other Fleet products.",
  },
  {
    name: "Portfolio Project Strip",
    url: "https://sassmaker.com",
    kind: "Public",
    detail:
      "The shared @saas-maker/portfolio-project-strip footer includes Memory Map in its generated project catalog, so sites that embed the strip link back here.",
  },
  {
    name: "Site Health",
    url: null,
    kind: "Internal",
    detail:
      "The private portfolio dashboard monitors this domain — availability, performance, and AI-visibility signals tracked on a schedule.",
  },
  {
    name: "Significant Hobbies",
    url: "https://significanthobbies.com",
    kind: "Home",
    detail:
      "Memory Map lives at chatgpt.significanthobbies.com — part of the Significant Hobbies family of personal tools.",
  },
];

export const indexCopy = [
  {
    tag: "p",
    text: "Your history, made navigable",
  },
  {
    tag: "h1",
    text: "Find the questions, facts, and ideas you keep returning to.",
  },
  {
    tag: "p",
    text: "Choose your ChatGPT export. Memory Map reads its conversation files in this tab, then builds a searchable semantic graph with a browser-loaded embedding model.",
  },
  {
    tag: "strong",
    text: "How to export your ChatGPT data",
  },
  {
    tag: "strong",
    text: "Settings → Data controls",
  },
  {
    tag: "strong",
    text: "Export data",
  },
  {
    tag: "strong",
    text: "Export",
  },
  {
    tag: "strong",
    text: "Confirm export",
  },
  {
    tag: "li",
    text: "Open the email or SMS from OpenAI, download the ZIP, and bring it here without unzipping it.",
  },
  {
    tag: "p",
    text: "Exports can take up to 7 days. The download link expires 24 hours after it arrives.",
  },
  {
    tag: "p",
    text: "Settings exports require a signed-in eligible account and are not available for ChatGPT Business or Enterprise workspaces.",
  },
  {
    tag: "strong",
    text: "How to pack your agent sessions",
  },
  {
    tag: "p",
    text: "Your prompts and the assistant’s replies are packed. Tool calls, tool output, reasoning traces, and file contents are left behind, which is why an archive stays small enough to analyse in a browser tab.",
  },
  {
    tag: "p",
    text: "Both CLIs prune old sessions, so memory-pack also reads the prompt history they keep outside their transcripts. Sessions they have already deleted are rebuilt from the prompts that survive.",
  },
  {
    tag: "strong",
    text: "Automatic",
  },
  {
    tag: "small",
    text: "Selects from the writing systems used in your prompts.",
  },
  {
    tag: "strong",
    text: "Compact English",
  },
  {
    tag: "small",
    text: "Smaller download for English-first histories.",
  },
  {
    tag: "strong",
    text: "Multilingual",
  },
  {
    tag: "small",
    text: "≈135 MB · meaning across many languages.",
  },
  {
    tag: "strong",
    text: "Evidence confidence",
  },
  {
    tag: "small",
    text: "Higher confidence shows fewer, stronger inferred connections.",
  },
  {
    tag: "strong",
    text: "Choose your ChatGPT export",
  },
  {
    tag: "small",
    text: "Conversation JSON is read. Attachments and chat.html are ignored.",
  },
  {
    tag: "strong",
    text: "Parse",
  },
  {
    tag: "small",
    text: "Read split conversation files one at a time.",
  },
  {
    tag: "strong",
    text: "Map",
  },
  {
    tag: "small",
    text: "Embed bounded prompts and fact candidates.",
  },
  {
    tag: "strong",
    text: "Explore",
  },
  {
    tag: "small",
    text: "Search, inspect repeats, and trace every result.",
  },
  {
    tag: "strong",
    text: "Private by construction.",
  },
];

export const aboutCopy = [
  {
    tag: "p",
    text: "A private atlas of your ChatGPT history",
  },
  {
    tag: "h1",
    text: "Turn your ChatGPT history into usable memory.",
  },
  {
    tag: "p",
    text: "Find the questions you repeat, facts you changed, themes you left behind, and ideas that connect across years of conversations. Your export is analyzed in this browser, then becomes a searchable map with evidence behind every suggestion.",
  },
  {
    tag: "strong",
    text: "10",
  },
  {
    tag: "strong",
    text: "4",
  },
  {
    tag: "strong",
    text: "2",
  },
  {
    tag: "strong",
    text: "0",
  },
  {
    tag: "strong",
    text: "One history. Several connected routes.",
  },
  {
    tag: "strong",
    text: "“How should I prioritize this?” × 7",
  },
  {
    tag: "strong",
    text: "Product · planning",
  },
  {
    tag: "strong",
    text: "“I now prefer…”",
  },
  {
    tag: "strong",
    text: "Decisions I postponed",
  },
  {
    tag: "strong",
    text: "12 source conversations",
  },
  {
    tag: "p",
    text: "Why this exists",
  },
  {
    tag: "h2",
    text: "Your archive remembers more than any single chat can.",
  },
  {
    tag: "p",
    text: "A long ChatGPT history contains decisions revisited under different wording, personal facts that later stopped being true, projects scattered across unrelated chats, and patterns that are almost impossible to see one conversation at a time.",
  },
  {
    tag: "p",
    text: "Memory Map treats those conversations as evidence. It counts what can be counted exactly, uses local embeddings where meaning matters, and always keeps a route back to the sources.",
  },
  {
    tag: "p",
    text: "Complete capability atlas",
  },
  {
    tag: "h2",
    text: "Everything the map can show you.",
  },
  {
    tag: "p",
    text: "The privacy architecture",
  },
  {
    tag: "h2",
    text: "Your conversations never need an application server.",
  },
  {
    tag: "p",
    text: "The website is static. The analysis pipeline lives in your tab and its Web Worker.",
  },
  {
    tag: "strong",
    text: "Your original ZIP",
  },
  {
    tag: "p",
    text: "You choose it from your device. It is not submitted through a web form.",
  },
  {
    tag: "strong",
    text: "Incremental browser parsing",
  },
  {
    tag: "p",
    text: "Conversation JSON chunks are read one at a time; attachments remain ignored.",
  },
  {
    tag: "strong",
    text: "Local rules + embeddings",
  },
  {
    tag: "p",
    text: "Statistics run first. A pinned Hugging Face model file downloads separately, then embeds bounded text on your device.",
  },
  {
    tag: "strong",
    text: "Your report and search index",
  },
  {
    tag: "p",
    text: "Nothing persists unless you explicitly save the derived memory to this browser.",
  },
  {
    tag: "p",
    text: "Archive text, parsed prompts, fact candidates, embeddings, report, and search index.",
  },
  {
    tag: "p",
    text: "Pinned embedding-model files from Hugging Face. Your prompt text is not part of that request.",
  },
  {
    tag: "p",
    text: "Archive upload endpoint, Memory Map account, cross-device sync, or server-side analysis.",
  },
  {
    tag: "p",
    text: "PostHog and Microsoft Clarity measure the public `/about` and `/changelog` pages. The private analysis route does not load Clarity, so archive text, reports, and search activity are excluded from session replay.",
  },
  {
    tag: "p",
    text: "Know before you import",
  },
  {
    tag: "h2",
    text: "Built for reflection. Not diagnosis.",
  },
  {
    tag: "h3",
    text: "Memory Map is a good fit if you want to…",
  },
  {
    tag: "li",
    text: "Find recurring questions and decisions across many chats.",
  },
  {
    tag: "li",
    text: "Build a searchable index of your own prompts, topics, facts, and strands.",
  },
  {
    tag: "li",
    text: "Review what you explicitly updated, rejected, or may have contradicted.",
  },
  {
    tag: "li",
    text: "See how interests and wording signals changed over time.",
  },
  {
    tag: "li",
    text: "Keep the archive on your device and inspect the evidence behind suggestions.",
  },
  {
    tag: "h3",
    text: "It is not currently the right tool if you need…",
  },
  {
    tag: "li",
    text: "Attachment, image, audio, or exported-memory-file analysis.",
  },
  {
    tag: "li",
    text: "A generative biography, automatic life summary, or personality profile.",
  },
  {
    tag: "li",
    text: "Medical, mental-health, or emotional diagnosis.",
  },
  {
    tag: "li",
    text: "Verified truth—the fact ledger contains candidates from your wording.",
  },
  {
    tag: "li",
    text: "Accounts, team collaboration, cross-device sync, or server backups.",
  },
  {
    tag: "p",
    text: "Your ticket in",
  },
  {
    tag: "h2",
    text: "Download the ZIP directly from ChatGPT.",
  },
  {
    tag: "p",
    text: "Keep it zipped. Memory Map knows how to find split conversation files and ignores the binary attachments.",
  },
  {
    tag: "strong",
    text: "Settings → Data controls",
  },
  {
    tag: "strong",
    text: "Export data",
  },
  {
    tag: "strong",
    text: "Export",
  },
  {
    tag: "strong",
    text: "Confirm export",
  },
  {
    tag: "p",
    text: "Open the email or SMS from OpenAI, download the ZIP, and return here without unzipping it.",
  },
  {
    tag: "p",
    text: "OpenAI says an export can take up to 7 days, and the download link expires 24 hours after it arrives. Settings export requires an eligible signed-in account and is not available for Business or Enterprise workspaces.",
  },
  {
    tag: "p",
    text: "Next stop",
  },
  {
    tag: "h2",
    text: "Your history is already there. Make it navigable.",
  },
  {
    tag: "p",
    text: "No account. No archive upload. Nothing saved unless you ask.",
  },
];

export const chatgptExportSteps: { text: string; strong?: boolean }[][] = [
  [
    { text: "Sign in to ChatGPT, open your profile menu, then choose " },
    { text: indexCopy[4].text, strong: true },
    { text: "." },
  ],
  [
    { text: "Under " },
    { text: indexCopy[5].text, strong: true },
    { text: ", choose " },
    { text: indexCopy[6].text, strong: true },
    { text: ", then " },
    { text: indexCopy[7].text, strong: true },
    { text: "." },
  ],
];
export const aboutFacts = [
  "question domains",
  "memory states",
  "model profiles",
  "archive uploads",
].map((label, index) => ({ value: aboutCopy[index + 3].text, label }));

export const privacyContract =
  "No archive upload endpoint, account, or default archive persistence. Model files download from Hugging Face; your conversation text is not sent with that request. Site-level page-view and performance telemetry is separate and receives no archive text or derived content.";
