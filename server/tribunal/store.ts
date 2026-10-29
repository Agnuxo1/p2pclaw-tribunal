import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { papers, paperVersions, reviews } from "../db/schema.js";
import { MAX_ROUNDS, tribunalVerdict, type ReviewScores } from "./score.js";

export function requireUserEmail(email: string | undefined | null): string {
  if (!email) throw new Error("Sign in to use the tribunal.");
  return email;
}

const now = () => new Date().toISOString();
const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export async function createPaper(ownerEmail: string, question: string, mode: string) {
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
  if (!row) throw new Error(`Paper ${id} not found.`);
  return row;
}

export async function saveDraft(
  ownerEmail: string,
  input: { paperId: string; title: string; abstract: string; body: string; changelog?: string | undefined },
  authorThread?: string,
) {
  const paper = await getOwnedPaper(ownerEmail, input.paperId);
  // A new version only opens a round when the paper is waiting for one.
  if (paper.status !== "drafting" && paper.status !== "revise") {
    throw new Error(`Cannot save a new version while the paper is "${paper.status}".`);
  }
  if (paper.round >= MAX_ROUNDS) throw new Error(`The tribunal allows at most ${MAX_ROUNDS} rounds.`);
  const version = paper.currentVersion + 1;
  const db = getDb();
  await db.insert(paperVersions).values({
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
  const status = paper.mode === "solo" ? "final" : "under_review";
  await db
    .update(papers)
    .set({ currentVersion: version, status, round: paper.round + 1, updatedAt: now() })
    .where(eq(papers.id, paper.id));
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
  caller: { kind: string; threadId?: string | undefined },
) {
  const paper = await getOwnedPaper(ownerEmail, input.paperId);
  if (paper.mode === "solo") throw new Error("Solo-mode papers have no tribunal.");
  if (paper.status !== "under_review") throw new Error(`Paper is "${paper.status}", not under review.`);
  // A person reviewing from the app UI is independent by construction. Any other
  // caller must be an in-app agent thread whose independence can be checked.
  const reviewerThread = caller.kind === "frontend" ? undefined : caller.threadId;
  if (caller.kind !== "frontend" && !reviewerThread) {
    throw new Error("Agent reviews must come from an in-app reviewer sub-agent thread, so independence can be checked.");
  }
  if (reviewerThread) {
    // Independence is structural: an agent may not review a version it wrote,
    // and each agent thread reviews a version at most once.
    const db = getDb();
    const [version] = await db
      .select({ authorThread: paperVersions.authorThread })
      .from(paperVersions)
      .where(and(eq(paperVersions.paperId, paper.id), eq(paperVersions.version, paper.currentVersion)));
    const prior = await db
      .select({ reviewerThread: reviews.reviewerThread })
      .from(reviews)
      .where(and(eq(reviews.paperId, paper.id), eq(reviews.version, paper.currentVersion)));
    if (version?.authorThread === reviewerThread || prior.some((r) => r.reviewerThread === reviewerThread)) {
      throw new Error(
        "Reviews must be independent: this agent thread wrote this version or already reviewed it. Spawn a separate reviewer sub-agent with agent-teams and let it call submit-review.",
      );
    }
  }
  const id = newId("rev");
  await getDb().insert(reviews).values({
    id,
    paperId: paper.id,
    version: paper.currentVersion,
    reviewer: input.reviewer,
    lens: input.lens,
    ...input.scores,
    recommendation: input.recommendation,
    comments: input.comments,
    reviewerThread: reviewerThread ?? null,
    createdAt: now(),
  });
  return { id, paperId: paper.id, version: paper.currentVersion };
}

export async function loadPaper(ownerEmail: string, id: string, opts: { hideOpenRound?: boolean } = {}) {
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
  // Agents must not read the open round's reviews before voting.
  const roundOpen = paper.status === "under_review";
  const visible = opts.hideOpenRound && roundOpen
    ? allReviews.filter((r) => r.version !== paper.currentVersion)
    : allReviews;
  const hiddenReviews = allReviews.length - visible.length;
  return {
    paper,
    versions,
    reviews: visible,
    hiddenReviews,
    tribunal: opts.hideOpenRound && roundOpen ? { ...tribunal, dimensionMeans: null, overall: null } : tribunal,
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
  if (paper.mode === "solo") throw new Error("Solo-mode papers have no tribunal.");
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
  if (!ref) throw new Error("No publication id to record.");
  await getDb()
    .update(papers)
    .set({ status: "published", publishedRef: ref, updatedAt: now() })
    .where(eq(papers.id, id));
}
