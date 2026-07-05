/**
 * Review Buddy CLI — entry for the PreToolUse hook (and local dev).
 *
 * Modes:
 *   open-review (default)  Spawned by the PreToolUse hook. Reads the hook event
 *                          from stdin, captures the diff + PR (sources B/C),
 *                          resolves the agent review (A), serves it, opens the
 *                          browser, and BLOCKS until the reviewer clicks Done.
 *                          Phase 1: always returns permissionDecision "allow".
 *   dev --review <file>    Load an agent review JSON from a file and run the
 *                          same viewer against the current repo — for testing
 *                          the UI without going through the agent/hook.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentReview, ReviewMeta } from "../types/review.ts";
import { assertSafeRef, captureDiff, capturePr, capturePrDiff, resolveBase } from "../server/git.ts";
import { resolveReview } from "../server/resolve.ts";
import { startServer } from "../server/http.ts";
import { openBrowser } from "../server/browser.ts";

interface HookEvent {
  tool_name?: string;
  tool_input?: AgentReview;
  cwd?: string;
}

const repoRoot = join(import.meta.dir, "..", "..");

function uiDir(): string | undefined {
  const dir = join(repoRoot, "src", "ui", "dist");
  return existsSync(join(dir, "index.html")) ? dir : undefined;
}

function buildMeta(): ReviewMeta {
  return {
    aiGenerated: true,
    generatedBy: process.env.REVIEW_BUDDY_MODEL ?? "claude",
    generatedAt: new Date().toISOString(),
    promptVersion: "1",
  };
}

/** Print the PreToolUse allow decision and exit (Phase 1: one-way viewer). */
function allow(reason: string): never {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: reason,
      },
    }) + "\n",
  );
  process.exit(0);
}

/**
 * Capture the authoritative diff (source B) matching what the agent reviewed.
 * `agent.source` tells us which — the hook can't see `/review`'s arguments, so
 * without this a PR review would re-capture the local working tree (empty) and
 * render no hunks. `base` is the ref used for full-file expansion (source C).
 */
function captureForSource(
  agent: AgentReview,
  cwd: string,
): { diff: string; pr: ReturnType<typeof capturePr>; base: string } {
  const source = agent.source ?? { type: "worktree" };

  if (source.type === "pr" && source.ref) {
    const pr = capturePr(cwd, "HEAD", source.ref);
    // Base side of expansion uses the PR's base branch (may be a fetched ref).
    return { diff: capturePrDiff(cwd, source.ref), pr, base: pr.base };
  }

  let base: string;
  if (source.type === "branch" && source.ref) {
    assertSafeRef(source.ref); // ref flows into `git diff <ref>` — block flag smuggling
    base = source.ref;
  } else {
    base = resolveBase(cwd, process.env.REVIEW_BUDDY_BASE);
  }
  return { diff: captureDiff(cwd, base), pr: capturePr(cwd, base), base };
}

async function serveAndBlock(agent: AgentReview, cwd: string): Promise<void> {
  const { diff, pr, base } = captureForSource(agent, cwd);
  const { review, warnings } = resolveReview(agent, diff, buildMeta(), pr);
  for (const w of warnings) console.error(`[review-buddy] ${w}`);

  const server = startServer({ review, cwd, baseRef: base, uiDir: uiDir() });
  console.error(`[review-buddy] Review ready at ${server.url}`);
  if (process.env.REVIEW_BUDDY_NO_OPEN) {
    console.error(`[review-buddy] REVIEW_BUDDY_NO_OPEN set — not opening a browser.`);
  } else if (!openBrowser(server.url)) {
    console.error(`[review-buddy] Could not open a browser — open the URL above manually.`);
  }

  await server.done;
  server.stop();
}

async function runOpenReview(): Promise<never> {
  let event: HookEvent;
  try {
    const raw = await Bun.stdin.text();
    event = JSON.parse(raw) as HookEvent;
  } catch (err) {
    console.error(`[review-buddy] Failed to read hook event: ${String(err)}`);
    allow("Review Buddy could not read the hook event; proceeding.");
  }

  const agent = event.tool_input;
  const cwd = event.cwd ?? process.cwd();
  if (!agent || !agent.prologue || !Array.isArray(agent.chapters)) {
    allow("Review Buddy received no valid review payload; proceeding.");
  }

  try {
    await serveAndBlock(agent, cwd);
  } catch (err) {
    console.error(`[review-buddy] Viewer error: ${String(err)}`);
    allow("Review Buddy hit an error rendering the review; proceeding.");
  }
  allow("Review viewed by the human.");
}

async function runDev(args: string[]): Promise<void> {
  const i = args.indexOf("--review");
  if (i === -1 || !args[i + 1]) {
    console.error("Usage: review-buddy dev --review <agent-review.json> [--cwd <dir>]");
    process.exit(2);
  }
  const agent = JSON.parse(readFileSync(args[i + 1]!, "utf8")) as AgentReview;
  const cwdIdx = args.indexOf("--cwd");
  const cwd = cwdIdx !== -1 && args[cwdIdx + 1] ? args[cwdIdx + 1]! : process.cwd();
  await serveAndBlock(agent, cwd);
  console.error("[review-buddy] Done.");
  process.exit(0);
}

const [, , mode, ...rest] = process.argv;
if (mode === "dev") {
  await runDev(rest);
} else {
  await runOpenReview();
}
