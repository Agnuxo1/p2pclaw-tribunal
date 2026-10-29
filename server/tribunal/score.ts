// Deterministic P2PCLAW tribunal rules. Shared by the app actions and the
// ablation harness, so the verdict used in experiments is the one users see.

export const DIMENSIONS = [
  "novelty",
  "rigor",
  "evidence",
  "clarity",
  "reproducibility",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const LENSES = ["methodologist", "domain-expert", "skeptic"] as const;
export type Lens = (typeof LENSES)[number];

export type Recommendation = "accept" | "revise" | "reject";

export interface ReviewScores {
  reviewer: string;
  lens: string;
  scores: Record<Dimension, number>;
  recommendation: Recommendation;
}

export const QUORUM = 3;
export const ACCEPT_MEAN = 6.5;
export const ACCEPT_MIN_DIMENSION = 5;
export const REJECT_MEAN = 4.5; // used only by legacyGate
export const MAX_ROUNDS = 2;

export type Verdict = "pending" | "accepted" | "revise" | "rejected";

export interface TribunalResult {
  verdict: Verdict;
  reviewCount: number;
  dimensionMeans: Record<Dimension, number> | null;
  overall: number | null;
  rejects: number;
  reason: string;
  legacyGate?: Verdict;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function tribunalVerdict(
  reviews: ReviewScores[],
  round: number,
): TribunalResult {
  // One vote per reviewer: the latest review from each reviewer counts.
  const byReviewer = new Map<string, ReviewScores>();
  for (const r of reviews) byReviewer.set(r.reviewer, r);
  const votes = [...byReviewer.values()];

  const lenses = new Set(votes.map((v) => v.lens)).size;
  if (votes.length < QUORUM || lenses < QUORUM) {
    return {
      verdict: "pending",
      reviewCount: votes.length,
      dimensionMeans: null,
      overall: null,
      rejects: votes.filter((v) => v.recommendation === "reject").length,
      reason: `Quorum not reached: ${votes.length} reviews from ${lenses} distinct lenses (need ${QUORUM} of each).`,
    };
  }

  const means = Object.fromEntries(
    DIMENSIONS.map((d) => [
      d,
      round2(votes.reduce((s, v) => s + v.scores[d], 0) / votes.length),
    ]),
  ) as Record<Dimension, number>;
  const overall = round2(
    DIMENSIONS.reduce((s, d) => s + means[d], 0) / DIMENSIONS.length,
  );
  const minDim = Math.min(...DIMENSIONS.map((d) => means[d]));
  const rejects = votes.filter((v) => v.recommendation === "reject").length;

  // Before the last round any non-accept outcome sends the paper back for
  // revision (pilot-driven amendment, JEV 0.98); rejection is final only in
  // the last round. legacyGate keeps the original immediate-reject rule.
  const accepted =
    overall >= ACCEPT_MEAN && minDim >= ACCEPT_MIN_DIMENSION && rejects === 0;
  const legacyGate: Verdict =
    overall < REJECT_MEAN || rejects >= 2
      ? "rejected"
      : accepted
        ? "accepted"
        : round >= MAX_ROUNDS
          ? "rejected"
          : "revise";
  let verdict: Verdict;
  let reason: string;
  if (accepted) {
    verdict = "accepted";
    reason = `Overall ${overall} >= ${ACCEPT_MEAN}, weakest dimension ${minDim} >= ${ACCEPT_MIN_DIMENSION}, no reject votes.`;
  } else if (round < MAX_ROUNDS) {
    verdict = "revise";
    reason = `Overall ${overall}, weakest dimension ${minDim}, ${rejects} reject vote(s): revise and resubmit (round ${round}/${MAX_ROUNDS}).`;
  } else {
    verdict = "rejected";
    reason = `Still below the acceptance bar after ${MAX_ROUNDS} review rounds (overall ${overall}, weakest ${minDim}, ${rejects} reject vote(s)).`;
  }
  return {
    verdict,
    legacyGate,
    reviewCount: votes.length,
    dimensionMeans: means,
    overall,
    rejects,
    reason,
  };
}
