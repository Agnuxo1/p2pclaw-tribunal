import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { guarded, tribunalErrors } from "../server/tribunal/errors.js";
import { createPaper, requireUserEmail } from "../server/tribunal/store.js";

export default defineAction({
  description:
    'Open a new research paper for a question. mode "tribunal" (default) sends drafts to three peer reviewers; mode "solo" is the single-agent control with no review.',
  schema: z.object({
    question: z
      .string()
      .min(5)
      .describe("The research question the paper must answer"),
    mode: z
      .enum(["tribunal", "solo"])
      .default("tribunal")
      .describe(
        '"tribunal" (peer review, default) or "solo" (no review, control)',
      ),
  }),
  outputSchema: z.object({
    id: z.string(),
    question: z.string(),
    mode: z.string(),
    status: z.string(),
    nextRequiredAction: z.string(),
  }),
  errors: tribunalErrors,
  run: async ({ question, mode }, ctx) =>
    guarded(async () => {
      const paper = await createPaper(
        requireUserEmail(ctx?.userEmail),
        question,
        mode,
      );
      return { ...paper, nextRequiredAction: "save-draft" };
    }),
});
