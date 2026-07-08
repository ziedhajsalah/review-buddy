import { memo, useMemo, useState } from "react";
import { PatchDiff, FileDiff } from "@pierre/diffs/react";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { ResolvedFile, DisplaySettings } from "../../../types/review.ts";
import { fetchFileContent } from "../api.ts";
import { DiffStat } from "./DiffStat.tsx";
import { requiredSides, canExpand, buildExpandedDiff } from "../lib/expand.ts";
import { fileToPatch } from "../lib/patch.ts";
import { toDiffOptions } from "../settings.ts";

const CHANGE_LABEL: Record<ResolvedFile["change_type"], string> = {
  added: "added",
  deleted: "deleted",
  modified: "modified",
  renamed: "renamed",
};

// Memoized on purpose: ChapterReview mounts one card per file and re-renders on
// every filter keystroke / viewed toggle. Each card re-render synchronously
// re-runs @pierre/diffs' main-thread render, so without memo one keystroke
// re-highlights every diff. memo only works while its props stay referentially
// stable — in particular `onToggleViewed` must be passed as a stable callback
// (it takes the path so the parent can hand over `toggleViewed` directly rather
// than allocating a per-render arrow). Do not re-wrap it in a closure.
export const FileDiffCard = memo(function FileDiffCard({
  file,
  settings,
  viewed,
  onToggleViewed,
}: {
  file: ResolvedFile;
  settings: DisplaySettings;
  viewed: boolean;
  onToggleViewed: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedDiff, setExpandedDiff] = useState<FileDiffMetadata | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  const [expandNotice, setExpandNotice] = useState<string | null>(null);

  const patch = useMemo(() => fileToPatch(file), [file]);
  const options = useMemo(() => toDiffOptions(settings), [settings]);
  const expandedOptions = useMemo(() => ({ ...options, expandUnchanged: true }), [options]);

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(file.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const toggleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (expandedDiff) {
      setExpanded(true);
      return;
    }
    setExpandNotice(null);
    setExpandLoading(true);
    try {
      const req = requiredSides(file.change_type);
      // A required side that 200s with content === "" is handled below by
      // canExpand (the plan-008 "unavailable" contract). A required side that
      // REJECTS (non-2xx / network — e.g. a rename whose old_path isn't
      // allowlisted) propagates to the catch and surfaces the error string,
      // per plan 015 Step 3. Either way we never render an empty file as content.
      const [base, head] = await Promise.all([
        req.base ? fetchFileContent(file.old_path ?? file.path, "base").then((r) => r.content) : Promise.resolve(""),
        req.head ? fetchFileContent(file.path, "head").then((r) => r.content) : Promise.resolve(""),
      ]);
      if (!canExpand(file, base, head)) {
        setExpandNotice("Full file unavailable (not on disk for this review).");
        return;
      }
      setExpandedDiff(buildExpandedDiff(file, base, head));
      setExpanded(true);
    } catch (e) {
      setExpandNotice(`Full file unavailable — ${String(e)}`);
    } finally {
      setExpandLoading(false);
    }
  };

  return (
    <section
      className="overflow-hidden rounded-lg border"
      style={{ borderColor: "var(--rb-border)", opacity: viewed ? 0.6 : 1 }}
    >
      {/* File header */}
      <header
        className="flex items-center justify-between gap-3 border-b px-3 py-2"
        style={{ borderColor: "var(--rb-border)", background: "var(--rb-panel)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="shrink-0 font-mono text-xs"
            style={{ color: "var(--rb-muted)" }}
            title={collapsed ? "Expand" : "Collapse"}
            aria-label={collapsed ? "Expand file" : "Collapse file"}
          >
            {collapsed ? "▸" : "▾"}
          </button>
          <span className="truncate font-mono text-sm" title={file.path}>
            {file.old_path ? `${file.old_path} → ${file.path}` : file.path}
          </span>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[0.62rem] uppercase"
            style={{ background: "var(--rb-bg)", color: "var(--rb-muted)", border: "1px solid var(--rb-border)" }}
          >
            {CHANGE_LABEL[file.change_type]}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <DiffStat additions={file.additions} deletions={file.deletions} />
          <button onClick={copyName} className="text-xs hover:underline" style={{ color: "var(--rb-muted)" }}>
            {copied ? "copied!" : "copy path"}
          </button>
          {!file.binary && (
            <button
              onClick={toggleExpand}
              disabled={expandLoading}
              className="text-xs hover:underline disabled:opacity-50"
              style={{ color: "var(--rb-muted)" }}
            >
              {expandLoading ? "expanding…" : expanded ? "collapse to diff" : "expand"}
            </button>
          )}
          <label className="flex cursor-pointer items-center gap-1 text-xs select-none" style={{ color: "var(--rb-muted)" }}>
            <input type="checkbox" checked={viewed} onChange={() => onToggleViewed(file.path)} className="accent-[var(--rb-accent)]" />
            viewed
          </label>
        </div>
      </header>

      {!collapsed &&
        (file.binary ? (
          <p className="p-4 text-sm" style={{ color: "var(--rb-muted)" }}>
            Binary file — content not shown.
          </p>
        ) : (
          <>
            {expandNotice && (
              <p className="px-3 py-2 text-xs" style={{ color: "var(--rb-muted)" }}>
                {expandNotice}
              </p>
            )}
            <div className="overflow-x-auto text-[13px]">
              {expanded && expandedDiff ? (
                <FileDiff fileDiff={expandedDiff} options={expandedOptions} disableWorkerPool />
              ) : (
                <PatchDiff patch={patch} options={options} disableWorkerPool />
              )}
            </div>
          </>
        ))}
    </section>
  );
});
