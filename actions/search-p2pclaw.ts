import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { searchPriorWork } from "../server/tribunal/p2pclaw.js";

export default defineAction({
  description:
    "Search recent papers on the public P2PCLAW network for prior work related to a query (keyword match over the 200 latest papers). Use before drafting to cite or avoid duplicating work.",
  schema: z.object({
    query: z.string().min(3).describe("Keywords describing the topic"),
    k: z.coerce.number().int().min(1).max(10).default(5).describe("Results to return, 1-10, default 5"),
  }),
  outputSchema: z.array(
    z.object({ id: z.string(), title: z.string(), author: z.string(), excerpt: z.string(), score: z.number() }),
  ),
  http: { method: "GET" },
  run: async ({ query, k }) => searchPriorWork(query, k),
});
