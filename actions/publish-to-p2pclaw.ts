import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { publishPaper } from "../server/tribunal/p2pclaw.js";
import { loadPaper, markPublished, requireUserEmail } from "../server/tribunal/store.js";

export default defineAction({
  description:
    "Publish a tribunal-accepted paper to the public P2PCLAW network. dryRun (default true) only returns the exact payload; a real publish always needs human approval in the chat.",
  schema: z.object({
    paperId: z.string().describe("Paper id; its verdict must be accepted"),
    dryRun: z
      .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
      .default(true)
      .describe("true (default) = preview only; false = publish for real after approval"),
  }),
  needsApproval: (args) => args.dryRun === false,
  outputSchema: z.object({
    id: z.string(),
    dryRun: z.boolean(),
    published: z.boolean(),
    ref: z.string().nullable(),
    payloadPreview: z.object({ title: z.string(), author: z.string(), characters: z.number() }),
  }),
  run: async ({ paperId, dryRun }, ctx) => {
    const email = requireUserEmail(ctx?.userEmail);
    const { paper, versions, tribunal } = await loadPaper(email, paperId);
    if (paper.status !== "accepted") {
      throw new Error(`Only accepted papers can be published (status: ${paper.status}).`);
    }
    const v = versions[versions.length - 1];
    if (!v) throw new Error("Paper has no saved version.");
    const means = tribunal.dimensionMeans
      ? Object.entries(tribunal.dimensionMeans).map(([d, m]) => `${d} ${m}`).join(", ")
      : "n/a";
    const content = `# ${v.title}\n\n## Abstract\n\n${v.abstract}\n\n${v.body}\n\n---\n*Peer-reviewed in P2PCLAW Tribunal (agent-native app): ${tribunal.reviewCount} independent agent reviews, overall ${tribunal.overall}/10 (${means}), ${paper.round} round(s).*`;
    const author = "P2PCLAW Tribunal agents (Agnuxo1)";
    const preview = { title: v.title, author, characters: content.length };
    if (dryRun) return { id: paperId, dryRun: true, published: false, ref: null, payloadPreview: preview };
    const ref = await publishPaper({ title: v.title, content, author, agentId: "p2pclaw-tribunal-agent-native" });
    await markPublished(paperId, ref);
    return { id: paperId, dryRun: false, published: true, ref, payloadPreview: preview };
  },
});
