/// <reference types="bun-types" />
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ResolvedFile } from "../../../types/review.ts";
import { DEFAULT_SETTINGS } from "../settings.ts";

mock.module("@pierre/diffs/react", () => ({
  PatchDiff: () => null,
  FileDiff: () => null,
}));

let fetchImpl: (path: string, side: string) => Promise<{ content: string }>;
mock.module("../api.ts", () => ({
  fetchFileContent: (path: string, side: string) => fetchImpl(path, side),
}));

const { FileDiffCard } = await import("./FileDiffCard.tsx");
afterEach(cleanup);

const modified: ResolvedFile = {
  path: "app.ts",
  change_type: "modified",
  additions: 1,
  deletions: 1,
  language: "ts",
  hunks: [
    {
      old_start: 1,
      old_lines: 1,
      new_start: 1,
      new_lines: 1,
      header: "@@",
      lines: [" a", "-b", "+c"],
    },
  ],
};

test("expand surfaces an error notice when file-content fetch rejects", async () => {
  fetchImpl = async () => {
    throw new Error("boom");
  };
  render(
    <FileDiffCard file={modified} settings={DEFAULT_SETTINGS} viewed={false} onToggleViewed={() => {}} />,
  );
  fireEvent.click(screen.getByText("expand"));
  await waitFor(() => expect(screen.getByText(/Full file unavailable/)).toBeDefined());
});

test("expand shows the unavailable notice when required content is empty", async () => {
  fetchImpl = async () => ({ content: "" });
  render(
    <FileDiffCard file={modified} settings={DEFAULT_SETTINGS} viewed={false} onToggleViewed={() => {}} />,
  );
  fireEvent.click(screen.getByText("expand"));
  await waitFor(() => expect(screen.getByText(/Full file unavailable/)).toBeDefined());
});
