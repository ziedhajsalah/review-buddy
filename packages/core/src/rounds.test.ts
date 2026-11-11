import { expect, test } from "bun:test";
import type { ParsedFile } from "./diff.ts";
import {
  commentStatus,
  compareRounds,
  fileFingerprints,
  nextRoundState,
  parseRoundState,
  type RoundState,
  roundInfo,
} from "./rounds.ts";
import type { ReviewComment } from "./types.ts";

const file = (over: Partial<ParsedFile> = {}): ParsedFile => ({
  path: "src/a.ts",
  changeType: "modified",
  binary: false,
  additions: 1,
  deletions: 0,
  hunks: [
    {
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 3,
      header: "@@ -1,2 +1,3 @@",
      lines: [" ctx", "+added"],
      additions: 1,
      deletions: 0,
      claimedBy: -1,
    },
  ],
  ...over,
});

test("fileFingerprints: one hash per path, and no diff text in it", () => {
  const prints = fileFingerprints([file(), file({ path: "src/b.ts" })]);
  expect(Object.keys(prints)).toEqual(["src/a.ts", "src/b.ts"]);
  for (const hash of Object.values(prints)) expect(hash).toMatch(/^[0-9a-f]{8}$/);
  // Same content, same hash — the path is not part of it, the diff is.
  expect(prints["src/a.ts"]).toBe(prints["src/b.ts"]);
  expect(JSON.stringify(prints)).not.toContain("added");
});

test("fileFingerprints: a changed line, a changed anchor and a changed type all show", () => {
  const base = fileFingerprints([file()])["src/a.ts"];
  const lines = fileFingerprints([
    file({ hunks: [{ ...file().hunks[0]!, lines: [" ctx", "+other"] }] }),
  ])["src/a.ts"];
  const header = fileFingerprints([
    file({ hunks: [{ ...file().hunks[0]!, header: "@@ -9,2 +9,3 @@" }] }),
  ])["src/a.ts"];
  const added = fileFingerprints([file({ changeType: "added" })])["src/a.ts"];
  expect(new Set([base, lines, header, added]).size).toBe(4);
});

test("compareRounds: unchanged, changed, new — and gone files are simply absent", () => {
  expect(
    compareRounds(
      { "src/a.ts": "aaaa", "src/b.ts": "bbbb", "src/gone.ts": "cccc" },
      { "src/a.ts": "aaaa", "src/b.ts": "dddd", "src/new.ts": "eeee" },
    ),
  ).toEqual({ "src/a.ts": "unchanged", "src/b.ts": "changed", "src/new.ts": "new" });
  // No previous round: everything is new.
  expect(compareRounds(undefined, { "src/a.ts": "aaaa" })).toEqual({ "src/a.ts": "new" });
});

test("commentStatus: only an untouched file counts as lines_unchanged", () => {
  const changes = { "src/a.ts": "unchanged", "src/b.ts": "changed" } as const;
  expect(commentStatus({ path: "src/a.ts" }, changes)).toBe("lines_unchanged");
  expect(commentStatus({ path: "src/b.ts" }, changes)).toBe("lines_changed");
  // A file no longer in the diff: what the comment pointed at is gone too.
  expect(commentStatus({ path: "src/gone.ts" }, changes)).toBe("lines_changed");
});

const comment = (over: Partial<ReviewComment> = {}): ReviewComment => ({
  chapterIndex: 0,
  path: "src/a.ts",
  side: "new",
  line: 12,
  body: "Why?",
  ...over,
});

const stored = (over: Partial<RoundState> = {}): RoundState => ({
  round: 1,
  files: { "src/a.ts": "aaaa", "src/b.ts": "bbbb" },
  viewed: ["src/a.ts", "src/b.ts"],
  comments: [comment(), comment({ path: "src/b.ts", line: 3 })],
  dismissedFindings: ["f1"],
  ...over,
});

test("roundInfo: no previous round → no rounds at all", () => {
  expect(roundInfo(undefined, { "src/a.ts": "aaaa" })).toBeUndefined();
});

test("roundInfo: round 2 carries over the viewed mark of the untouched file only", () => {
  const info = roundInfo(stored(), { "src/a.ts": "aaaa", "src/b.ts": "zzzz" });
  expect(info).toEqual({
    number: 2,
    changedPaths: ["src/b.ts"],
    viewedPaths: ["src/a.ts"],
    previousComments: [
      { ...comment(), status: "lines_unchanged" },
      { ...comment({ path: "src/b.ts", line: 3 }), status: "lines_changed" },
    ],
  });
});

test("roundInfo: a new file is changed work, and the round number keeps climbing", () => {
  const info = roundInfo(stored({ round: 3 }), {
    "src/a.ts": "aaaa",
    "src/b.ts": "bbbb",
    "src/c.ts": "cccc",
  });
  expect(info?.number).toBe(4);
  expect(info?.changedPaths).toEqual(["src/c.ts"]);
  expect(info?.viewedPaths).toEqual(["src/a.ts", "src/b.ts"]);
});

test("nextRoundState: numbers the round that just happened and keeps dismissals", () => {
  const current = { "src/a.ts": "aaaa", "src/b.ts": "zzzz" };
  const previous = stored();
  const info = roundInfo(previous, current);
  const next = nextRoundState(
    info,
    current,
    { viewed: ["src/a.ts", "src/a.ts"], comments: [comment({ body: "again" })], dismissed: ["f2"] },
    previous,
  );
  expect(next.round).toBe(2);
  expect(next.files).toEqual(current);
  expect(next.viewed).toEqual(["src/a.ts"]); // deduplicated
  expect(next.comments).toEqual([comment({ body: "again" })]);
  expect(next.dismissedFindings).toEqual(["f1", "f2"]); // round 1's dismissal stands
});

test("nextRoundState: a first round with nothing sent is still a round 1 to build on", () => {
  expect(nextRoundState(undefined, { "src/a.ts": "aaaa" }, {})).toEqual({
    round: 1,
    files: { "src/a.ts": "aaaa" },
    viewed: [],
    comments: [],
    dismissedFindings: [],
  });
});

test("parseRoundState: a state it wrote itself comes back whole", () => {
  const state = stored({ round: 2 });
  expect(parseRoundState(JSON.parse(JSON.stringify(state)))).toEqual(state);
});

test("parseRoundState: anything malformed is no round at all", () => {
  expect(parseRoundState(undefined)).toBeUndefined();
  expect(parseRoundState("{}")).toBeUndefined();
  expect(parseRoundState({ files: {} })).toBeUndefined(); // no round number
  expect(parseRoundState({ round: 0, files: {} })).toBeUndefined();
  expect(parseRoundState({ round: 1 })).toBeUndefined(); // no files
});

test("parseRoundState: junk inside a well-formed state is dropped, not kept", () => {
  expect(
    parseRoundState({
      round: 2.7,
      files: { "src/a.ts": "aaaa", "src/b.ts": 42 },
      viewed: ["src/a.ts", 7, null],
      comments: [comment(), { path: "src/a.ts" }, "nope"],
      dismissedFindings: "f1",
      somethingElse: "ignored",
    }),
  ).toEqual({
    round: 2,
    files: { "src/a.ts": "aaaa" },
    viewed: ["src/a.ts"],
    comments: [comment()],
    dismissedFindings: [],
  });
});
