/**
 * Display settings — the reviewer's local view preferences (source D). Persisted
 * to a host-scoped cookie and mapped onto @pierre/diffs' FileDiffOptions.
 */
import { useCallback } from "react";
import type { FileDiffOptions } from "@pierre/diffs";
import type { DisplaySettings } from "../../types/review.ts";
import { usePersistedState } from "./lib/usePersistedState.ts";

const KEY = "rb.display";

export const DEFAULT_SETTINGS: DisplaySettings = {
  layout: "unified",
  theme: "auto",
  changeIndicator: "classic",
  granularity: "word",
  wrap: false,
  lineNumbers: true,
  backgrounds: true,
};

export function useDisplaySettings() {
  const [settings, setSettings] = usePersistedState(KEY, DEFAULT_SETTINGS, "cookie");

  const update = useCallback(
    (patch: Partial<DisplaySettings>) => setSettings((s) => ({ ...s, ...patch })),
    [setSettings],
  );

  return [settings, update] as const;
}

/** GitHub-flavored themes; "auto" lets @pierre/diffs follow prefers-color-scheme. */
const THEME = { dark: "github-dark", light: "github-light" } as const;

/** Translate our DisplaySettings into @pierre/diffs render options. */
export function toDiffOptions(s: DisplaySettings): FileDiffOptions<undefined> {
  return {
    diffStyle: s.layout,
    diffIndicators: s.changeIndicator,
    lineDiffType: s.granularity === "word" ? "word" : "none",
    overflow: s.wrap ? "wrap" : "scroll",
    disableLineNumbers: !s.lineNumbers,
    disableBackground: !s.backgrounds,
    hunkSeparators: "line-info",
    // Main-thread JS highlighter: no worker pool, no WASM fetch — keeps the
    // build simple and single-file-friendly. Upgrade to WorkerPoolContextProvider
    // later for large diffs.
    preferredHighlighter: "shiki-js",
    theme: THEME,
    ...(s.theme === "auto" ? {} : { themeType: s.theme }),
  };
}
