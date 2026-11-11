/**
 * Rounds — what changed since the reviewer last asked for changes (plan 020).
 *
 * After "Request changes" the agent fixes and re-submits, and the reviewer sees
 * the review again. Without memory they also see every file as new work and
 * lose their viewed marks, because each submission is served on a new port and
 * so gets a new localStorage. These functions are that memory's logic: the
 * plugin's round store (apps/plugin/src/server/round-store.ts) holds the state
 * between rounds, and this module decides what it means.
 *
 * Runtime-neutral by contract (no node:crypto): the fingerprints are a plain
 * FNV-1a string hash. This is change detection, not security — nothing trusts
 * a fingerprint it did not write itself, and a collision costs one file shown
 * as unchanged, never a wrong diff.
 *
 * Nothing here stores diff text. A fingerprint is a number in hex, so the
 * state file carries no source code — the reference-not-reproduce rule
 * (CLAUDE.md) holds across rounds too.
 */
import type { ParsedFile } from "./diff.ts";
import type { CommentStatus, PreviousComment, ReviewComment, RoundInfo } from "./types.ts";

/**
 * What the plugin keeps between two rounds of one change. `round` is the
 * number of the round it was written for, so the next one is `round + 1`.
 */
export interface RoundState {
  round: number;
  /** path -> fingerprint of that file's diff. Hashes only, never diff text. */
  files: Record<string, string>;
  /**
   * Paths the reviewer had marked viewed, by path and not by chapter: the
   * agent may group its chapters differently next round.
   */
  viewed: string[];
  /** The reviewer's own line comments from that round. */
  comments: ReviewComment[];
  /** Ids of findings the reviewer dismissed, so they are not raised again. */
  dismissedFindings: string[];
}

/** How a file compares with the previous round. */
export type FileChange = "unchanged" | "changed" | "new";

/** FNV-1a (32-bit), as hex. Short, stable across runtimes, no dependencies. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // 32-bit FNV prime (16777619) by shifts, kept in Math.imul's int32 range.
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * A fingerprint per file of the parsed diff: the change type and every hunk's
 * header and lines. Two rounds whose fingerprints match for a path have the
 * same diff for that file — the agent changed nothing there.
 */
export function fileFingerprints(files: readonly ParsedFile[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of files) {
    const parts = [file.changeType, file.oldPath ?? "", file.binary ? "bin" : ""];
    for (const hunk of file.hunks) parts.push(hunk.header, ...hunk.lines);
    out[file.path] = fnv1a(parts.join("\n"));
  }
  return out;
}

/**
 * Compare this round's fingerprints with the previous round's. A path the
 * previous round did not have is `new`; one the previous round had with
 * another fingerprint is `changed`. Paths that are gone are simply absent —
 * there is nothing left to show for them.
 */
export function compareRounds(
  previous: Readonly<Record<string, string>> | undefined,
  current: Readonly<Record<string, string>>,
): Record<string, FileChange> {
  const out: Record<string, FileChange> = {};
  for (const [path, hash] of Object.entries(current)) {
    const before = previous?.[path];
    out[path] = before === undefined ? "new" : before === hash ? "unchanged" : "changed";
  }
  return out;
}

/**
 * Whether the lines a comment was on have changed since it was written. We say
 * "lines changed", never "fixed": Review Buddy can see that a file's diff
 * differs; only the reviewer can say their comment was handled.
 *
 * Per file for now — a comment on a file that is gone from the diff counts as
 * changed, since what it pointed at is no longer there either. Per hunk is a
 * later step (plan 020 "Not in this plan").
 */
export function commentStatus(
  comment: Pick<ReviewComment, "path">,
  changes: Readonly<Record<string, FileChange>>,
): CommentStatus {
  return changes[comment.path] === "unchanged" ? "lines_unchanged" : "lines_changed";
}

/**
 * What this round is, given the previous round's state and this round's diff.
 * `undefined` when there is no previous round: the viewer then shows a plain
 * first review, with no round badge and nothing marked carried over.
 */
export function roundInfo(
  previous: RoundState | undefined,
  current: Readonly<Record<string, string>>,
): RoundInfo | undefined {
  if (!previous) return undefined;
  const changes = compareRounds(previous.files, current);
  const previousComments: PreviousComment[] = previous.comments.map((c) => ({
    ...c,
    status: commentStatus(c, changes),
  }));
  return {
    number: previous.round + 1,
    changedPaths: Object.keys(changes).filter((p) => changes[p] !== "unchanged"),
    // Only files the agent left alone keep their mark: a changed file is new
    // work, whatever the reviewer thought of it last round.
    viewedPaths: previous.viewed.filter((p) => changes[p] === "unchanged"),
    previousComments,
  };
}

/**
 * The state to store after a round ended in "request changes". `dismissed`
 * carries over from the previous round, so a finding dismissed in round 1
 * stays dismissed in round 3.
 */
export function nextRoundState(
  info: RoundInfo | undefined,
  current: Readonly<Record<string, string>>,
  round: {
    viewed?: readonly string[];
    comments?: readonly ReviewComment[];
    dismissed?: readonly string[];
  },
  previous?: RoundState,
): RoundState {
  const dismissed = new Set([...(previous?.dismissedFindings ?? []), ...(round.dismissed ?? [])]);
  return {
    round: info?.number ?? 1,
    files: { ...current },
    viewed: [...new Set(round.viewed ?? [])],
    comments: [...(round.comments ?? [])],
    dismissedFindings: [...dismissed],
  };
}

/**
 * Read a stored round back. Anything unexpected — a hand-edited file, a state
 * written by another version — yields `undefined`, and the review opens as
 * round 1 rather than failing. Unknown fields are dropped, not kept.
 */
export function parseRoundState(raw: unknown): RoundState | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.round !== "number" || !Number.isFinite(o.round) || o.round < 1) return undefined;
  const files: Record<string, string> = {};
  if (typeof o.files !== "object" || o.files === null) return undefined;
  for (const [path, hash] of Object.entries(o.files as Record<string, unknown>)) {
    if (typeof hash === "string") files[path] = hash;
  }
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const comments = Array.isArray(o.comments)
    ? o.comments.filter(isReviewComment).map((c) => ({ ...c }))
    : [];
  return {
    round: Math.floor(o.round),
    files,
    viewed: strings(o.viewed),
    comments,
    dismissedFindings: strings(o.dismissedFindings),
  };
}

function isReviewComment(v: unknown): v is ReviewComment {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.chapterIndex === "number" &&
    typeof c.path === "string" &&
    typeof c.body === "string" &&
    typeof c.line === "number" &&
    (c.side === "old" || c.side === "new")
  );
}
