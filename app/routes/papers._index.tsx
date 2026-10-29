import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionQuery } from "@agent-native/core/client/hooks";
import { useState } from "react";
import { Link } from "react-router";

import { StatusBadge } from "@/components/papers/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Papers — ${APP_TITLE}` }];
}

export default function PapersRoute() {
  const { data: papers, isLoading } = useActionQuery("list-papers", {});
  const [question, setQuestion] = useState("");

  const start = (mode: "tribunal" | "solo") => {
    const q = question.trim();
    if (q.length < 5) return;
    sendToAgentChat({
      message:
        mode === "tribunal"
          ? `Run the full P2PCLAW tribunal on this research question: "${q}"`
          : `Run the solo control (one researcher, no peer review) on this research question: "${q}"`,
      submit: true,
      openSidebar: true,
    });
    setQuestion("");
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Research papers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A researcher agent drafts, three independent reviewer agents score it,
          and a deterministic tribunal decides: accept, revise or reject.
          Accepted papers can be published to the P2PCLAW network after your
          approval.
        </p>
      </header>

      <form
        className="mb-8 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          start("tribunal");
        }}
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a research question…"
          aria-label="Research question"
        />
        <Button type="submit">Convene tribunal</Button>
        <Button type="button" variant="outline" onClick={() => start("solo")}>
          Solo control
        </Button>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !papers?.length ? (
        <p className="text-sm text-muted-foreground">
          No papers yet. Ask a question above or in the chat.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {papers.map((p) => (
            <li key={p.id}>
              <Link
                to={`/papers/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {p.question}
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.mode} · v{p.currentVersion}
                </span>
                <StatusBadge status={p.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
