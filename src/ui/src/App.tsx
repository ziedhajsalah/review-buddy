import { useEffect, useState } from "react";
import type { ResolvedReview } from "../../types/review.ts";
import { fetchReview } from "./api.ts";
import { Overview } from "./components/Overview.tsx";
import { ChapterReview } from "./components/ChapterReview.tsx";

type View = { mode: "overview" } | { mode: "chapter"; position: number };

export function App() {
  const [review, setReview] = useState<ResolvedReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ mode: "overview" });

  useEffect(() => {
    fetchReview().then(setReview, (e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-xl p-10 text-center">
        <h1 className="mb-2 text-lg font-semibold">Couldn’t load the review</h1>
        <p className="font-mono text-sm" style={{ color: "var(--rb-muted)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="grid h-full place-items-center" style={{ color: "var(--rb-muted)" }}>
        Loading review…
      </div>
    );
  }

  if (view.mode === "chapter") {
    return (
      <ChapterReview
        review={review}
        position={view.position}
        onNavigate={(position) => setView({ mode: "chapter", position })}
        onExit={() => setView({ mode: "overview" })}
      />
    );
  }

  return (
    <Overview
      review={review}
      onBeginReview={(position) => setView({ mode: "chapter", position })}
    />
  );
}
