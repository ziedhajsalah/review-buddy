import type { ReactNode } from "react";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import type { WorkerInitializationRenderOptions, WorkerPoolOptions } from "@pierre/diffs/react";
// Separate hashed asset (not ?worker&inline) so workers load from same-origin URLs
// compatible with the viewer CSP (default-src 'self'; blob:/data: workers blocked).
// @ts-expect-error Vite ?worker virtual module (no ambient types in this package)
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";

const poolOptions: WorkerPoolOptions = {
  poolSize: Math.min(Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1), 3),
  totalASTLRUCacheSize: 100,
  workerFactory: () => new DiffsWorker() as Worker,
};

const highlighterOptions: WorkerInitializationRenderOptions = {
  preferredHighlighter: "shiki-js",
  langs: [
    "typescript",
    "tsx",
    "javascript",
    "json",
    "css",
    "html",
    "python",
    "go",
    "rust",
    "sh",
    "yaml",
    "markdown",
  ],
};

export function ReviewWorkerPoolProvider({ children }: { children: ReactNode }) {
  return (
    <WorkerPoolContextProvider poolOptions={poolOptions} highlighterOptions={highlighterOptions}>
      {children}
    </WorkerPoolContextProvider>
  );
}
