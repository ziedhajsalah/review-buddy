# Review Buddy

AI-assisted **narrative code review** for Claude Code.

Most PRs are reviewed as an undifferentiated wall of diffs. Review Buddy reframes a PR as a guided reading: an AI agent reads the changes, writes a high-level **Prologue** (why / what / key changes / where to focus), and segments the work into risk-rated thematic **Chapters** you walk through in a browser.

## How it works

1. You run a `/review` command in Claude Code.
2. The agent analyses the diff and calls a custom `submit_review` tool with a structured review.
3. A `PreToolUse` hook intercepts the call, captures the real `git diff`, starts a local server, and opens the browser.
4. A prebuilt React app renders the Prologue and Chapters, with a rich unified/split diff viewer.

The agent provides **judgment and structure**; the actual diff bytes come from git. See `CLAUDE.md` for the architecture and `docs/build-plan.md` to start building.

## Status

Design kit only — no implementation yet. Start at `docs/build-plan.md`.

## Inspiration

Built on patterns from [Plannotator](https://github.com/backnotprop/plannotator).
