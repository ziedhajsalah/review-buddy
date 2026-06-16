import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentReview, PrMetadata, ReviewMeta } from "../types/review.ts";
import { captureDiff, capturePr, resolveBase } from "./git.ts";
import { resolveReview } from "./resolve.ts";
import { startServer, type RunningServer } from "./http.ts";

let dir: string;
let server: RunningServer;
let base: string;

const META: ReviewMeta = {
  aiGenerated: true,
  generatedBy: "test-model",
  generatedAt: "2026-06-16T12:00:00Z",
  promptVersion: "1",
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "rb-http-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "app.ts"), "const a = 1;\nconst b = 2;\nconst c = 3;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  // Working-tree change (Phase 1 default base = HEAD).
  writeFileSync(join(dir, "app.ts"), "const a = 1;\nconst b = 22;\nconst c = 3;\n");

  base = resolveBase(dir);
  const agent: AgentReview = {
    prologue: {
      why: "w",
      what: "x",
      key_changes: [
        { headline: "h1", detail: "d1" },
        { headline: "h2", detail: "d2" },
      ],
      review_focus: { summary: "s", file: "app.ts" },
    },
    chapters: [
      {
        index: 1,
        title: "Tweak b",
        risk: "Low",
        risk_reason: "trivial",
        description: "changes b",
        files: [{ path: "app.ts", change_type: "modified" }],
      },
    ],
  };
  const pr: PrMetadata = capturePr(dir, base);
  const { review } = resolveReview(agent, captureDiff(dir, base), META, pr);
  server = startServer({ review, cwd: dir, baseRef: base });
});

afterAll(() => {
  server?.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("HTTP server", () => {
  test("GET /api/review returns the resolved review with real hunk content", async () => {
    const r = await (await fetch(`${server.url}api/review`)).json();
    expect(r.meta.generatedBy).toBe("test-model");
    expect(r.pr.author).toBe("t");
    expect(r.stats.filesChanged).toBe(1);
    const hunk = r.chapters[0].files[0].hunks[0];
    expect(hunk.lines).toContain("+const b = 22;");
    expect(hunk.lines).toContain("-const b = 2;");
  });

  test("GET /api/file-content serves head (working tree) and base (committed) bytes", async () => {
    const head = await (
      await fetch(`${server.url}api/file-content?path=app.ts&side=head`)
    ).json();
    expect(head.content).toBe("const a = 1;\nconst b = 22;\nconst c = 3;\n");
    expect(head.language).toBe("typescript");

    const baseSide = await (
      await fetch(`${server.url}api/file-content?path=app.ts&side=base`)
    ).json();
    expect(baseSide.content).toBe("const a = 1;\nconst b = 2;\nconst c = 3;\n");
  });

  test("rejects path traversal / non-review files on /api/file-content", async () => {
    const traversal = await fetch(
      `${server.url}api/file-content?path=${encodeURIComponent("../../../../etc/passwd")}`,
    );
    expect(traversal.status).toBe(403); // not in the review's file allowlist

    const absolute = await fetch(
      `${server.url}api/file-content?path=${encodeURIComponent("/etc/passwd")}`,
    );
    expect(absolute.status).toBe(403);
  });

  test("GET / serves the placeholder viewer", async () => {
    const html = await (await fetch(server.url)).text();
    expect(html).toContain("Review Buddy");
    expect(html).toContain("/api/review");
  });

  test("POST /api/done unblocks the hook", async () => {
    const res = await (
      await fetch(`${server.url}api/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verdict: "ok" }),
      })
    ).json();
    expect(res.ok).toBe(true);
    const done = await server.done;
    expect(done.verdict).toBe("ok");
  });
});
