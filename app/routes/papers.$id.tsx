import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionQuery } from "@agent-native/core/client/hooks";
import { useState } from "react";
import { Link, useParams } from "react-router";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/papers/StatusBadge";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Paper — ${APP_TITLE}` }];
}

const DIMENSIONS = ["novelty", "rigor", "evidence", "clarity", "reproducibility"] as const;

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 capitalize text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-primary"
          style={{ width: `${Math.max(0, Math.min(10, value)) * 10}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums">{value.toFixed(1)}</span>
    </div>
  );
}

export default function PaperRoute() {
  const { id = "" } = useParams();
  const { data, isLoading, error } = useActionQuery("get-paper", { id });
  const [selected, setSelected] = useState<number | null>(null);

  if (isLoading) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="p-8 text-sm text-red-600">Paper not found.</p>;

  const paper = data.paper as { id: string; question: string; mode: string; status: string; currentVersion: number; round: number; publishedRef: string | null };
  const versions = data.versions as { version: number; title: string; abstract: string; body: string; changelog: string | null }[];
  const reviews = data.reviews as ({ id: string; version: number; reviewer: string; lens: string; recommendation: string; comments: string } & Record<(typeof DIMENSIONS)[number], number>)[];
  const tribunal = data.tribunal;
  const shown = versions.find((v) => v.version === (selected ?? paper.currentVersion));
  const shownReviews = reviews.filter((r) => r.version === shown?.version);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_340px]">
      <article className="min-w-0">
        <Link to="/papers" className="text-xs text-muted-foreground hover:underline">
          ← All papers
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={paper.status} />
          <span className="text-xs text-muted-foreground">
            {paper.mode} mode · round {paper.round}
          </span>
          {paper.publishedRef && (
            <span className="text-xs text-sky-700">P2PCLAW: {paper.publishedRef}</span>
          )}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Question: {paper.question}</p>

        {versions.length > 1 && (
          <div className="mt-4 flex gap-1" role="tablist" aria-label="Versions">
            {versions.map((v) => (
              <Button
                key={v.version}
                size="sm"
                variant={v.version === shown?.version ? "default" : "outline"}
                onClick={() => setSelected(v.version)}
              >
                v{v.version}
              </Button>
            ))}
          </div>
        )}

        {shown ? (
          <>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">{shown.title}</h1>
            <p className="mt-3 rounded-md bg-muted/50 p-3 text-sm">{shown.abstract}</p>
            {shown.changelog && (
              <p className="mt-3 border-l-2 border-primary pl-3 text-xs text-muted-foreground">
                Changes: {shown.changelog}
              </p>
            )}
            <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {shown.body}
            </pre>
          </>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">The researcher is drafting…</p>
        )}
      </article>

      <aside className="flex flex-col gap-4">
        {paper.mode === "tribunal" && (
          <section className="rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Tribunal · v{paper.currentVersion}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{tribunal.reason}</p>
            {tribunal.dimensionMeans && (
              <div className="mt-3 flex flex-col gap-1.5">
                {DIMENSIONS.map((d) => (
                  <ScoreBar key={d} label={d} value={tribunal.dimensionMeans?.[d] ?? 0} />
                ))}
                <p className="mt-1 text-sm font-medium">Overall {tribunal.overall}/10</p>
              </div>
            )}
            {paper.status === "accepted" && (
              <Button
                className="mt-3 w-full"
                onClick={() =>
                  sendToAgentChat({
                    message: `Preview publishing paper ${paper.id} to P2PCLAW (dry run), then ask me before publishing for real.`,
                    submit: true,
                    openSidebar: true,
                  })
                }
              >
                Publish to P2PCLAW…
              </Button>
            )}
          </section>
        )}

        {shownReviews.map((r) => (
          <section key={r.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold capitalize">{r.lens.replace("-", " ")}</h3>
              <span className="text-xs uppercase text-muted-foreground">{r.recommendation}</span>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {DIMENSIONS.map((d) => (
                <ScoreBar key={d} label={d} value={r[d]} />
              ))}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{r.comments}</p>
          </section>
        ))}
      </aside>
    </div>
  );
}
