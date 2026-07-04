import type { Risk } from "../../../types/review.ts";

const STYLES: Record<Risk, { bg: string; fg: string }> = {
  High: { bg: "var(--color-risk-high-bg)", fg: "var(--color-risk-high)" },
  Medium: { bg: "var(--color-risk-medium-bg)", fg: "var(--color-risk-medium)" },
  Low: { bg: "var(--color-risk-low-bg)", fg: "var(--color-risk-low)" },
};

export function RiskBadge({ risk }: { risk: Risk }) {
  const s = STYLES[risk];
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.fg }}
    >
      {risk}
    </span>
  );
}
