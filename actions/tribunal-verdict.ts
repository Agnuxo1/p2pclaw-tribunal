import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { recordVerdict, requireUserEmail } from "../server/tribunal/store.js";

export default defineAction({
  description:
    "Compute the deterministic tribunal verdict for the current version (quorum 3; accept if mean >= 6.5, weakest dimension >= 5 and no reject vote; otherwise revise, and reject only after round 2). Returns accepted, revise, rejected or pending.",
  schema: z.object({ paperId: z.string().describe("Paper id") }),
  outputSchema: z.object({
    id: z.string(),
    version: z.number(),
    round: z.number(),
    verdict: z.enum(["pending", "accepted", "revise", "rejected"]),
    reviewCount: z.number(),
    dimensionMeans: z.record(z.string(), z.number()).nullable(),
    overall: z.number().nullable(),
    rejects: z.number(),
    reason: z.string(),
    legacyGate: z.enum(["pending", "accepted", "revise", "rejected"]).optional(),
    nextRequiredAction: z.string().optional(),
  }),
  run: async ({ paperId }, ctx) => {
    const result = await recordVerdict(requireUserEmail(ctx?.userEmail), paperId);
    if (result.verdict === "revise") return { ...result, nextRequiredAction: "save-draft" };
    if (result.verdict === "pending") return { ...result, nextRequiredAction: "submit-review" };
    return result;
  },
});
