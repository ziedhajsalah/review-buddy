# Design: Expand full file (Plan 015 — Step 1 gate)

**Status:** shipped. This is the Step 1 investigation gate that decided the
implementation shape, recorded per the plan's Done criteria ("Step 1 investigation
note exists with named `.d.ts` symbols"). Companion: `ARCHITECTURE.md`
(`/api/file-content` = source C) and `review-contract.md`.

"Expand the full file for additional context" is a PRD Phase-1 diff-viewer
requirement. The backend half (`GET /api/file-content?path=&side=base|head`,
allowlisted + containment-guarded) already shipped in plan 008; this plan wired a
UI consumer. The gate question was **how** `@pierre/diffs@1.2.8` supports it.

## The three Step-1 questions, answered from the `.d.ts`

Types are the docs. Symbols below are real exports of
`src/ui/node_modules/@pierre/diffs/dist/**`, verified — not guessed.

1. **Can the renderer take full file contents and render collapsed context (the
   GitHub model)?** **Yes.** `FileDiffMetadata.isPartial` (`dist/types.d.ts`) is
   the load-bearing flag: a diff *parsed from a patch* is `isPartial: true` and its
   docstring says **"hunk expansion is unavailable"**; a diff *generated from full
   file contents* is `isPartial: false` and carries **"the complete file
   contents"** in `additionLines` / `deletionLines`. The exported utility
   `parseDiffFromFile(oldFile: FileContents, newFile: FileContents, options?, throwOnError?): FileDiffMetadata`
   (`dist/utils/parseDiffFromFile.d.ts`) builds the `isPartial: false` form. The
   React `FileDiff` component (`@pierre/diffs/react`) then renders it, and
   `BaseDiffOptions.expandUnchanged?: boolean` (`dist/types.d.ts`) shows all
   context. Note `expandUnchanged` / `parseDiffOptions` are documented to have
   **"no effect on pre-parsed patches"** — so the existing
   `<PatchDiff patch={fileToPatch(file)}>` path (patch string ⇒ `isPartial: true`)
   structurally *cannot* expand. That asymmetry is exactly why the endpoint had no
   consumer.

2. **Do hunk separators support an expand callback/interaction?** **Yes, and it's
   forward-compatible.** `HunkData.expandable?: { chunked, up, down }`,
   `ExpansionDirections = 'up' | 'down' | 'both'`, `HunkExpansionRegion`, and the
   `FileDiff` class methods `expandHunk(hunkIndex, direction, …)` /
   `handleExpandHunk` exist. This is the machinery for "N unmodified lines *between*
   hunks" (option b). It also only works once the renderer holds the full file
   (`isPartial: false`) — same prerequisite as (1). Left as a follow-up (see below).

3. **Fallback — regenerated wide-context patch?** Not needed; (1) is native.

## Chosen mechanism (preference #1 — native full-file)

Fetch authoritative base+head bytes from `/api/file-content` → `parseDiffFromFile`
→ `<FileDiff fileDiff={meta} options={{ …toDiffOptions, expandUnchanged: true }} disableWorkerPool />`.
Least code, lowest fidelity risk (the library owns the diff computation; we supply
git's bytes). Lives in `src/ui/src/lib/expand.ts` (`requiredSides`, `canExpand`,
`buildExpandedDiff`) + the Expand control in `FileDiffCard.tsx`.

**Reference-not-reproduce still holds.** The bytes are git's, served by the hook;
we only re-frame them. jsdiff (inside `parseDiffFromFile`) may group hunks slightly
differently from `git diff`, but line **content** is authoritative. This only
affects the opt-in expanded view; the collapsed default stays git-hunk authoritative
via `<PatchDiff>`.

**Fidelity contract (verified by test).** `additionLines` / `deletionLines` keep
each line's trailing `\n` embedded, so the byte-exact reconstruction is
`lines.join("")` — **not** `join("\n")`. `expand.test.ts` asserts
`additionLines.join("") === head` and `deletionLines.join("") === base` for
trailing-newline, no-trailing-newline, and added-file cases; an out-of-band check
also confirmed byte-exact reconstruction of a real 200+ line file with three
separated edit regions, plus CRLF and no-newline-at-EOF. This is the deterministic
form of the plan's Step 4 manual fidelity check.

**Empty-content contract (plan 008).** A *required* side arriving as `""` (missing
on disk / PR-mode unavailable) means unavailable — `canExpand` returns false and the
card shows a muted "Full file unavailable" notice instead of rendering an empty file
as if it were real content. `requiredSides` encodes which sides matter:
`added` needs head only, `deleted` needs base only, everything else needs both. A
required side that *rejects* (non-2xx / network) surfaces the error string (Step 3).

## Follow-ups (out of scope here; recorded)

- **Rename base-side.** `allowedPaths` in `http.ts` is built from `f.path` only, so
  a rename's base bytes (at `old_path`) 403. Today that degrades gracefully to the
  "unavailable" notice — never wrong bytes. Full rename expansion needs the backend
  to allowlist `old_path` (a plan-008/002 endpoint change, explicitly out of scope
  for 015 per its STOP conditions).
- **"N unmodified lines" *between* hunks (option b).** The library supports it
  (`HunkData.expandable`, `expandHunk`), but wiring interactive separators needs the
  imperative instance. Full-file expansion (this plan) was the committed deliverable;
  inline inter-hunk expanders remain open.
- **Large files.** `/api/file-content` inlines the whole file as JSON; multi-MB
  files are a future backend pagination concern (`ARCHITECTURE.md` §Performance).
