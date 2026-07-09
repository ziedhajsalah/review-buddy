import { z } from "zod";

const KeyChange = z.object({ headline: z.string(), detail: z.string() });
const ReviewFocus = z.object({ summary: z.string(), file: z.string() });
const Prologue = z.object({
  why: z.string(),
  what: z.string(),
  key_changes: z.array(KeyChange),
  review_focus: ReviewFocus,
});
const Hunk = z.object({ old_start: z.number(), new_start: z.number() });
const AgentFile = z.object({
  path: z.string(),
  change_type: z.string(),
  hunks: z.array(Hunk).optional(),
});
const Chapter = z.object({
  index: z.number().int().min(1),
  title: z.string(),
  risk: z.enum(["Low", "Medium", "High"]),
  risk_reason: z.string(),
  description: z.string(),
  files: z.array(AgentFile).min(1),
});

/** Structural schema for the agent's review payload (hook backstop; mirrors the
 *  load-bearing constraints of schemas/review.schema.json, not every field).
 *  Unknown keys (e.g. `source`, advisory `stats`) are ignored, not rejected. */
export const AgentReviewSchema = z.object({
  prologue: Prologue,
  chapters: z.array(Chapter).min(1),
});

/**
 * Validate an agent review payload. Returns a concise human-readable reason on
 * failure, or null when the payload is usable. Never throws.
 */
export function validateAgentReview(agent: unknown): string | null {
  const parsed = AgentReviewSchema.safeParse(agent);
  if (parsed.success) return null;
  return parsed.error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
