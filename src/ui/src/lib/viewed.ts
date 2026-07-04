/**
 * Local "mark file as viewed" state (Phase 1 = client-only, no round-trip).
 * Keyed per review token and persisted to localStorage so it survives a reload
 * within the same review session.
 */
import { useCallback } from "react";
import { getReviewToken } from "../session.ts";
import { usePersistedState } from "./usePersistedState.ts";

const KEY = `rb.viewed.${getReviewToken() || "notoken"}`;

export function useViewedFiles() {
  const [paths, setPaths] = usePersistedState<string[]>(KEY, [], "local");
  const viewed = new Set(paths);

  const toggle = useCallback(
    (path: string) => {
      setPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return [...next];
      });
    },
    [setPaths],
  );

  return [viewed, toggle] as const;
}
