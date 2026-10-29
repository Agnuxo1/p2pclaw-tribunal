import { describe, expect, it } from "vitest";

import publish from "../actions/publish-to-p2pclaw";
import { tribunalVerdict, type ReviewScores } from "../server/tribunal/score";

const LENS: Record<string, string> = { a: "methodologist", b: "domain-expert", c: "skeptic" };
const review = (reviewer: string, x: number, recommendation: ReviewScores["recommendation"] = "revise"): ReviewScores => ({
  reviewer,
  lens: LENS[reviewer] ?? "skeptic",
  scores: { novelty: x, rigor: x, evidence: x, clarity: x, reproducibility: x },
  recommendation,
});

describe("tribunalVerdict", () => {
  it("waits for a quorum of three distinct reviewers", () => {
    const r = tribunalVerdict([review("a", 9, "accept"), review("a", 9, "accept"), review("b", 9, "accept")], 1);
    expect(r.verdict).toBe("pending");
    expect(r.reviewCount).toBe(2);
  });
  it("needs three distinct lenses, not just three reviewer names", () => {
    const same = (r: string) => ({ ...review(r, 9, "accept"), lens: "skeptic" });
    expect(tribunalVerdict([same("a"), same("b"), same("c")], 1).verdict).toBe("pending");
  });
  it("accepts a strong paper with no reject votes", () => {
    expect(tribunalVerdict([review("a", 7, "accept"), review("b", 7, "accept"), review("c", 6.5, "accept")], 1).verdict).toBe("accepted");
  });
  it("asks for revision in the middle band", () => {
    expect(tribunalVerdict([review("a", 6), review("b", 6), review("c", 5)], 1).verdict).toBe("revise");
  });
  it("rejects after the last round", () => {
    expect(tribunalVerdict([review("a", 6), review("b", 6), review("c", 5)], 2).verdict).toBe("rejected");
  });
  it("sends a first-round paper with two reject votes back for revision", () => {
    const r = tribunalVerdict([review("a", 8, "reject"), review("b", 8, "reject"), review("c", 8, "accept")], 1);
    expect(r.verdict).toBe("revise");
    expect(r.legacyGate).toBe("rejected");
  });
  it("rejects a weak paper in the last round", () => {
    expect(tribunalVerdict([review("a", 2, "reject"), review("b", 3, "reject"), review("c", 2)], 2).verdict).toBe("rejected");
  });
  it("one reject vote blocks acceptance", () => {
    expect(tribunalVerdict([review("a", 8, "reject"), review("b", 8, "accept"), review("c", 8, "accept")], 1).verdict).toBe("revise");
  });
});

describe("publish-to-p2pclaw approval gate", () => {
  const gate = (publish as unknown as { needsApproval: (a: { paperId: string; dryRun: boolean }) => boolean }).needsApproval;
  it("needs human approval for a real publish", () => {
    expect(gate({ paperId: "p", dryRun: false })).toBe(true);
  });
  it("dry runs need no approval", () => {
    expect(gate({ paperId: "p", dryRun: true })).toBe(false);
  });
});
