/// <reference types="bun-types" />
import { expect, test } from "bun:test";
import { DEFAULT_SETTINGS, toDiffOptions } from "./settings.ts";

test("toDiffOptions maps granularity line→none, word→word, char→char", () => {
  expect(toDiffOptions({ ...DEFAULT_SETTINGS, granularity: "line" }).lineDiffType).toBe("none");
  expect(toDiffOptions({ ...DEFAULT_SETTINGS, granularity: "word" }).lineDiffType).toBe("word");
  expect(toDiffOptions({ ...DEFAULT_SETTINGS, granularity: "char" }).lineDiffType).toBe("char");
});
