import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { guarded, tribunalErrors } from "../server/tribunal/errors.js";
import { requireUserEmail, saveDraft } from "../server/tribunal/store.js";

export default defineAction({
  description:
    "Save a new version of a paper (title, abstract, Markdown body). Each call creates version N+1 and, in tribunal mode, opens a review round.",
  schema: z.object({
    paperId: z.string().describe("Paper id from create-paper"),
    title: z.string().min(3).describe("Paper title"),
    abstract: z.string().min(20).describe("Abstract, 80-200 words"),
    body: z
      .string()
      .min(200)
      .describe(
        "Markdown body: Introduction, Method, Results/Analysis, Limitations, References",
      ),
    changelog: z
      .string()
      .optional()
      .describe("For revisions: what changed in answer to each reviewer"),
  }),
  outputSchema: z.object({
    id: z.string(),
    version: z.number(),
    status: z.string(),
    nextRequiredAction: z.string().optional(),
  }),
  errors: tribunalErrors,
  run: async (args, ctx) =>
    guarded(async () => {
      const saved = await saveDraft(
        requireUserEmail(ctx?.userEmail),
        args,
        ctx?.threadId,
      );
      return saved.status === "under_review"
        ? { ...saved, nextRequiredAction: "submit-review" }
        : saved;
    }),
});
