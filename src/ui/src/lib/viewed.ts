/**
 * Local "mark file as viewed" state (Phase 1 = client-only, no round-trip).
 * Keyed per review token AND per chapter: the same file can appear in multiple
 * chapters with different hunks, so viewed-state is namespaced by the chapter's
 * stable `index`. Persisted to localStorage so it survives a reload within the
 * same review session, and cleared when the review is submitted.
 */
import { useCallback } from "react";
import { getReviewToken } from "../session.ts";
import { usePersistedState } from "./usePersistedState.ts";

const KEY = `rb.viewed.${getReviewToken() || "notoken"}`;

/**
 * Drop THIS review's viewed-state. Called when the review is submitted (Done)
 * so a completed review doesn't leave its key behind. Scoped to this session's
 * KEY only — it never touches another review's key, so it cannot disturb a
 * parallel review running on its own ephemeral-port origin.
 */
export function clearViewedFiles() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode) — non-fatal */
  }
}

export function useViewedFiles(chapterIndex: number) {
  const [entries, setEntries] = usePersistedState<string[]>(KEY, [], "local");
  const prefix = `${chapterIndex}:`;
  const viewed = new Set(
    entries.filter((e) => e.startsWith(prefix)).map((e) => e.slice(prefix.length)),
  );

  const toggle = useCallback(
    (path: string) => {
      const entry = `${chapterIndex}:${path}`;
      setEntries((prev) =>
        prev.includes(entry) ? prev.filter((e) => e !== entry) : [...prev, entry],
      );
    },
    [setEntries, chapterIndex],
  );

  return [viewed, toggle] as const;
}
