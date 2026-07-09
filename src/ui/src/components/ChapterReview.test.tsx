/// <reference types="bun-types" />
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { fakeResolvedReview } from "../stories/fixtures.ts";

mock.module("../session.ts", () => ({
  getReviewToken: () => "testtoken",
}));

mock.module("@pierre/diffs/react", () => ({
  PatchDiff: () => <div data-testid="patch-diff" />,
  FileDiff: () => null,
}));

mock.module("../api.ts", () => ({
  fetchConfig: async () => ({ roundtrip: false }),
  postDone: async () => {},
  fetchFileContent: async () => ({ content: "" }),
}));

const { ChapterReview } = await import("./ChapterReview.tsx");

const VIEWED_KEY = "rb.viewed.testtoken";
const COLLAPSED_KEY = "rb.collapsed.testtoken";

afterEach(() => {
  cleanup();
  localStorage.removeItem(VIEWED_KEY);
  localStorage.removeItem(COLLAPSED_KEY);
});

test("marking viewed collapses the card; caret re-expands while viewed stays checked", () => {
  render(
    <ChapterReview
      review={fakeResolvedReview}
      position={0}
      onNavigate={() => {}}
      onExit={() => {}}
    />,
  );

  expect(screen.getByTestId("patch-diff").closest("[hidden]")).toBeNull();

  fireEvent.click(screen.getByLabelText("viewed"));
  expect(screen.getByTestId("patch-diff").closest("[hidden]")).not.toBeNull();

  fireEvent.click(screen.getByLabelText("Expand file"));
  expect(screen.getByTestId("patch-diff").closest("[hidden]")).toBeNull();

  const viewedSwitch = screen.getByRole("switch", { name: "viewed" });
  expect(viewedSwitch.getAttribute("data-state")).toBe("checked");
});
