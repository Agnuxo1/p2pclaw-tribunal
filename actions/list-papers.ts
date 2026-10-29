import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listPapers, requireUserEmail } from "../server/tribunal/store.js";

export default defineAction({
  description: "List the signed-in user's papers, newest first, with mode and status.",
  schema: z.object({}),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      mode: z.string(),
      status: z.string(),
      currentVersion: z.number(),
      updatedAt: z.string(),
    }),
  ),
  http: { method: "GET" },
  run: async (_args, ctx) => listPapers(requireUserEmail(ctx?.userEmail)),
});
