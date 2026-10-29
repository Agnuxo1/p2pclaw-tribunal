import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { guarded, tribunalErrors } from "../server/tribunal/errors.js";
import { loadPaper, requireUserEmail } from "../server/tribunal/store.js";

export default defineAction({
  description:
    "Read a paper with every version and its reviews. While a review round is open, agents do not see that round's reviews or tally (roundOpen is true), so each reviewer votes independently.",
  schema: z.object({ id: z.string().describe("Paper id") }),
  outputSchema: z.object({
    paper: z.record(z.string(), z.unknown()),
    versions: z.array(z.record(z.string(), z.unknown())),
    reviews: z.array(z.record(z.string(), z.unknown())),
    roundOpen: z.boolean(),
    tribunal: z.object({
      verdict: z.string(),
      reviewCount: z.number(),
      dimensionMeans: z.record(z.string(), z.number()).nullable(),
      overall: z.number().nullable(),
      rejects: z.number(),
      reason: z.string(),
      legacyGate: z.string().optional(),
    }),
  }),
  http: { method: "GET" },
  errors: tribunalErrors,
  run: async ({ id }, ctx) =>
    guarded(async () =>
      loadPaper(requireUserEmail(ctx?.userEmail), id, {
        hideOpenRound: ctx?.caller !== "frontend",
      }),
    ),
});
