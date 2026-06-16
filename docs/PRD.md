# PRD — Narrative Code Review Experience

> Verbatim product requirements provided by the project owner. This is the source of truth for UX scope. Engineering decisions derived from it live in `ARCHITECTURE.md`.

## Overview

The product is an AI-assisted code review tool that layers on top of an existing Git/GitHub workflow. Rather than presenting a pull request as a single flat diff, it reframes the PR as a structured, narrative "reading" experience: an AI agent reads the changes, writes a high-level summary, and segments the work into risk-rated thematic "chapters" that a reviewer walks through sequentially. The goal is to reduce reviewer cognitive load on large or complex PRs, surface risk earlier, and make reviews faster and more thorough.

## Problem & Goals

Large pull requests are hard to review well: reviewers face an undifferentiated wall of diffs, lack context on intent, and struggle to know where to focus. This leads to slow reviews, missed regressions, and superficial approvals. The product aims to give reviewers immediate context before they read code, to triage attention toward the riskiest changes, to group related changes into digestible units, and to track review progress so nothing is skipped, all without forcing teams to abandon GitHub.

## Target Users

The primary users are software engineers who review pull requests and the authors who open them, working within teams that host code on GitHub and want a higher-quality, faster review process.

## Core Concepts

The central abstraction is the **Chapter**: a thematic grouping of related changes representing one logical sub-problem within a PR, carrying its own risk rating, diff statistics, file set, and AI-written explanation. Above the chapters sits the **Prologue**, an AI-generated orientation summary of the entire PR. Together these turn a PR into a guided reading flow rather than a diff dump.

## Functional Requirements

### PR Overview & Prologue

The system must generate and display a Prologue that orients a reviewer before they read any code. It presents structured sections covering why the PR exists (the user-facing problem), what it does (the resolution), key changes (a short bulleted list with a headline and explanatory sentence each), and a review focus that names the riskiest area and the specific file to scrutinize. A Description tab must preserve the author's original PR description alongside the AI Prologue. The interface must indicate which content is AI-generated and expose generation info for both the Prologue and the Chapters.

### Chapter Generation & Listing

The system must use an AI agent to break the PR into ordered chapters grouped by theme rather than by file or directory. Each chapter in the list must display its title, a risk rating (Low, Medium, High), its line-change statistics, and a file count. The chapter list must provide a clear entry point to begin reviewing and per-chapter progress indicators.

### Chapter Review Screen

Selecting a chapter must open a split-pane review screen. One pane holds a persistent context panel showing the chapter title, risk badge, change stats, an AI-written explanation of the change and what to verify, and a filterable file tree scoped to that chapter. The other pane renders the code diffs for only the files belonging to that chapter. The reviewer must be able to navigate to the next and previous chapters and access a chapter-level actions menu.

### Diff Viewing & Customization

The diff viewer must support both unified and split (side-by-side) layouts. It must offer a display settings panel that lets the reviewer select a syntax-highlighting theme, choose the change-indicator style, set inline-diff granularity (including word-level highlighting), and toggle backgrounds, line wrapping, line numbers, and inline minimization. Large unchanged regions must be collapsed into expandable summaries (e.g. "225 unmodified lines"), and the reviewer must be able to expand the full file for additional context. Each file must offer per-file controls to collapse the file, copy its filename, expand it fully, and mark it as viewed.

### Progress Tracking & Review Submission (later phase)

The system must let reviewers mark individual files and whole chapters as viewed, and reflect this progress in the chapter list and indicators. A top-level Review control must allow the reviewer to submit an overall verdict on the PR, and a "collapse all files" control must help manage the view.

### Collaboration & Integration (later phase)

The product must integrate with GitHub, including the ability to open the corresponding PR directly in GitHub and to copy the branch name. It must surface standard PR metadata such as author, open time, base and head branches, and CI check status. It must provide an Activity view of PR events, a Chat panel for discussion, the ability to add reviewers, and a per-PR draft/status indicator. An AI assistant ("agent") must be toggleable within the review surface.

### Conversational AI Assistant (later phase)

The product must provide an in-context AI agent that reviewers can invoke while reviewing, enabling questions about the changes within the PR context.

## Non-Goals

The product does not replace the underlying Git hosting platform; it augments GitHub rather than storing the source of truth. It does not aim to fully automate approval decisions — the human reviewer remains the decision-maker, with the AI providing structure and context.

## Success Metrics

Success should be measured by reductions in time-to-first-review and total review cycle time, increases in review thoroughness (for example, comments or issues caught per PR and fewer post-merge regressions), reviewer adoption and retention of the chapter-based flow over the raw diff, and reviewer-reported confidence and satisfaction.

## Key Risks & Considerations

The most important risk is the accuracy of AI-generated chapters, summaries, and risk ratings: incorrect groupings or misstated risk could mislead reviewers, so generated content must be transparently labeled, traceable to actual diff hunks, and never fabricate changes. Performance on very large PRs, correct handling of files that span multiple themes, and keeping the GitHub integration in sync are additional considerations.
