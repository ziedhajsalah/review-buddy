# Review Buddy

AI-assisted **narrative code review** for Claude Code.

Most PRs are reviewed as an undifferentiated wall of diffs. Review Buddy reframes a PR as a guided reading: an AI agent reads the changes, writes a high-level **Prologue** (why / what / key changes / where to focus), and segments the work into risk-rated thematic **Chapters** you walk through in a browser.

## How it works

1. You run a `/review` command in Claude Code.
2. The agent analyses the diff and calls a custom `submit_review` tool with a structured review.
3. A `PreToolUse` hook intercepts the call, captures the real `git diff` + PR metadata, resolves the agent's chapter *anchors* onto the authoritative hunks, starts a loopback-only local server, and opens the browser.
4. A prebuilt React app renders the Prologue and Chapters, with a rich unified/split diff viewer.

The agent provides **judgment and structure**; the actual diff bytes come from git. This **reference-not-reproduce** rule is load-bearing — the agent never echoes diff content, so it can't fabricate changes. See `CLAUDE.md` for the full architecture.

## Status

**v0.0.1 — Phase 1 shipped** (one-way viewer). What's in:

- **Backend** — `submit_review` MCP tool, `/review` skill, and a blocking `PreToolUse` hook that captures the diff, resolves chapters (unclaimed changes bucketed into "Unsorted changes"), recomputes stats, and serves a hardened local app (loopback-only bind, Host-header validation, per-server token, path-traversal allowlist).
- **Viewer** — Vite + React 19 + Tailwind v4 on [`@pierre/diffs`](https://www.npmjs.com/package/@pierre/diffs): Prologue/Description overview, risk-rated chapter cards, split-pane chapter review, unified/split diffs with word-level + syntax highlighting, per-file controls, cookie-persisted display prefs. Agent prose and the PR description render as **markdown** (`react-markdown` + GFM, no raw HTML).

**Deferred to later phases:** viewed-state round-trip + verdict submission (Phase 2), GitHub collaboration / Activity / Chat (Phase 3), conversational assistant (Phase 4). In the viewer: expand-full-file, shadow-DOM theming, single-file bundling.

## Installation

Review Buddy is a **Claude Code plugin**. It registers an MCP server (`review-buddy`, exposing the `submit_review` tool) and a `PreToolUse` hook that renders the review in your browser.

### Prerequisites

- [Claude Code](https://docs.claude.com/en/docs/claude-code)
- [Bun](https://bun.sh) ≥ 1.3 — the MCP server and hook run on it (`curl -fsSL https://bun.sh/install | bash`)
- `git` — reviews are built from your working-tree diff
- *(optional)* [GitHub CLI](https://cli.github.com) (`gh`), authenticated — only needed to review a GitHub **PR** instead of the local diff

### Install

The browser viewer isn't shipped prebuilt, so you clone, build it once, then add the local checkout as a plugin marketplace.

```bash
# 1. Clone and build the viewer
git clone https://github.com/ziedhajsalah/review-buddy
cd review-buddy
bun install
( cd src/ui && bun install && bun run build )   # produces src/ui/dist — required
```

```text
# 2. In Claude Code, register and install the plugin (use the absolute path from step 1)
/plugin marketplace add /absolute/path/to/review-buddy
/plugin install review-buddy@review-buddy
```

Restart Claude Code (or reload plugins) if prompted, so the MCP server and hook load.

> If you skip the `bun run build` step the review still opens, but the viewer shows a placeholder instead of the diff UI.

### Use it

From any repo, in Claude Code:

```text
/review              # review the current working-tree diff (uncommitted changes)
/review 42           # review GitHub PR #42 — via `gh pr diff`, no checkout needed
```

The agent tells the hook what it reviewed (working tree vs PR) so the hook captures the *same* diff — you don't have to check the PR branch out. The agent then reads the diff, writes the Prologue + Chapters, and a browser tab opens with the review; Claude Code blocks until you click **Done** in the tab.

> For a PR whose branch isn't checked out, the diff renders fully, but "expand full file" may be empty (those bytes aren't on disk).

### Update / uninstall

```text
/plugin marketplace update review-buddy    # after a git pull + rebuild
/plugin uninstall review-buddy@review-buddy
```

## Layout

```
src/
  mcp/server.ts      # MCP server exposing submit_review
  cli/index.ts       # PreToolUse hook entry (open-review)
  server/            # diff capture, chapter resolution, local HTTP server, browser open
  ui/                # Vite + React 19 + Tailwind v4 viewer (@pierre/diffs)
  types/review.ts    # shared agent + UI/server contracts
docs/                # PRD, ARCHITECTURE, agent-prompt, review-contract, build-plan
schemas/             # review.schema.json = submit_review input schema
examples/hooks.json  # example Claude Code plugin hook config
```

## Development

Backend runs on [Bun](https://bun.sh); the viewer is a separate Vite package.

`bun run verify` is the fast local loop (tests + both typechecks); `bun run verify:ci` is the exact gate CI runs on every pull request and on pushes to `main`/`develop` (it adds the UI production build). Run `bun run verify:ci` before opening a PR. Note that `verify` assumes deps are already installed in both packages (run the `bun install` steps first).

```bash
bun run verify         # fast local loop: backend tests + backend & UI typechecks
bun run verify:ci      # full gate CI runs: verify + UI production build
bun install            # backend deps
bun test               # backend tests
bun run typecheck      # backend tsc

cd src/ui
bun install
bun run dev            # viewer dev server (proxies /api → 127.0.0.1:5199)
bun run build          # typecheck + production build
```

See `docs/build-plan.md` for the phased task breakdown and `docs/review-contract.md` for the agent vs UI/server contracts.

## Inspiration

Built on patterns from [Plannotator](https://github.com/backnotprop/plannotator).
