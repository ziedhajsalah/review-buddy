import { useState } from "react";
import type { ResolvedReview } from "../../../types/review.ts";
import { RiskBadge } from "./RiskBadge.tsx";
import { DiffStat } from "./DiffStat.tsx";
import { Markdown } from "./Markdown.tsx";

type Tab = "prologue" | "description";

export function Overview({
  review,
  onBeginReview,
}: {
  review: ResolvedReview;
  onBeginReview: (position: number) => void;
}) {
  const [tab, setTab] = useState<Tab>("prologue");
  const { pr, meta, prologue, stats, chapters } = review;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* PR header */}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{pr.title || "Untitled review"}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: "var(--rb-muted)" }}>
          <span>{pr.author || "unknown"}</span>
          <span aria-hidden>·</span>
          <span className="font-mono text-xs">
            {pr.base} ← {pr.head}
          </span>
          <span aria-hidden>·</span>
          <DiffStat additions={stats.additions} deletions={stats.deletions} />
          <span aria-hidden>·</span>
          <span>{stats.filesChanged} file{stats.filesChanged === 1 ? "" : "s"}</span>
          {meta.aiGenerated && (
            <span
              className="rounded-full px-2 py-0.5 text-[0.68rem] font-semibold"
              style={{ background: "var(--rb-panel)", border: "1px solid var(--rb-border)" }}
              title={`Prompt v${meta.promptVersion} · ${new Date(meta.generatedAt).toLocaleString()}`}
            >
              ✦ AI-generated · {meta.generatedBy}
            </span>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b" style={{ borderColor: "var(--rb-border)" }}>
        <TabButton active={tab === "prologue"} onClick={() => setTab("prologue")}>
          AI Prologue
        </TabButton>
        <TabButton active={tab === "description"} onClick={() => setTab("description")}>
          Description
        </TabButton>
      </div>

      {tab === "prologue" ? (
        <section className="space-y-5">
          <Block heading="Why">
            <Markdown value={prologue.why} />
          </Block>
          <Block heading="What">
            <Markdown value={prologue.what} />
          </Block>
          <Block heading="Key changes">
            <ul className="space-y-1.5">
              {prologue.key_changes.map((k, i) => (
                <li key={i} className="leading-relaxed">
                  <span className="font-semibold">{k.headline}</span>
                  <span style={{ color: "var(--rb-muted)" }}>
                    {" — "}
                    <Markdown value={k.detail} variant="inline" className="inline" />
                  </span>
                </li>
              ))}
            </ul>
          </Block>
          <Block heading="Review focus">
            <p>
              <Markdown value={prologue.review_focus.summary} variant="inline" className="inline" />{" "}
              <code
                className="rounded px-1.5 py-0.5 font-mono text-xs"
                style={{ background: "var(--rb-panel)" }}
              >
                {prologue.review_focus.file}
              </code>
            </p>
          </Block>
        </section>
      ) : (
        <section>
          {pr.description ? (
            <Markdown value={pr.description} className="text-sm" />
          ) : (
            <p style={{ color: "var(--rb-muted)" }}>No PR description available.</p>
          )}
        </section>
      )}

      {/* Chapter list */}
      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--rb-muted)" }}>
        {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
      </h2>
      <ol className="space-y-2.5">
        {chapters.map((ch, i) => (
          <li key={ch.index}>
            <button
              onClick={() => onBeginReview(i)}
              className="w-full rounded-xl border p-4 text-left transition hover:shadow-sm"
              style={{ borderColor: "var(--rb-border)", background: "var(--rb-panel)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs" style={{ color: "var(--rb-muted)" }}>
                    {String(ch.index).padStart(2, "0")}
                  </span>
                  <RiskBadge risk={ch.risk} />
                  <span className="font-medium">{ch.title}</span>
                </div>
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <DiffStat additions={ch.additions} deletions={ch.deletions} />
                  <span className="text-xs" style={{ color: "var(--rb-muted)" }}>
                    {ch.fileCount} file{ch.fileCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm" style={{ color: "var(--rb-muted)" }}>
                <Markdown value={ch.description} variant="inline" className="inline" />
              </p>
            </button>
          </li>
        ))}
      </ol>

      <button
        onClick={() => onBeginReview(0)}
        disabled={chapters.length === 0}
        className="mt-8 rounded-lg px-5 py-2.5 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: "var(--rb-accent)" }}
      >
        Begin review →
      </button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
      style={{
        borderColor: active ? "var(--rb-accent)" : "transparent",
        color: active ? "var(--rb-fg)" : "var(--rb-muted)",
      }}
    >
      {children}
    </button>
  );
}

function Block({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--rb-muted)" }}>
        {heading}
      </h3>
      <div className="text-[0.95rem] leading-relaxed">{children}</div>
    </div>
  );
}
