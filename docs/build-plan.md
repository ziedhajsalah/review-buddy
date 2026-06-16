# Build Plan

Start here in a fresh session. Read `CLAUDE.md` and `docs/ARCHITECTURE.md` first.

## Proposed stack (confirm before scaffolding)

- **Runtime:** Bun (matches the Plannotator reference; gives a fast single binary for the hook command). Node + tsx is a fine alternative.
- **MCP server:** `@modelcontextprotocol/sdk` (TypeScript) exposing one tool, `submit_review`, with `inputSchema` = `schemas/review.schema.json`.
- **UI:** React + Vite + Tailwind. Bundle to a single self-contained HTML via `vite-plugin-singlefile` (later optimization; a normal Vite build served by the local server is fine to start).
- **Diff parsing:** parse `git diff` ourselves, or use a library (e.g. `parse-diff`). Word-level highlighting via the `diff` package. Syntax highlighting via highlight.js or Shiki.
- **HTTP server:** Bun.serve (or node:http) for `/api/*`.

> These are recommendations, not yet locked. Confirm with the owner, then create `package.json`, `tsconfig.json`, and the Vite config.

## Phase 1 — One-way narrative viewer (build this first)

Goal: agent → `submit_review` → hook → browser renders Prologue + Chapters + diffs. No round-trip.

1. **MCP server + tool.** Stand up the `review-buddy` MCP server exposing `submit_review` (schema-validated). Register it for Claude Code.
2. **`/review` skill.** A skill whose body is `docs/agent-prompt.md`, instructing the agent to analyze the diff and call `submit_review`. (`disable-model-invocation: true` so it only runs on request.)
3. **Hook command (`open-review`).** On the `PreToolUse` interception:
   - Read tool input (agent JSON) from stdin.
   - In `cwd`: capture `git diff` (source B) and PR metadata (`gh pr view --json ...` when available; otherwise branch/diff stats).
   - Parse the diff into files → hunks; **resolve** chapters by matching agent anchors (`docs/review-contract.md` §resolution). Bucket unclaimed hunks into "Unsorted changes".
   - Compute stats; attach `meta` + `pr`.
   - Start the local HTTP server, open the browser, **block** until `POST /api/done`.
   - Return `{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }`.
4. **Server endpoints.** `GET /api/review`, `GET /api/file-content`, `POST /api/done`.
5. **React app.**
   - **Overview screen:** tabs `AI Prologue` (prologue) / `Description` (pr.description); AI-generated badge + `meta`; chapter list cards (title, risk badge, +/- stats, file count); "Begin review".
   - **Chapter review (split-pane):** left context panel (title, risk badge + reason, stats, description, filterable file tree scoped to chapter); right diff pane.
   - **Diff viewer:** unified/split, display settings (theme, indicator, granularity incl. word-level, wrap, line numbers, backgrounds, minimize), collapse "N unmodified lines" + expand full file (via `/api/file-content`), per-file controls (collapse, copy filename, expand, mark viewed locally).
   - **State:** display settings + local viewed flags in cookies/localStorage.
6. **End-to-end test** with a real PR. Verify resolved diffs match `git diff` exactly (the whole point of reference-not-reproduce).

## Phase 2 — Progress & round-trip

- Persist viewed state (files/chapters) → `POST /api/file-viewed`; reflect in chapter list.
- Verdict submission: `POST /api/feedback`; hook returns `permissionDecision: "deny"` with annotations as `permissionDecisionReason` so the agent acts on feedback. "Collapse all files" control.

## Phase 3 — Collaboration & integration

- GitHub: open PR, copy branch, author/open-time/base/head/CI via `gh`. Activity view, Chat, add reviewers, draft/status indicator.

## Phase 4 — Conversational assistant

- In-context AI agent (`/api/ai/*`) for questions within the PR context.

## Open questions to settle with the owner

- Stack confirmation (Bun vs Node; Shiki vs highlight.js).
- Diff base: PR three-dot (`base...head`) vs working-tree diff vs both (a "diff type" switcher like Plannotator).
- Viewed-state key when a file spans multiple chapters: per `(chapter, file)` or global per file.
- Distribution: Claude Code plugin/marketplace vs local `--plugin-dir`.
- Single-file HTML now or later.

## Reference files in Plannotator (`~/code/plannotator`)

- `apps/hook/hooks/hooks.json` — hook wiring.
- `packages/server/review.ts` — `/api/diff`, `/api/file-content`, `/api/feedback`.
- `apps/review/vite.config.ts` — single-file bundling.
- `packages/review-editor/` — diff viewer, file tree, split-pane.
