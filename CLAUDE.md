# Review Buddy

An AI-assisted **narrative code review** tool for Claude Code. Instead of showing a pull request as one flat diff, an agent reads the changes, writes a high-level **Prologue**, and segments the work into risk-rated thematic **Chapters** that a reviewer walks through sequentially in a browser UI.

> **Status:** greenfield. This repo currently contains the design kit (docs + contracts) only — no implementation yet. Start with `docs/build-plan.md`.

## What it does (target flow)

```
User runs /review (skill with the structuring prompt)
        ↓
Agent reviews the diff/PR, then calls the custom tool  submit_review(<review JSON>)
        ↓
Claude Code PreToolUse hook matches  mcp__plugin_review-buddy_review-buddy__submit_review
        ↓
Hook command: capture git diff + PR metadata, start a local server, open the browser
        ↓
Prebuilt React app loads → GET /api/review → renders Prologue + Chapters + diffs
```

This mirrors how Plannotator (`~/code/plannotator`, the inspiration) intercepts `ExitPlanMode` — except here we intercept **our own** MCP tool, because there is no built-in "review" tool.

## The decisions that shape everything (already made — do not re-litigate)

1. **Claude Code only** for now. We lean on Claude-specific hooks + MCP.
2. **Transport = custom MCP tool + `PreToolUse` hook.** The agent calls `submit_review(...)`; a `PreToolUse` hook intercepts it (chosen over `PermissionRequest` because `PreToolUse` always fires, even in auto-accept modes). The hook **blocks** the turn (long timeout) while the human reviews.
3. **One-way viewer first**, round-trip to the agent later. Build/test rendering first; keep the blocking hook so round-trip is a drop-in later (swap the "Done" response for "approve / request-changes + annotations").
4. **JSON = runtime state, served over REST.** One prebuilt React app fetches the review from a local server (`GET /api/review`). No per-review codegen/compile. (Plannotator's model.)
5. **The agent REFERENCES the diff; it does NOT reproduce it.** This is load-bearing — see below.

## The three data sources (critical mental model)

The agent's JSON is only the **narrative layer**. The UI needs three sources:

| Source | Provides | Origin |
|---|---|---|
| **A. Agent review JSON** | prologue, chapters, risk, descriptions, chapter→file grouping, hunk **anchors** | the `submit_review` tool call |
| **B. Real diff + PR metadata** | authoritative hunk content + line numbers, original PR description, author, base/head, CI | `git diff` / `gh`, run by the hook (cwd is local) |
| **C. Full file contents** | bytes *around* the diff, for expansion + word-level highlighting | `git show` / working tree, fetched on demand |

**Reference-not-reproduce rule:** the agent must NOT echo diff line content into JSON (LLMs corrupt whitespace, drop lines, miscount line numbers, and it doubles token cost — and it fights the PRD's own #1 risk: "never fabricate changes"). Instead the agent emits, per chapter, the file paths + hunk **anchors** (`old_start` / `new_start`). The tool parses the authoritative `git diff` (source B) and maps each real hunk onto a chapter by path+anchor. Hunk-level anchors also let one file span multiple chapters. The tool recomputes all stats (additions/deletions/file counts) from the real diff — treat agent-provided stats as advisory only.

See `docs/review-contract.md` for the exact **agent contract** vs **UI/server contract**, `schemas/review.schema.json` for the `submit_review` input schema, and `src/types/review.ts` for the TypeScript types.

## Repo map

```
review-buddy/
├── CLAUDE.md                  # you are here — orientation + decisions
├── README.md                  # short human overview
├── docs/
│   ├── PRD.md                 # product requirements (source of truth for UX)
│   ├── ARCHITECTURE.md        # data sources, flow, hook+server, endpoints, phasing
│   ├── agent-prompt.md        # the structuring prompt (revised: reference-not-reproduce)
│   ├── review-contract.md     # agent contract vs UI/server contract + examples
│   └── build-plan.md          # proposed stack + phased task breakdown — START HERE
├── schemas/
│   └── review.schema.json     # JSON Schema = submit_review inputSchema (agent output)
├── src/types/
│   └── review.ts              # TS types for both contracts
└── examples/
    └── hooks.json             # example Claude Code plugin hook config
```

## Phase 1 scope (what to build first)

Prologue + Description tab, chapter list, chapter review split-pane, diff viewer (unified/split, display settings, collapse "N unmodified lines" / expand full file, word-level granularity), per-file controls (collapse / copy name / expand / mark viewed locally).

**Deferred to later phases** (per PRD): viewed-state persistence round-trip, verdict submission, GitHub collaboration (open PR, copy branch, reviewers, CI), Activity view, Chat, conversational AI assistant.

## Reference implementation

Plannotator at `~/code/plannotator` solves nearly the same problems. Useful files to mine:
- `apps/hook/hooks/hooks.json` — hook wiring pattern.
- `packages/server/review.ts` — review server + endpoints (`/api/diff`, `/api/file-content`, `/api/feedback`).
- `apps/review/vite.config.ts` — single-file HTML bundling (`vite-plugin-singlefile`).
- `packages/review-editor/` — diff viewer, file tree, split-pane UI.
