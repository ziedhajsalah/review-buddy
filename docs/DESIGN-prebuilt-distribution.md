# Design: Prebuilt viewer distribution (Plan 016 — Step 1 gate)

**Status:** implemented in plan 016 (committed multi-file `dist/`). This records
the Step-1 decision gate that chose the distribution shape, and the verification
evidence behind it. Companion:
`build-plan.md` (stack + open questions) and `ARCHITECTURE.md` (the hook serves
`src/ui/dist` via `uiDir()`).

## The problem

Install required clone → `bun install` → a **manual `bun run build`** of the
viewer. Every user paid a Node-toolchain build for identical bytes, and a stale
`dist/` after `git pull` was a foreseeable support issue. Because Claude Code
plugin installs are **git clones**, committing a prebuilt viewer artifact to the
repo makes `/plugin install` work with zero build steps. That is the goal;
"single-file" (the plan's recommended default) was only a *mechanism*.

## The gate: single-file is the wrong mechanism here

`@pierre/diffs` resolves syntax grammars through Shiki's full `bundledLanguages`
map (`dist/highlighter/languages/resolveLanguage.js` statically references the
whole map — every value is a `() => import("shiki/langs/X")`). Vite therefore
emits **one lazy chunk per language**: measured, `src/ui/dist/assets/` is **306
JS chunks + themes = 9.88 MB**, of which the core app entry is only **857 KB**.

`vite-plugin-singlefile` forces `inlineDynamicImports`, which would merge all 306
reachable chunks into one entry → an `index.html` of **~9.9 MB**. That sits on
the plan's own **STOP line (~10 MB)** on day one and crosses it at the next Shiki
bump — and a ~10 MB minified-JS blob, rewritten on every UI change, is
non-delta-compressible git bloat.

The decisive fact: **our own Bun server always serves the viewer**
(`src/server/http.ts` serves `dist/index.html` *and* `dist/assets/*` with a
path-traversal allowlist). There is no `file://` / no-server / must-paste-one-file
constraint — the only thing single-file bundling solves. Here it is pure
ceremony.

## Options weighed (with real numbers)

| Option | Single file? | Size | Feature loss | Long-term git churn |
|---|---|---|---|---|
| **A.** Naive single-file (all langs) | yes | ~9.9 MB | none | ~10 MB re-committed **per UI change** |
| **B.** Curated single-file (~30 langs) | yes | ~2.5 MB | highlighting lost for uncovered langs (plaintext) | ~2.5 MB per UI change; fragile Shiki override |
| **C.** Commit multi-file `dist/` | no (307 files) | ~10 MB across hash-named chunks | none | **~870 KB** per UI change (grammars hash-stable) |

**Chosen: C.** It honors the *goal* (zero-build install) without the STOP
condition, keeps every language (a review tool must highlight any repo), needs no
library surgery, and has the **lowest long-term churn** — grammar chunks are
content-hashed and stable, so a UI-source change rewrites only the small core
chunk, not the 9 MB of grammars. B was rejected for the fragile
`bundledLanguages` override and the silent fidelity regression; A for the
size/churn. (An independent advisor pass reached the same C > B ≫ A ranking.)

Operator signed off on the deviation from the single-file default (the plan makes
both ">10 MB" and "contradicts the Step-1 default" explicit STOP-and-ask
conditions).

## Verification evidence (the gate's load-bearing checks)

C's entire advantage rests on two claims, both verified empirically before
committing:

1. **Deterministic build.** Two clean rebuilds from identical source produced a
   **byte-identical** `dist/` (`diff -rq` clean; no sourcemaps emitted). This is
   what lets `verify:dist-fresh` use a plain `git diff --exit-code -- src/ui/dist`
   check rather than the plan's mtime fallback. This was verified on **macOS**;
   the check itself is the cross-platform enforcement — CI runs `verify:ci`
   (which ends in `verify:dist-fresh`) on `ubuntu-latest`, so a Linux/Rollup hash
   divergence would **fail the PR**, not ship silently. Vite/Rollup hashes are
   content-based and inputs are pinned via frozen lockfiles + LF-normalized
   source, so divergence is unlikely; if it ever happens, the fix is to document
   the platform constraint here rather than weaken the check.

   **Gotcha found & fixed:** Tailwind v4's `@import "tailwindcss"` auto-detects
   content across the **whole repo**, so plain English in `docs/`/`README.md`
   (words like "absolute", "container", "shadow") leaked incidental utilities
   into the bundle — making the CSS a function of repo-wide prose, not UI source.
   That would spuriously fail this freshness check on doc-only PRs. Fixed by
   scoping detection to the viewer tree: `@import "tailwindcss" source(".")` in
   `src/ui/src/index.css`. Verified: an adversarial repo-root doc full of
   class-like words leaves the CSS byte-unchanged, and the scoped output matches
   the pristine pre-docs build exactly (no real component classes dropped).
2. **Cascade is contained.** Changing one emitted string in a React component and
   rebuilding rewrote **only** the core chunk (`index-[hash].js`, hash-renamed)
   and `index.html` — the ~300 grammar chunks were untouched. So per-UI-change
   churn is ~870 KB, as the table claims. (A comment-only change is optimized
   away entirely — the test must alter emitted output to be meaningful.)

Note: the 622 KB `wasm-*.js` chunk is the WebAssembly-*language* grammar, not the
oniguruma engine — we use `shiki-js` (`createJavaScriptRegexEngine`, no
`shiki/wasm` import), so it behaves like any other hash-stable grammar chunk.

## How it's kept fresh

- **`.gitignore`** re-includes `src/ui/dist/**` despite the generic `dist/` rule.
- **`.gitattributes`** marks it `linguist-generated -diff` — out of PR diffs and
  language stats; reviewers verify the CI check, not the bytes.
- **`verify:dist-fresh`** (package.json) is the one canonical freshness check:
  `git add --intent-to-add -- src/ui/dist && git diff --exit-code -- src/ui/dist`
  — fails when `src/ui/dist` drifted from git (`--intent-to-add` also surfaces
  brand-new chunks from a Shiki bump, not just modified files). It's the last
  step of `verify:ci`, so **CI** (`.github/workflows/ci.yml`, one `verify:ci`
  step) enforces it after building the UI; contributors run the same command
  locally. No bespoke CI shell — one owner for the invariant.
- **`scripts/release.sh`** rebuilds (`build:ui`) and stages `src/ui/dist` with
  every release, so each release ships a current viewer.

## Follow-ups (out of scope here; recorded)

- **Runtime grammar serving.** Externalize the grammar imports and serve them
  from the installed `shiki` package, committing only the ~870 KB core. Elegant
  but needs the same fragile build-surgery as option B plus a custom endpoint —
  revisit only if repo size actually hurts.
- **Strict CSP for `/`.** Plan 012 deferred CSP "until the single-file decision
  settles." With a committed multi-file artifact served from one origin, an
  inline-allowing CSP header for viewer responses is now a feasible follow-up.
