# memory-pack

Turns the Claude Code and Codex transcripts already on your machine into one
ZIP that [Memory Map](https://chatgpt.significanthobbies.com) can read.

```sh
npx memory-pack
```

No package manager? `curl -fsSL https://chatgpt.significanthobbies.com/install.sh | sh`
installs the same binary directly.

That reads `~/.claude` and `~/.codex`, writes `memory-pack-<date>.zip`, and
tells you what went in. Upload the ZIP without unzipping it.

Look before you write:

```sh
npx memory-pack --dry-run --list
```

Both agents keep a complete record of every session, but almost all of it is
tool traffic — commands, file contents, diffs, reasoning traces. memory-pack
keeps the conversation and leaves the machinery behind, so gigabytes of
transcripts become an archive of a few megabytes.

It also reads the prompt history both CLIs keep outside their transcripts,
which reaches back much further, so sessions the CLIs have already pruned are
still in the archive.

Everything runs on your machine. No network calls, and credential-shaped
tokens are masked before anything is written.

Full documentation, options, and the complete account of what is kept and
dropped: <https://github.com/sarthakagrawal927/chatgpt-memory-insights/tree/main/packer>
