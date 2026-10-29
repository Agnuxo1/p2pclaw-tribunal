// Thin client for the public P2PCLAW network API (https://github.com/Agnuxo1/p2pclaw).
export const P2PCLAW_API = "https://p2pclaw-api.onrender.com";

interface RawPaper {
  _?: { "#"?: string };
  id?: string;
  title?: string;
  author?: string;
  content?: string;
  timestamp?: number;
}

export interface PriorPaper {
  id: string;
  title: string;
  author: string;
  excerpt: string;
  score: number;
}

const tokens = (s: string) =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3);

export async function searchPriorWork(query: string, k: number): Promise<PriorPaper[]> {
  const res = await fetch(`${P2PCLAW_API}/latest-papers?limit=200`, {
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`P2PCLAW API answered ${res.status}`);
  const rows = (await res.json()) as RawPaper[];
  const q = new Set(tokens(query));
  return rows
    .map((r) => {
      const text = `${r.title ?? ""} ${(r.content ?? "").slice(0, 3000)}`;
      const hits = tokens(text).filter((t) => q.has(t)).length;
      const id = r.id ?? r._?.["#"]?.split("/").pop() ?? "unknown";
      return {
        id,
        title: r.title ?? "(untitled)",
        author: r.author ?? "unknown",
        excerpt: (r.content ?? "").replace(/\s+/g, " ").slice(0, 400),
        score: hits,
      };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export async function publishPaper(payload: { title: string; content: string; author: string; agentId: string }) {
  const res = await fetch(`${P2PCLAW_API}/publish-paper`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.success === false) {
    throw new Error(`P2PCLAW rejected the paper (${res.status}): ${String(body.message ?? body.error ?? "unknown")}`);
  }
  const ref = body.paperId ?? body.id ?? body.paper_id;
  if (typeof ref !== "string" || !ref) {
    throw new Error("P2PCLAW answered without a paper id; the publication could not be verified.");
  }
  return ref;
}
