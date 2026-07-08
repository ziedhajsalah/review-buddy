/**
 * Client data layer. All /api/* calls carry the per-server token that the hook
 * put in the browser URL (?token=...). The server rejects /api/* without it.
 */
import type { ResolvedReview } from "../../types/review.ts";
import { parseReview } from "./lib/reviewSchema.ts";
import { authHeaders } from "./session.ts";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders });
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function fetchReview(): Promise<ResolvedReview> {
  const data = await getJSON<unknown>("/api/review");
  return parseReview(data);
}

export async function postDone(
  result: { verdict?: "approve" | "request_changes"; summary?: string } = {},
): Promise<void> {
  const res = await fetch("/api/done", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders },
    body: JSON.stringify(result),
  });
  if (!res.ok) {
    throw new Error(`/api/done → ${res.status} ${res.statusText}`);
  }
}

export async function fetchConfig(): Promise<{ roundtrip: boolean }> {
  return getJSON<{ roundtrip: boolean }>("/api/config");
}
