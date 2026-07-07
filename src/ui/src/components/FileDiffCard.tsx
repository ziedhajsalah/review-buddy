import { useMemo, useState } from "react";
import { PatchDiff } from "@pierre/diffs/react";
import type { ResolvedFile, DisplaySettings } from "../../../types/review.ts";
import { DiffStat } from "./DiffStat.tsx";
import { fileToPatch } from "../lib/patch.ts";
import { toDiffOptions } from "../settings.ts";

const CHANGE_LABEL: Record<ResolvedFile["change_type"], string> = {
  added: "added",
  deleted: "deleted",
  modified: "modified",
  renamed: "renamed",
};

export function FileDiffCard({
  file,
  settings,
  viewed,
  onToggleViewed,
}: {
  file: ResolvedFile;
  settings: DisplaySettings;
  viewed: boolean;
  onToggleViewed: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const patch = useMemo(() => fileToPatch(file), [file]);
  const options = useMemo(() => toDiffOptions(settings), [settings]);

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(file.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — ignore */
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
          <label className="flex cursor-pointer items-center gap-1 text-xs select-none" style={{ color: "var(--rb-muted)" }}>
            <input type="checkbox" checked={viewed} onChange={onToggleViewed} className="accent-[var(--rb-accent)]" />
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
          <div className="overflow-x-auto text-[13px]">
            <PatchDiff patch={patch} options={options} disableWorkerPool />
          </div>
        ))}
    </section>
  );
}
