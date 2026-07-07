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

// core.quotePath=false is global on purpose: every path this module reads from
// git (diff, ls-files, show, log) must arrive as raw UTF-8, never C-quoted, so
// special-character filenames survive capture. Do not narrow it to one call.
const git = (cwd: string, args: string[], allowFail = false) =>
  run("git", cwd, ["--no-pager", "-c", "core.quotePath=false", ...args], allowFail);

/**
 * Guard against argv flag smuggling: `ref` originates in the agent's JSON (and,
 * for a PR, ultimately from untrusted branch/PR data). execFileSync blocks shell
 * injection but NOT a value like `--upload-pack=…` being read as a flag by git/gh.
 * A safe git ref can't start with `-`; a PR ref must be a bare number or a
 * github.com pull URL.
 */
const PR_REF_RE = /^(\d+|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+)$/;

export function assertSafeRef(ref: string): void {
  if (!ref || ref.startsWith("-")) {
    throw new Error(`Refusing unsafe git ref: ${JSON.stringify(ref)}`);
  }
}

export function assertPrRef(ref: string): void {
  if (!PR_REF_RE.test(ref)) {
    throw new Error(`Refusing unsafe PR ref (want a number or github PR URL): ${JSON.stringify(ref)}`);
  }
}

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

  // -z = NUL-terminated raw paths: no C-quoting of special characters, so the
  // exact on-disk name reaches `git diff --no-index` below.
  const others = git(cwd, ["ls-files", "-z", "--others", "--exclude-standard"])
    .split("\0")
    .filter(Boolean);

  let untracked = "";
  for (const f of others) {
    untracked += git(cwd, ["diff", "--no-color", "--no-index", "--", "/dev/null", f], true);
  }

  if (!untracked) return tracked;
  const sep = tracked && !tracked.endsWith("\n") ? "\n" : "";
  return tracked + sep + untracked;
}

/**
 * The PR's diff via `gh pr diff <ref>` (ref = number, URL, or branch). Use this
 * — NOT `git diff` — when the agent reviewed a PR: the PR branch usually isn't
 * checked out locally, so a local `git diff` would be empty or unrelated. Throws
 * if gh is missing/unauthenticated or the PR can't be found (the caller fails
 * open, so the agent isn't blocked).
 */
export function capturePrDiff(cwd: string, ref: string): string {
  assertPrRef(ref);
  return run("gh", cwd, ["pr", "diff", ref], false);
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
 * working-tree flow works with no GitHub remote. Pass `ref` (PR number/URL)
 * to target a specific PR — required when the branch isn't checked out.
 */
export function capturePr(cwd: string, base: string, ref?: string): PrMetadata {
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"], true).trim() || "HEAD";

  const ghArgs = ["pr", "view"];
  if (ref) {
    assertPrRef(ref);
    ghArgs.push(ref);
  }
  ghArgs.push("--json", "title,body,author,createdAt,baseRefName,headRefName,url");
  const ghJson = run("gh", cwd, ghArgs, true).trim();

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
