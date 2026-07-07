import { useEffect, useRef, useState } from "react";
import type { ResolvedReview } from "../../../types/review.ts";
import { RiskBadge } from "./RiskBadge.tsx";
import { DiffStat } from "./DiffStat.tsx";
import { DisplaySettingsBar } from "./DisplaySettingsBar.tsx";
import { FileDiffCard } from "./FileDiffCard.tsx";
import { Markdown } from "./Markdown.tsx";
import { useDisplaySettings } from "../settings.ts";
import { useViewedFiles, clearViewedFiles } from "../lib/viewed.ts";
import { postDone } from "../api.ts";

export function ChapterReview({
  review,
  position,
  onNavigate,
  onExit,
}: {
  review: ResolvedReview;
  position: number;
  onNavigate: (position: number) => void;
  onExit: () => void;
}) {
  const [settings, updateSettings] = useDisplaySettings();
  const chapters = review.chapters;
  // -1 only when there is no chapter at `position`; the `if (!chapter)` guard
  // below returns before this bucket is ever read or toggled. The fallback
  // exists solely to keep useViewedFiles unconditional (a hook can't run after
  // that guard).
  const chapterIndex = chapters[position]?.index ?? -1;
  const [viewed, toggleViewed] = useViewedFiles(chapterIndex);
  const [filter, setFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const diffScrollRef = useRef<HTMLDivElement>(null);

  const chapter = chapters[position];

  // Scroll the diff pane to top and reset file filter whenever the chapter changes.
  useEffect(() => {
    diffScrollRef.current?.scrollTo({ top: 0 });
    setFilter("");
  }, [position]);

  if (!chapter) {
    return <div className="p-10">No chapters to review.</div>;
  }

  const files = filter
    ? chapter.files.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase()))
    : chapter.files;

  const prev = chapters[position - 1];
  const next = chapters[position + 1];

  const scrollToFile = (path: string) => {
    document
      .querySelector(`[data-file-path="${CSS.escape(path)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const done = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await postDone();
      clearViewedFiles();
      setSubmitted(true);
    } catch (e) {
      setSubmitError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="grid h-full place-items-center" style={{ color: "var(--rb-muted)" }}>
        Review submitted — you can close this tab.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header
        className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
        style={{ borderColor: "var(--rb-border)" }}
      >
        <button onClick={onExit} className="text-sm hover:underline" style={{ color: "var(--rb-muted)" }}>
          ← Overview
        </button>
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => prev && onNavigate(position - 1)}
            disabled={!prev}
            className="rounded px-2 py-1 disabled:opacity-30"
            style={{ border: "1px solid var(--rb-border)" }}
          >
            ← Prev
          </button>
          <span style={{ color: "var(--rb-muted)" }}>
            Chapter {position + 1} of {chapters.length}
          </span>
          <button
            onClick={() => next && onNavigate(position + 1)}
            disabled={!next}
            className="rounded px-2 py-1 disabled:opacity-30"
            style={{ border: "1px solid var(--rb-border)" }}
          >
            Next →
          </button>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={done}
            disabled={submitting}
            className="rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--rb-accent)" }}
          >
            {submitting ? "Submitting…" : "Done"}
          </button>
          {submitError && (
            <p className="text-xs" style={{ color: "var(--color-risk-high)" }}>
              {submitError}
            </p>
          )}
        </div>
      </header>

      {/* Split pane */}
      <div className="flex min-h-0 flex-1">
        {/* Left context panel */}
        <aside
          className="w-80 shrink-0 overflow-y-auto border-r p-4"
          style={{ borderColor: "var(--rb-border)", background: "var(--rb-panel)" }}
        >
          <div className="mb-2 flex items-center gap-2">
            <RiskBadge risk={chapter.risk} />
            <DiffStat additions={chapter.additions} deletions={chapter.deletions} />
          </div>
          <h1 className="text-lg font-semibold leading-snug">{chapter.title}</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--rb-muted)" }}>
            <span className="font-semibold" style={{ color: "var(--rb-fg)" }}>
              Risk:{" "}
            </span>
            <Markdown value={chapter.risk_reason} variant="inline" className="inline" />
          </p>
          <div className="mt-3 text-sm">
            <Markdown value={chapter.description} />
          </div>

          <h2 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--rb-muted)" }}>
            {chapter.files.length} file{chapter.files.length === 1 ? "" : "s"}
          </h2>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter files…"
            className="mb-2 w-full rounded-md border px-2 py-1 text-sm"
            style={{ borderColor: "var(--rb-border)", background: "var(--rb-bg)" }}
          />
          <ul className="space-y-0.5">
            {files.map((f) => (
              <li key={f.path}>
                <button
                  onClick={() => scrollToFile(f.path)}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-[var(--rb-bg)]"
                >
                  <span className="truncate font-mono" style={{ opacity: viewed.has(f.path) ? 0.5 : 1 }}>
                    {viewed.has(f.path) ? "✓ " : ""}
                    {f.path.split("/").pop()}
                  </span>
                  <DiffStat additions={f.additions} deletions={f.deletions} />
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Right diff pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          <DisplaySettingsBar settings={settings} update={updateSettings} />
          <div ref={diffScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex w-full flex-col gap-4">
              {files.map((f) => (
                <div key={f.path} data-file-path={f.path}>
                  <FileDiffCard
                    file={f}
                    settings={settings}
                    viewed={viewed.has(f.path)}
                    // Stable ref (useCallback in useViewedFiles) — pass it
                    // directly rather than re-wrapping it in a per-render arrow
                    // closure, which is what keeps FileDiffCard's memo alive.
                    // The card supplies the path.
                    onToggleViewed={toggleViewed}
                  />
                </div>
              ))}
              {files.length === 0 && (
                <p className="p-8 text-center text-sm" style={{ color: "var(--rb-muted)" }}>
                  No files match “{filter}”.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
