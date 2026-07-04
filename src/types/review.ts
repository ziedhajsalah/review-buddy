/**
 * Review Buddy type contracts.
 *
 * Two shapes — keep them distinct:
 *  - Agent contract  (submit_review input): narrative + grouping + hunk anchors.
 *  - UI/server contract (GET /api/review):  agent JSON merged with the real diff,
 *                                           PR metadata, server meta, computed stats.
 *
 * See docs/review-contract.md and schemas/review.schema.json.
 */

export type Risk = "Low" | "Medium" | "High";
export type ChangeType = "added" | "modified" | "deleted" | "renamed";

/* ------------------------------------------------------------------ */
/* Shared narrative shapes (identical across both contracts)           */
/* ------------------------------------------------------------------ */

export interface KeyChange {
  headline: string;
  detail: string;
}

export interface ReviewFocus {
  /** Concrete check, phrased for a reviewer who hasn't seen the code. */
  summary: string;
  /** The single file to scrutinize most. */
  file: string;
}

export interface Prologue {
  why: string;
  what: string;
  key_changes: KeyChange[];
  review_focus: ReviewFocus;
}

/* ------------------------------------------------------------------ */
/* 1. AGENT CONTRACT — submit_review input                             */
/* ------------------------------------------------------------------ */

/** Anchor only — references a hunk by its @@ header start lines. No content. */
export interface HunkAnchor {
  old_start: number;
  new_start: number;
}

export interface AgentReviewFile {
  path: string;
  change_type: ChangeType;
  /** Omit ⇒ the whole file belongs to this chapter. */
  hunks?: HunkAnchor[];
}

export interface AgentChapter {
  index: number;
  title: string;
  risk: Risk;
  risk_reason: string;
  /** Advisory; the tool recomputes authoritative stats from the real diff. */
  additions?: number;
  deletions?: number;
  description: string;
  files: AgentReviewFile[];
}

/** Exactly what the agent emits via submit_review. */
export interface AgentReview {
  prologue: Prologue;
  chapters: AgentChapter[];
}

/* ------------------------------------------------------------------ */
/* 2. UI/SERVER CONTRACT — GET /api/review output                      */
/* ------------------------------------------------------------------ */

export interface ReviewMeta {
  aiGenerated: boolean;
  generatedBy: string;   // model id
  generatedAt: string;   // ISO timestamp
  promptVersion: string;
}

/** Source B — from git/gh, not the agent. */
export interface PrMetadata {
  title: string;
  description: string;   // author's original PR body (markdown)
  author: string;
  createdAt: string;
  base: string;
  head: string;
  url?: string;          // phase 2
  ciStatus?: string;     // phase 2
}

/** A resolved hunk: anchor + real content attached from git diff (B). */
export interface ResolvedHunk {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  header: string;        // full @@ ... @@ line
  /** Real unified-diff lines (" ctx", "+add", "-del"). */
  lines: string[];
}

export interface ResolvedFile {
  path: string;
  change_type: ChangeType;
  additions: number;     // tool-computed
  deletions: number;     // tool-computed
  language: string;      // derived from extension
  hunks: ResolvedHunk[]; // resolved from B, scoped to this chapter
}

export interface ResolvedChapter {
  index: number;
  title: string;
  risk: Risk;
  risk_reason: string;
  additions: number;     // tool-computed
  deletions: number;     // tool-computed
  fileCount: number;
  description: string;
  files: ResolvedFile[];
}

export interface ReviewStats {
  additions: number;
  deletions: number;
  filesChanged: number;
}

/** Exactly what GET /api/review returns to the React app. */
export interface ResolvedReview {
  meta: ReviewMeta;
  pr: PrMetadata;
  prologue: Prologue;
  stats: ReviewStats;
  chapters: ResolvedChapter[];
}

/* ------------------------------------------------------------------ */
/* Client-only view state (source D — cookies/localStorage)            */
/* ------------------------------------------------------------------ */

export type DiffLayout = "unified" | "split";

export interface DisplaySettings {
  layout: DiffLayout;
  theme: "auto" | "light" | "dark";
  changeIndicator: "classic" | "bars" | "none";
  granularity: "line" | "word";
  wrap: boolean;
  lineNumbers: boolean;
  backgrounds: boolean;
}
