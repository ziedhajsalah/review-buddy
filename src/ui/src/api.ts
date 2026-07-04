/**
 * Client data layer. All /api/* calls carry the per-server token that the hook
 * put in the browser URL (?token=...). The server rejects /api/* without it.
 */
import type { ResolvedReview } from "../../types/review.ts";
import { authHeaders } from "./session.ts";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders });
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function fetchReview(): Promise<ResolvedReview> {
  return getJSON<ResolvedReview>("/api/review");
}

export async function postDone(verdict?: string): Promise<void> {
  const res = await fetch("/api/done", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders },
    body: JSON.stringify(verdict ? { verdict } : {}),
  });
  if (!res.ok) {
    throw new Error(`/api/done → ${res.status} ${res.statusText}`);
  }
}
