import { expect, test } from "bun:test";
import { assertPrRef, assertSafeRef, capturePrDiff } from "./git.ts";

test("assertSafeRef rejects flag-smuggling refs, accepts real refs", () => {
  expect(() => assertSafeRef("-O/tmp/x")).toThrow();
  expect(() => assertSafeRef("--upload-pack=touch pwned")).toThrow();
  expect(() => assertSafeRef("")).toThrow();
  expect(() => assertSafeRef("main")).not.toThrow();
  expect(() => assertSafeRef("origin/feature-x")).not.toThrow();
  expect(() => assertSafeRef("HEAD~1")).not.toThrow();
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
