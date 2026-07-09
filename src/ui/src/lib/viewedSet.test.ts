/// <reference types="bun-types" />
import { expect, test } from "bun:test";
import { viewedSet } from "./viewedSet.ts";

test("returns the viewed paths matching the chapter prefix", () => {
  expect(viewedSet(["1:a.ts", "1:b.ts", "2:c.ts"], 1)).toEqual(new Set(["a.ts", "b.ts"]));
});

test("returns empty for a chapter with no entries", () => {
  expect(viewedSet(["2:c.ts"], 1)).toEqual(new Set());
});

test("ignores non-string entries without throwing (corrupted storage)", () => {
  const corrupt = ["1:a.ts", 42, null, { x: 1 }, undefined, "1:b.ts"] as unknown[];
  expect(() => viewedSet(corrupt, 1)).not.toThrow();
  expect(viewedSet(corrupt, 1)).toEqual(new Set(["a.ts", "b.ts"]));
});
