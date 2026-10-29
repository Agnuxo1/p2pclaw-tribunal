import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { papers, paperVersions, reviews } from "../db/schema.js";
import { TribunalError } from "./errors.js";
import { MAX_ROUNDS, tribunalVerdict, type ReviewScores } from "./score.js";

export function requireUserEmail(email: string | undefined | null): string {
  if (!email) throw new Error("Sign in to use the tribunal.");
  return email;
}

const now = () => new Date().toISOString();
const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export async function createPaper(
  ownerEmail: string,
  question: string,
  mode: string,
) {
  const id = newId("paper");
  const ts = now();
  await getDb().insert(papers).values({
    id,
    ownerEmail,
    question,
    mode,
    status: "drafting",
    currentVersion: 0,
    round: 0,
    createdAt: ts,
    updatedAt: ts,
  });
  return { id, question, mode, status: "drafting" };
}

export async function getOwnedPaper(ownerEmail: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(papers)
    .where(and(eq(papers.id, id), eq(papers.ownerEmail, ownerEmail)));
  if (!row) throw new TribunalError(`Paper ${id} not found.`, "not_found");
  return row;
}

export async function saveDraft(
  ownerEmail: string,
  input: {
    paperId: string;
    title: string;
    abstract: string;
    body: string;
    changelog?: string | undefined;
  },
  authorThread?: string,
) {
  const paper = await getOwnedPaper(ownerEmail, input.paperId);
  // A new version only opens a round when the paper is waiting for one.
  if (paper.status !== "drafting" && paper.status !== "revise") {
    throw new TribunalError(
      `Cannot save a new version while the paper is "${paper.status}".`,
      "invalid_state",
    );
  }
  if (paper.round >= MAX_ROUNDS)
    throw new TribunalError(
      `The tribunal allows at most ${MAX_ROUNDS} rounds.`,
      "invalid_state",
    );
  const version = paper.currentVersion + 1;
  const status = paper.mode === "solo" ? "final" : "under_review";
  await getDb().transaction(async (tx) => {
    // Conditional on the state read above, so two concurrent saves cannot both win;
    // the unique (paper_id, version) index backs this up.
    const moved = await tx
      .update(papers)
      .set({
        currentVersion: version,
        status,
        round: paper.round + 1,
        updatedAt: now(),
      })
      .where(
        and(
          eq(papers.id, paper.id),
          eq(papers.currentVersion, paper.currentVersion),
          eq(papers.status, paper.status),
        ),
      )
      .returning({ id: papers.id });
    if (moved.length !== 1)
      throw new TribunalError(
        "The paper changed while saving; read it again and retry.",
        "conflict",
      );
    await tx.insert(paperVersions).values({
      id: newId("ver"),
      paperId: paper.id,
      version,
      title: input.title,
      abstract: input.abstract,
      body: input.body,
      changelog: input.changelog ?? null,
      authorThread: authorThread ?? null,
      createdAt: now(),
    });
  });
  return { id: paper.id, version, status };
}

