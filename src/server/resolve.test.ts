import { describe, expect, test } from "bun:test";
import type { AgentReview, PrMetadata, ReviewMeta } from "../types/review.ts";
import { resolveReview } from "./resolve.ts";

const SAMPLE = `diff --git a/src/dashboard/useSport.ts b/src/dashboard/useSport.ts
index 1111111..2222222 100644
--- a/src/dashboard/useSport.ts
+++ b/src/dashboard/useSport.ts
@@ -12,6 +12,9 @@ export function useSport() {
   const user = useUser();
-  return user.sport;
+  return user?.sport ?? sports[0];
+
+  // extra
@@ -40,3 +43,3 @@
   foo
-  bar
+  baz
diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index 4444444..0000000
--- a/gone.txt
+++ /dev/null
@@ -1 +0,0 @@
-obsolete
diff --git a/logo.png b/logo.png
index 7777777..8888888 100644
Binary files a/logo.png and b/logo.png differ
`;

const META: ReviewMeta = {
  aiGenerated: true,
  generatedBy: "claude-opus-4-8",
  generatedAt: "2026-06-16T12:00:00Z",
  promptVersion: "1",
};

const PR: PrMetadata = {
  title: "t",
  description: "d",
  author: "alice",
  createdAt: "2026-06-16T09:00:00Z",
  base: "main",
  head: "feature",
};

const AGENT: AgentReview = {
  prologue: {
    why: "w",
    what: "x",
    key_changes: [
      { headline: "h1", detail: "d1" },
      { headline: "h2", detail: "d2" },
    ],
    review_focus: { summary: "s", file: "src/dashboard/useSport.ts" },
  },
  chapters: [
    {
      index: 1,
      title: "Null-safe sport",
      risk: "High",
      risk_reason: "central hook",
      additions: 999, // advisory — must be overridden
      deletions: 999,
      description: "guard",
      files: [
        {
          path: "src/dashboard/useSport.ts",
          change_type: "modified",
          hunks: [{ old_start: 12, new_start: 12 }], // only the first hunk
        },
      ],
    },
    {
      index: 2,
      title: "Add fixture",
      risk: "Low",
      risk_reason: "new file",
      description: "adds new.txt",
      files: [{ path: "new.txt", change_type: "added" }], // whole file (hunks omitted)
    },
  ],
};

describe("resolveReview", () => {
  const { review, warnings } = resolveReview(AGENT, SAMPLE, META, PR);

  test("passes through meta, pr, and prologue", () => {
    expect(review.meta).toEqual(META);
    expect(review.pr).toEqual(PR);
    expect(review.prologue.review_focus.file).toBe("src/dashboard/useSport.ts");
  });

  test("attaches the real hunk content for an anchored hunk", () => {
    const ch1 = review.chapters[0]!;
    expect(ch1.fileCount).toBe(1);
    const file = ch1.files[0]!;
    expect(file.language).toBe("typescript");
    expect(file.hunks).toHaveLength(1);
    expect(file.hunks[0]!.header).toBe(
      "@@ -12,6 +12,9 @@ export function useSport() {",
    );
    expect(file.hunks[0]!.lines).toContain("+  return user?.sport ?? sports[0];");
  });

  test("recomputes chapter stats from the real diff (ignores advisory)", () => {
    const ch1 = review.chapters[0]!;
    expect(ch1.additions).toBe(3); // not 999
    expect(ch1.deletions).toBe(1);
  });

  test("omitted hunks => whole file", () => {
    const ch2 = review.chapters[1]!;
    expect(ch2.files[0]!.path).toBe("new.txt");
    expect(ch2.files[0]!.additions).toBe(2);
  });

  test("unclaimed changes land in an Unsorted chapter (nothing dropped)", () => {
    const unsorted = review.chapters.find((c) => c.title === "Unsorted changes");
    expect(unsorted).toBeDefined();
    const paths = unsorted!.files.map((f) => f.path).sort();
    // useSport hunk 2 (leftover) + gone.txt + logo.png (binary, never referenced)
    expect(paths).toEqual(["gone.txt", "logo.png", "src/dashboard/useSport.ts"]);
    expect(unsorted!.index).toBe(3);
    expect(warnings.some((w) => w.includes("Unsorted"))).toBe(true);
  });

  test("overall stats reflect the entire diff", () => {
    expect(review.stats).toEqual({ additions: 6, deletions: 3, filesChanged: 4 });
  });
});
