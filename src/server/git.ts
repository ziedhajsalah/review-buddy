/**
 * Source B + C capture: the authoritative diff, PR metadata, and full file
 * contents — all read from the local repo in the hook's cwd. Non-mutating:
 * never stages, commits, or resets the user's working tree.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrMetadata } from "../types/review.ts";

/** git's hash of the empty tree — used to diff a repo with no commits yet. */
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const MAX_BUFFER = 1024 * 1024 * 128;

function run(
  cmd: string,
  cwd: string,
  args: string[],
  allowFail = false,
): string {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: MAX_BUFFER });
  } catch (err) {
    // `git diff --no-index` exits 1 when files differ — expected, not an error.
    const stdout = (err as { stdout?: string }).stdout;
    if (allowFail) return typeof stdout === "string" ? stdout : "";
    throw err;
  }
}

const git = (cwd: string, args: string[], allowFail = false) =>
  run("git", cwd, ["--no-pager", ...args], allowFail);

/** Resolve the diff base ref: explicit override, else HEAD, else empty tree. */
export function resolveBase(cwd: string, override?: string): string {
  if (override) return override;
  const hasHead = git(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"], true).trim();
  return hasHead ? "HEAD" : EMPTY_TREE;
}

/**
 * Capture the working-tree diff against `base` (Phase 1 default base = HEAD =
 * uncommitted changes; pass a branch like "main" to review a whole branch).
 * Untracked, non-ignored files are folded in via `git diff --no-index` so they
 * appear as new-file diffs without touching the index.
 */
export function captureDiff(cwd: string, base: string): string {
  const tracked = git(cwd, ["diff", "--no-color", base]);

  const others = git(cwd, ["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  let untracked = "";
  for (const f of others) {
    untracked += git(cwd, ["diff", "--no-color", "--no-index", "--", "/dev/null", f], true);
  }

  if (!untracked) return tracked;
  const sep = tracked && !tracked.endsWith("\n") ? "\n" : "";
  return tracked + sep + untracked;
}

interface GhPr {
  title?: string;
  body?: string;
  author?: { login?: string };
  createdAt?: string;
  baseRefName?: string;
  headRefName?: string;
  url?: string;
}

/**
 * PR metadata (source B). Prefers `gh pr view` when a PR exists; otherwise
 * falls back to local git (branch name + last commit subject) so the
 * working-tree flow works with no GitHub remote.
 */
export function capturePr(cwd: string, base: string): PrMetadata {
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"], true).trim() || "HEAD";

  const ghJson = run(
    "gh",
    cwd,
    ["pr", "view", "--json", "title,body,author,createdAt,baseRefName,headRefName,url"],
    true,
  ).trim();

  if (ghJson.startsWith("{")) {
    try {
      const pr = JSON.parse(ghJson) as GhPr;
      return {
        title: pr.title ?? branch,
        description: pr.body ?? "",
        author: pr.author?.login ?? "unknown",
        createdAt: pr.createdAt ?? new Date().toISOString(),
        base: pr.baseRefName ?? base,
        head: pr.headRefName ?? branch,
        url: pr.url,
      };
    } catch {
      /* fall through to git fallback */
    }
  }

  const subject = git(cwd, ["log", "-1", "--pretty=%s"], true).trim();
  const author = git(cwd, ["config", "user.name"], true).trim() || "unknown";
  return {
    title: subject || branch,
    description: "",
    author,
    createdAt: new Date().toISOString(),
    base,
    head: branch,
  };
}

/**
 * Full file contents (source C) for "expand full file" + word-level context.
 * head = current working-tree bytes; base = the file at the diff base ref.
 */
export function fileContent(
  cwd: string,
  path: string,
  side: "base" | "head",
  baseRef: string,
): string {
  if (side === "head") {
    const abs = join(cwd, path);
    return existsSync(abs) ? readFileSync(abs, "utf8") : "";
  }
  const ref = baseRef === EMPTY_TREE ? "" : baseRef;
  if (!ref) return "";
  return git(cwd, ["show", `${ref}:${path}`], true);
}
