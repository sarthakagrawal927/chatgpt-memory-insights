# memory-pack

Turns the Claude Code and Codex transcripts already on your machine into one
ZIP that [Memory Map](https://chatgpt.significanthobbies.com) can read.

Both agents keep a complete record of every session, but most of that record is
tool traffic — commands, file contents, diffs, reasoning traces. `memory-pack`
keeps the conversation and leaves the machinery behind. On a machine holding
11.8 GB of transcripts, the resulting archive is under 8 MB.

## Install

```sh
curl -fsSL https://chatgpt.significanthobbies.com/install.sh | sh
```

That picks the binary for your platform, checks it against the published
`SHA256SUMS`, and installs it into `~/.local/bin`. Set `MEMORY_PACK_BIN_DIR` to
put it somewhere else, or `MEMORY_PACK_VERSION` to pin a release. macOS and
Linux, on both Intel and ARM.

Prefer to do it yourself? Take a binary from a `memory-pack-v*`
[release](https://github.com/sarthakagrawal927/chatgpt-memory-insights/releases), or build from this directory with `cargo install --path .`.

On macOS, a binary downloaded through a browser carries Gatekeeper's quarantine
attribute, and an unsigned one is then killed on sight with no message at all.
The installer above avoids this, since curl does not set the attribute and the
script clears it anyway. If you download by hand, clear it yourself:

```sh
xattr -d com.apple.quarantine ./memory-pack
```

Windows has a published `memory-pack-x86_64-pc-windows-msvc.exe` but no
installer script. Download it from Releases and run it directly. It is built on
every release and untested by the author.

## Use

```sh
memory-pack
```

That reads `~/.claude` and `~/.codex` and writes `memory-pack-<date>.zip` in
the current directory. Upload that ZIP to Memory Map without unzipping it.

Look before you write:

```sh
memory-pack --dry-run --list
```

## What it reads

| Kept | Left behind |
| --- | --- |
| Prompts you typed, queued, or never sent | Tool calls and their output |
| Slash commands, as `/name args` | Reasoning and thinking traces |
| The assistant's written replies | File contents, diffs, attachments |
| Session titles, dates, models, project paths | Injected context and system reminders |

Both agents route machinery through the same channel as your own messages, so
the readers filter by provenance rather than by shape: Claude Code rows must be
attributed to a person (`promptSource`, `origin.kind`), and Codex rows must not
be one of the context blocks the CLI prepends to a turn. Compaction summaries,
task notifications, and interrupt notices are dropped. Subagent transcripts are
excluded unless you ask for them.

Prompts hide in more places than the obvious one. A prompt typed while the
agent is busy is recorded by Claude Code as a queued attachment, and one that
the session never got around to delivering appears nowhere else — on the
corpus this was built against, that was 309 prompts, 17% of the total. Codex
wraps a pasted image in a tag holding a clipboard temp path, and prefixes a
prompt with a manifest when you attach files; both are stripped so the path
does not become part of the analysed text. Prompts are also read back out of
Codex compaction records, for threads that resume after their original rollout
is gone.

## History older than the transcripts

Both CLIs prune session transcripts. On the machine this was built against,
transcripts reached back 40 days — and a transcript disappeared while the tool
was being written.

Both also keep a prompt history outside those transcripts, in
`~/.claude/history.jsonl` and `~/.codex/history.jsonl`, and it reaches much
further back. memory-pack reads them by default: a prompt whose session still
has a transcript is skipped as a duplicate, and one whose session was pruned
rebuilds that session from its prompts. On the same machine that turned 40 days
into 110, and 5,421 prompts into 18,538.

A rebuilt session has prompts but no replies, because the replies are genuinely
gone. Codex sessions rebuilt this way keep their names, which survive in
`session_index.jsonl`. Pass `--no-history` to pack only sessions with a
surviving transcript.

## Why the archive is so much smaller

It is not compression. Almost none of a transcript is conversation:

| Claude Code | | Codex | |
| --- | --- | --- | --- |
| Tool output, stored twice | 56% | Tool output | 48% |
| JSON structure and ids | 12% | Restated event envelopes | 43% |
| Token-usage bookkeeping | 7% | Reasoning traces | 3% |
| Thinking and tool calls | 11% | Compaction records | 3% |
| **Conversation** | **1.7%** | **Conversation** | **0.2%** |

Claude Code writes each tool result twice, once inside the message and again
in a `toolUseResult` sibling. Codex records every item once as a
`response_item` and again as an `event_msg` envelope — checked across 410
rollouts, those envelopes held no text that was not already recorded.

## Privacy

Everything happens on your machine. `memory-pack` makes no network calls, and
Memory Map analyses the archive in your browser without uploading it to an
application server.

Credential-shaped tokens — API keys, personal access tokens, PEM private key
blocks — are masked before anything is written. That is a safety net, not a
guarantee: the archive still holds what you typed, so treat it as you would
your own notes. `--no-redact` turns masking off and the run says so when you do.

## Options

| Flag | Effect |
| --- | --- |
| `-o, --output <PATH>` | Where to write the archive |
| `--source <all\|claude\|codex>` | Which agent to read |
| `--since <YYYY-MM-DD>` | Only sessions last active on or after this date |
| `--list` | Print one line per session |
| `--no-history` | Pack only sessions with a surviving transcript |
| `--no-usage` | Leave out the token and tool accounting |
| `--dry-run` | Report what would be packed, write nothing |
| `--no-assistant` | Pack only your prompts |
| `--no-redact` | Leave credential-shaped tokens unmasked |
| `--include-subagents` | Also pack subagent transcripts |
| `--max-message-chars <N>` | Truncate any single message |
| `--claude-dir`, `--codex-dir` | Read from somewhere other than `~/.claude`, `~/.codex` |

## What comes out

```
conversations.json   Your conversations, in the same shape as a ChatGPT data
                     export, so Memory Map's existing reader handles them.
efficiency.json      Token and tool accounting per session.
memory-pack.json     What was packed, from which source, with which options.
README.txt           The same explanation, for anyone who opens the ZIP.
```

## What your sessions cost

Both CLIs record how many tokens every turn consumed, and both record every
tool call. None of that is conversation, so it stays out of
`conversations.json` — but it is what explains why a session was expensive, so
it is collected separately into a few hundred kilobytes of `efficiency.json`.

Per session: turns, token totals, tool and shell-command frequencies, and the
three kinds of waste a transcript can prove rather than guess at — calls that
repeated an earlier call exactly, calls that failed, and reads that pulled in a
whole file. Polling tools are excluded from the repeat count, since calling
them again with the same arguments is the point of them.

The number that matters is context re-read: every turn re-reads the session so
far, so a turn late in a long session costs several times what the same turn
costs early on. On the corpus this was built against, sessions of 250 turns and
up cost 226k tokens per turn against 70k for sessions under 25 turns. Memory
Map turns that into findings with actions attached. `--no-usage` skips it.

## npm

`npm/` holds a launcher package that resolves one prebuilt binary per platform,
the way esbuild does, so `npx memory-pack` needs no compile step. It is built
and tested but not published; the release workflow publishes it once a
repository variable `PUBLISH_TO_NPM` is set to `true` and an `NPM_TOKEN` secret
exists. The installer above does not depend on it.

## Release

Releases are built by `.github/workflows/memory-pack-release.yml` in
[chatgpt-memory-insights](https://github.com/sarthakagrawal927/chatgpt-memory-insights). Running it
manually (`gh workflow run memory-pack-release.yml`) builds and uploads all five
binaries as workflow artifacts without publishing anything, so it doubles as a
release dry run. Pushing a `memory-pack-v<version>` tag, after bumping the
version in `Cargo.toml` and `npm/package.json`, builds the same matrix and
publishes a GitHub Release with `SHA256SUMS`, which `install.sh` then resolves.

## Develop

```sh
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```
