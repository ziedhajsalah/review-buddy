import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDiff } from "./diff.ts";
import { assertPrRef, assertSafeRef, captureDiff, capturePrDiff, ensureCommit, fileContent, resolveBase } from "./git.ts";

test("assertSafeRef rejects flag-smuggling refs, accepts real refs", () => {
  expect(() => assertSafeRef("-O/tmp/x")).toThrow();
  expect(() => assertSafeRef("--upload-pack=touch pwned")).toThrow();
  expect(() => assertSafeRef("")).toThrow();
  expect(() => assertSafeRef("main")).not.toThrow();
  expect(() => assertSafeRef("origin/feature-x")).not.toThrow();
  expect(() => assertSafeRef("HEAD~1")).not.toThrow();
});

test("resolveBase rejects a flag-smuggling override before git runs", () => {
  expect(() => resolveBase(".", "--upload-pack=x")).toThrow();
});

test("fileContent rejects an unsafe base ref before git runs", () => {
  expect(() => fileContent(".", "f", "base", "-Oevil")).toThrow();
});

test("assertPrRef accepts a number or github PR URL, rejects the rest", () => {
  expect(() => assertPrRef("42")).not.toThrow();
  expect(() => assertPrRef("https://github.com/owner/repo/pull/7")).not.toThrow();
  expect(() => assertPrRef("--web")).toThrow();
  expect(() => assertPrRef("main")).toThrow();
  expect(() => assertPrRef("https://evil.com/pull/1")).toThrow();
});

test("capturePrDiff refuses an unsafe ref before shelling out to gh", () => {
  // Throws on validation — never reaches `gh`, so no network/auth needed.
  expect(() => capturePrDiff(process.cwd(), "--upload-pack=x")).toThrow();
});

test("captureDiff includes untracked files with special-character names", () => {
  const dir = mkdtempSync(join(tmpdir(), "rb-git-"));
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
    git("init", "-q");
    git("config", "user.email", "t@t.t");
    git("config", "user.name", "t");
    git("config", "commit.gpgsign", "false");
    writeFileSync(join(dir, "a.ts"), "base\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");

    writeFileSync(join(dir, "café.ts"), "café\n");
    writeFileSync(join(dir, "with space.ts"), "space\n");
    writeFileSync(join(dir, "plain.ts"), "plain\n");

    const diff = captureDiff(dir, "HEAD");
    const files = parseDiff(diff).map((f) => f.path).sort();
    expect(files).toEqual(["café.ts", "plain.ts", "with space.ts"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fileContent head side reads a git object when a headRef SHA is given", () => {
  const dir = mkdtempSync(join(tmpdir(), "rb-git-"));
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
    git("init", "-q");
    git("config", "user.email", "t@t.t");
    git("config", "user.name", "t");
    git("config", "commit.gpgsign", "false");
    // Commit content A, capture its SHA, then overwrite the worktree with B.
    writeFileSync(join(dir, "f.ts"), "AAA\n");
    git("add", "-A");
    git("commit", "-q", "-m", "A");
    const sha = git("rev-parse", "HEAD").trim();
    writeFileSync(join(dir, "f.ts"), "BBB\n"); // worktree now differs from the commit

    // SHA given → reads the committed object (A), NOT the worktree (B).
    expect(fileContent(dir, "f.ts", "head", "HEAD", sha)).toBe("AAA\n");
    // null → PR mode, unavailable → "" (never leaks the worktree bytes).
    expect(fileContent(dir, "f.ts", "head", "HEAD", null)).toBe("");
    // undefined → worktree mode → reads the working tree (B).
    expect(fileContent(dir, "f.ts", "head", "HEAD")).toBe("BBB\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ensureCommit resolves an existing commit, fails open for an unknown one", () => {
  const dir = mkdtempSync(join(tmpdir(), "rb-git-"));
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
    git("init", "-q");
    git("config", "user.email", "t@t.t");
    git("config", "user.name", "t");
    git("config", "commit.gpgsign", "false");
    writeFileSync(join(dir, "f.ts"), "x\n");
    git("add", "-A");
    git("commit", "-q", "-m", "c");
    const sha = git("rev-parse", "HEAD").trim();

    expect(ensureCommit(dir, sha)).toBe(true);
    // No such object; the fetch fallbacks run `git fetch origin` in a repo with
    // NO remote and degrade quietly (allowFail) → false.
    expect(ensureCommit(dir, "deadbeef".repeat(5))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
