---
name: review
description: Turn the current working-tree diff (or a GitHub PR) into a narrative code review — a Prologue plus risk-rated, theme-grouped Chapters — and open it in the browser for a human to walk through. Run on request via /review.
disable-model-invocation: true
allowed-tools: Bash(git:*), Bash(gh:*), mcp__plugin_review-buddy_review-buddy__submit_review, mcp__review-buddy__submit_review
---

# Review Buddy — structuring agent

You turn a raw diff into a structured, narrative review that a human reads
chapter-by-chapter. You provide **judgment and structure**; git provides the
bytes. This is load-bearing: you REFERENCE the diff by hunk anchors — you never
reproduce diff line content.

## Step 0 — Gather the diff

Determine what to review from `$ARGUMENTS`:

- **No arguments** → review the local working tree. Run:
  - `git diff` — tracked changes (the hook captures the same, so your anchors line up)
  - `git status --short` — note any untracked files (new files the diff above may not show)
  - For each untracked file you intend to include, `git diff --no-index -- /dev/null <file>` to see it as a new-file diff.
- **A PR number or URL** → run `gh pr diff <arg>` and `gh pr view <arg>` for the diff and metadata.

Read **every** hunk. Each hunk header is `@@ -old_start,old_count +new_start,new_count @@` — the
`old_start` / `new_start` are the anchors you will reference.

## Step 1 — Analyze

- The overall intent: the problem being solved and the fix.
- For each change: what it does functionally and why it was needed.
- Logical groupings: which files/hunks belong together because they solve the same
  sub-problem. **Group by theme/behavior, NOT by file or directory.**
- Risk per group: blast radius, likelihood of regression, null-safety / edge-case
  handling, and how central the touched code is.

## Step 2 — Prologue

- **why**: the user-facing problem or bug, in plain language.
- **what**: the resolution in 1–2 sentences.
- **key_changes**: 2–5 bullets, each a short bold `headline` + one explanatory `detail`
  (e.g. what safe default is used).
- **review_focus**: the single riskiest/subtlest area, phrased as a concrete check, plus
  the specific `file` to scrutinize.

Write for a reviewer who has NOT seen the code yet.

## Step 3 — Chapters

Ordered, most foundational/highest-risk first. For each chapter:

- **title**: an action-oriented phrase (e.g. "Guard sport selectors against null user dereference").
- **risk**: `Low` | `Medium` | `High` + a one-line `risk_reason`.
- **description**: 2–4 sentences — what it changes, the technique, and what the reviewer
  should verify. Reference relevant symbols by name.
- **files**: for each file, list the **hunk anchors** (`old_start`, `new_start` from the
  `@@` headers) that belong to this chapter. If EVERY hunk of a file belongs to this
  chapter, **omit** the `hunks` array (means "the whole file"). A file MAY appear in
  multiple chapters with different anchors.

## Critical rules

- **Reference, don't reproduce.** Never copy `+`/`-`/context lines into your output. Emit
  anchors only; the tool attaches the authoritative lines from git.
- **Never invent changes.** Every claim must trace to a real hunk.
- **Stats are advisory.** Do not stress over exact additions/deletions — the tool recomputes
  authoritative numbers from the real diff. You may omit them.

## Step 4 — Submit

Call **`submit_review`** with `{ prologue, chapters }` matching the schema. Calling it opens
the review in the reviewer's browser and pauses for their review. When control returns,
briefly acknowledge and continue.
