import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { guarded, tribunalErrors } from "../server/tribunal/errors.js";
import { LENSES } from "../server/tribunal/score.js";
import { requireUserEmail, submitReview } from "../server/tribunal/store.js";

const score = (what: string) =>
  z
    .number()
    .min(0)
    .max(10)
    .describe(`${what}, 0-10 (5 = adequate, 8+ = strong)`);

export default defineAction({
  description:
    "Record one independent peer review of the current version of a paper: five 0-10 scores, a recommendation and concrete comments. Reviewers must not see each other's reviews. It must be called from a reviewer sub-agent's own thread: the author's thread, a second review from the same thread and a second review for the same lens are refused.",
  schema: z.object({
    paperId: z.string().describe("Paper id"),
    reviewer: z
      .string()
      .min(2)
      .describe("Reviewer name, e.g. reviewer-methodologist"),
    lens: z
      .enum(LENSES)
      .describe('Review lens: "methodologist", "domain-expert" or "skeptic"'),
    scores: z.object({
      novelty: score("Novelty"),
      rigor: score("Methodological rigor"),
      evidence: score("Evidence and citations"),
      clarity: score("Clarity"),
      reproducibility: score("Reproducibility"),
    }),
    recommendation: z
      .enum(["accept", "revise", "reject"])
      .describe('"accept", "revise" or "reject"'),
    comments: z
      .string()
      .min(40)
      .describe("Specific, actionable comments the author can fix"),
  }),
  outputSchema: z.object({
    id: z.string(),
    paperId: z.string(),
    version: z.number(),
  }),
  errors: tribunalErrors,
  run: async (args, ctx) =>
    guarded(async () =>
      submitReview(requireUserEmail(ctx?.userEmail), args, ctx?.threadId),
    ),
});
