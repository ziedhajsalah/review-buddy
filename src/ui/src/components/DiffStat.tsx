/** +additions / −deletions, monospace, muted. */
export function DiffStat({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="font-mono text-xs">
      <span style={{ color: "var(--color-risk-low)" }}>+{additions}</span>{" "}
      <span style={{ color: "var(--color-risk-high)" }}>−{deletions}</span>
    </span>
  );
}
