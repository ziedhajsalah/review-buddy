import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentReview } from "../types/review.ts";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "rb-cli-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "app.ts"), "let x = 1;\nlet y = 2;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  writeFileSync(join(dir, "app.ts"), "let x = 1;\nlet y = 20;\nlet z = 3;\n");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("open-review: stdin hook event -> serves review -> returns allow on Done", async () => {
  const agent: AgentReview = {
    prologue: {
      why: "y is wrong",
      what: "fix y and add z",
      key_changes: [
        { headline: "Fix y", detail: "20 not 2" },
        { headline: "Add z", detail: "new binding" },
      ],
      review_focus: { summary: "check z is used", file: "app.ts" },
    },
    chapters: [
      {
        index: 1,
        title: "Adjust bindings",
        risk: "Low",
        risk_reason: "tiny",
        description: "edits y and adds z",
        files: [{ path: "app.ts", change_type: "modified" }],
      },
    ],
  };
  const event = {
    tool_name: "mcp__plugin_review-buddy_review-buddy__submit_review",
    tool_input: agent,
    cwd: dir,
  };

  // Redirect child stdout/stderr to files (no pipe backpressure / lock issues).
  // Kept OUTSIDE the repo so they aren't captured as untracked changes.
  const outPath = join(tmpdir(), `rb-cli-out-${process.pid}.txt`);
  const errPath = join(tmpdir(), `rb-cli-err-${process.pid}.txt`);
  const outFd = openSync(outPath, "w");
  const errFd = openSync(errPath, "w");

  const proc = Bun.spawn(["bun", "run", join(import.meta.dir, "index.ts"), "open-review"], {
    cwd: dir,
    env: { ...process.env, REVIEW_BUDDY_NO_OPEN: "1" },
    stdin: "pipe",
    stdout: outFd,
    stderr: errFd,
  });
  proc.stdin.write(JSON.stringify(event));
  proc.stdin.end();

  // Discover the ephemeral port + token from the stderr file.
  let m: RegExpMatchArray | null = null;
  for (let i = 0; i < 100 && !m; i++) {
    m = readFileSync(errPath, "utf8").match(/http:\/\/127\.0\.0\.1:(\d+)\/\?token=([\w-]+)/);
    if (!m) await Bun.sleep(50);
  }
  expect(m).not.toBeNull();
  const port = m![1]!;
  const token = m![2]!;
  const api = (p: string) => `http://127.0.0.1:${port}/${p}?token=${token}`;

  // Cross-process requests use curl (fresh connection each time). Bun's global
  // fetch pools connections to the child server and would reuse a dead socket.
  const curl = (...args: string[]) => execFileSync("curl", ["-s", ...args], { encoding: "utf8" });

  // Served review must carry the real hunk content (reference-not-reproduce).
  const review = JSON.parse(curl(api("api/review")));
  expect(review.chapters[0].files[0].hunks[0].lines).toContain("+let y = 20;");

  // Reviewer clicks Done -> hook unblocks and prints the allow decision.
  curl("-X", "POST", api("api/done"), "-H", "content-type: application/json", "-d", "{}");
  await proc.exited;
  closeSync(outFd);
  closeSync(errFd);

  const decision = JSON.parse(readFileSync(outPath, "utf8"));
  expect(decision.hookSpecificOutput.hookEventName).toBe("PreToolUse");
  expect(decision.hookSpecificOutput.permissionDecision).toBe("allow");
}, 20_000);

test("open-review: source.type=branch captures the diff against the given base ref", async () => {
  // Commit the pending change, then review it against the base commit via a
  // branch source — exercises the source-routing added for PR/branch reviews.
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("add", "-A");
  git("commit", "-q", "-m", "change");

  const agent: AgentReview = {
    source: { type: "branch", ref: "HEAD~1" },
    prologue: {
      why: "y is wrong",
      what: "fix y and add z",
      key_changes: [
        { headline: "Fix y", detail: "20 not 2" },
        { headline: "Add z", detail: "new binding" },
      ],
      review_focus: { summary: "check z is used", file: "app.ts" },
    },
    chapters: [
      {
        index: 1,
        title: "Adjust bindings",
        risk: "Low",
        risk_reason: "tiny",
        description: "edits y and adds z",
        files: [{ path: "app.ts", change_type: "modified" }],
      },
    ],
  };
  const event = { tool_name: "mcp__review-buddy__submit_review", tool_input: agent, cwd: dir };

  const outPath = join(tmpdir(), `rb-cli-out2-${process.pid}.txt`);
  const errPath = join(tmpdir(), `rb-cli-err2-${process.pid}.txt`);
  const outFd = openSync(outPath, "w");
  const errFd = openSync(errPath, "w");

  const proc = Bun.spawn(["bun", "run", join(import.meta.dir, "index.ts"), "open-review"], {
    cwd: dir,
    env: { ...process.env, REVIEW_BUDDY_NO_OPEN: "1" },
    stdin: "pipe",
    stdout: outFd,
    stderr: errFd,
  });
  proc.stdin.write(JSON.stringify(event));
  proc.stdin.end();

  let m: RegExpMatchArray | null = null;
  for (let i = 0; i < 100 && !m; i++) {
    m = readFileSync(errPath, "utf8").match(/http:\/\/127\.0\.0\.1:(\d+)\/\?token=([\w-]+)/);
    if (!m) await Bun.sleep(50);
  }
  expect(m).not.toBeNull();
  const api = (p: string) => `http://127.0.0.1:${m![1]!}/${p}?token=${m![2]!}`;
  const curl = (...args: string[]) => execFileSync("curl", ["-s", ...args], { encoding: "utf8" });

  // Diff vs base commit resolves the branch's real hunk (not an empty worktree).
  const review = JSON.parse(curl(api("api/review")));
  expect(review.chapters[0].files[0].hunks[0].lines).toContain("+let y = 20;");

  curl("-X", "POST", api("api/done"), "-H", "content-type: application/json", "-d", "{}");
  await proc.exited;
  closeSync(outFd);
  closeSync(errFd);
}, 20_000);