export async function submitReview(
  ownerEmail: string,
  input: {
    paperId: string;
    reviewer: string;
    lens: string;
    scores: ReviewScores["scores"];
    recommendation: ReviewScores["recommendation"];
    comments: string;
  },
  reviewerThread: string | undefined,
) {
  const paper = await getOwnedPaper(ownerEmail, input.paperId);
  if (paper.mode === "solo")
    throw new TribunalError(
      "Solo-mode papers have no tribunal.",
      "invalid_state",
    );
  if (paper.status !== "under_review")
    throw new TribunalError(
      `Paper is "${paper.status}", not under review.`,
      "invalid_state",
    );
  // Every vote comes from an in-app agent thread, so independence can be checked:
  // not the thread that wrote the version, one vote per thread and one per lens
  // (the last two are unique indexes, so concurrent calls cannot slip through).
  if (!reviewerThread) {
    throw new TribunalError(
      "Reviews must come from an in-app reviewer sub-agent thread, so their independence can be checked.",
      "not_independent",
    );
  }
  const db = getDb();
  const [version] = await db
    .select({ authorThread: paperVersions.authorThread })
    .from(paperVersions)
    .where(
      and(
        eq(paperVersions.paperId, paper.id),
        eq(paperVersions.version, paper.currentVersion),
      ),
    );
  if (version?.authorThread === reviewerThread) {
    throw new TribunalError(
      "Reviews must be independent: this agent thread wrote this version. Spawn a separate reviewer sub-agent with agent-teams and let it call submit-review.",
      "not_independent",
    );
  }
  const id = newId("rev");
  try {
    await db.insert(reviews).values({
      id,
      paperId: paper.id,
      version: paper.currentVersion,
      reviewer: input.reviewer,
      lens: input.lens,
      ...input.scores,
      recommendation: input.recommendation,
      comments: input.comments,
      reviewerThread,
      createdAt: now(),
    });
  } catch (err) {
    if (/unique|duplicate/i.test(String(err))) {
      throw new TribunalError(
        "Reviews must be independent: this version already has a review from this agent thread or for this lens. Spawn a separate reviewer sub-agent for each remaining lens.",
        "not_independent",
      );
    }
    throw err;
  }
  return { id, paperId: paper.id, version: paper.currentVersion };
}

export async function loadPaper(
  ownerEmail: string,
  id: string,
  opts: { hideOpenRound?: boolean } = {},
) {
  const paper = await getOwnedPaper(ownerEmail, id);
  const db = getDb();
  const versions = await db
    .select()
    .from(paperVersions)
    .where(eq(paperVersions.paperId, id))
    .orderBy(asc(paperVersions.version));
  const allReviews = await db
    .select()
    .from(reviews)
    .where(eq(reviews.paperId, id))
    .orderBy(asc(reviews.createdAt));
  const current = allReviews.filter((r) => r.version === paper.currentVersion);
  const tribunal = tribunalVerdict(current.map(toScores), paper.round);
  // While a round is open, agents see neither the votes nor any tally of them.
  const hidden = Boolean(opts.hideOpenRound) && paper.status === "under_review";
  return {
    paper,
    versions,
    reviews: hidden
      ? allReviews.filter((r) => r.version !== paper.currentVersion)
      : allReviews,
    roundOpen: hidden,
    tribunal: hidden
      ? {
          verdict: "pending" as const,
          reviewCount: 0,
          dimensionMeans: null,
          overall: null,
          rejects: 0,
          reason:
            "Review round open: votes stay hidden until tribunal-verdict closes it.",
        }
      : tribunal,
  };
}

export function toScores(r: typeof reviews.$inferSelect): ReviewScores {
  return {
    reviewer: r.reviewer,
    lens: r.lens,
    scores: {
      novelty: r.novelty,
      rigor: r.rigor,
      evidence: r.evidence,
      clarity: r.clarity,
      reproducibility: r.reproducibility,
    },
    recommendation: r.recommendation as ReviewScores["recommendation"],
  };
}

export async function recordVerdict(ownerEmail: string, id: string) {
  const { paper, tribunal } = await loadPaper(ownerEmail, id);
  if (paper.mode === "solo")
    throw new TribunalError(
      "Solo-mode papers have no tribunal.",
      "invalid_state",
    );
  if (tribunal.verdict !== "pending") {
    await getDb()
      .update(papers)
      .set({ status: tribunal.verdict, updatedAt: now() })
      .where(eq(papers.id, id));
  }
  return { id, version: paper.currentVersion, round: paper.round, ...tribunal };
}

export async function listPapers(ownerEmail: string) {
  return getDb()
    .select({
      id: papers.id,
      question: papers.question,
      mode: papers.mode,
      status: papers.status,
      currentVersion: papers.currentVersion,
      updatedAt: papers.updatedAt,
    })
    .from(papers)
    .where(eq(papers.ownerEmail, ownerEmail))
    .orderBy(desc(papers.updatedAt))
    .limit(100);
}

export async function markPublished(id: string, ref: string) {
  if (!ref)
    throw new TribunalError("No publication id to record.", "upstream_failed");
  await getDb()
    .update(papers)
    .set({ status: "published", publishedRef: ref, updatedAt: now() })
    .where(eq(papers.id, id));
}
