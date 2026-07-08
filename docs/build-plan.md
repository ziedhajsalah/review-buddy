# Build Plan

Phase 1 is shipped. This file is the shipped/deferred ledger: the stack
that was chosen, what Phase 1 delivered, and what's deferred to Phases 2–4. For
orientation read `CLAUDE.md` and `docs/ARCHITECTURE.md`; for install/dev see
`README.md`.

## Stack (chosen and shipped)

- **Runtime:** Bun — the MCP server and the `PreToolUse` hook both run on it.
- **MCP server:** `@modelcontextprotocol/sdk` (TypeScript) exposing one tool,
  `submit_review`, whose `inputSchema` is `schemas/review.schema.json`.
- **UI:** React 19 + Vite + Tailwind v4; diffs via `@pierre/diffs` with syntax
  highlighting by Shiki (`shiki-js`). A single self-contained HTML bundle
  (`vite-plugin-singlefile`) is still deferred — see Open questions.
- **Diff parsing:** we parse `git diff` ourselves (`src/server/`); word-level
  intra-line highlighting is done client-side by `@pierre/diffs`.
- **HTTP server:** `Bun.serve` for `/api/*` — loopback-only bind with a
  per-server token.

## Phase 1 — One-way narrative viewer ✅ shipped

Goal (met): agent → `submit_review` → hook → browser renders Prologue +
Chapters + diffs. No round-trip.

1. ✅ **MCP server + tool.** The `review-buddy` MCP server exposes
   `submit_review` (schema-validated); registered as a Claude Code plugin server.
2. ✅ **`/review` skill.** `skills/review/SKILL.md` is the structuring prompt
   (`disable-model-invocation: true`; runs on request). It instructs the agent
   to analyze the diff and call `submit_review` — including the load-bearing
   `source` field so the hook re-captures the same diff.
3. ✅ **Hook command (`open-review`, `src/cli/index.ts`).** On the `PreToolUse`
   interception: read the agent JSON from stdin; in `cwd` capture `git diff`
   (source B) + PR metadata (`gh` when available); parse the diff into files →
   hunks and **resolve** chapters by matching agent anchors, bucketing unclaimed
   hunks into "Unsorted changes"; recompute stats; start the local server, open
   the browser, and **block** until `POST /api/done`.
4. ✅ **Server endpoints.** `GET /api/review`, `GET /api/file-content`,
   `POST /api/done`.
5. ✅ **React app.** Prologue/Description overview (AI badge + `meta`, risk-rated
   chapter cards); split-pane chapter review (context panel + filterable
   chapter-scoped file tree + diff pane); diff viewer with unified/split, display
   settings (theme, indicator, granularity incl. word-level, wrap, line numbers,
   backgrounds, minimize), "N unmodified lines" collapse, and per-file controls
   (collapse, copy filename, mark viewed locally); display prefs + viewed flags
   persisted client-side.
6. ✅ **End-to-end** against real diffs — resolved hunks match `git diff`
   exactly (the point of reference-not-reproduce).

"Expand full file" (Phase 1) shipped in plan 015 — the viewer fetches
`/api/file-content` and renders the whole file via `@pierre/diffs`' full-file
path (`parseDiffFromFile` → `<FileDiff expandUnchanged>`); see
`docs/DESIGN-expand-full-file.md`. Still open: "N unmodified lines" expanders
*between* hunks, and rename base-side expansion (needs an endpoint allowlist change).

## Phase 2 — Progress & round-trip

- Persist viewed state (files/chapters) → `POST /api/file-viewed`; reflect in
  the chapter list.
- Verdict submission: `POST /api/feedback`; hook returns
  `permissionDecision: "deny"` with annotations as `permissionDecisionReason`
  so the agent acts on feedback. "Collapse all files" control.

## Phase 3 — Collaboration & integration

- GitHub: open PR, copy branch, author/open-time/base/head/CI via `gh`. Activity
  view, Chat, add reviewers, draft/status indicator.

## Phase 4 — Conversational assistant

- In-context AI agent (`/api/ai/*`) for questions within the PR context.

## Open questions (still open)

- **Single-file HTML / prebuilt distribution:** ship the viewer as one
  self-contained HTML (`vite-plugin-singlefile`) and/or prebuilt, so install can
  skip the `bun run build` step.

Settled since planning: stack = Bun + `@pierre/diffs`/Shiki; distribution =
Claude Code plugin marketplace; diff base = worktree/pr/branch `source` routing;
viewed-state key = per `(chapter, file)`.

## Reference files in Plannotator (`~/code/plannotator`)

- `apps/hook/hooks/hooks.json` — hook wiring.
- `packages/server/review.ts` — `/api/diff`, `/api/file-content`, `/api/feedback`.
- `apps/review/vite.config.ts` — single-file bundling.
- `packages/review-editor/` — diff viewer, file tree, split-pane.
