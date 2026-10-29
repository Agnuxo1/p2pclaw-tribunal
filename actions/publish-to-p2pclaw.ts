import { defineAction } from "@agent-native/core/action";
import type { WriteReceipt } from "@agent-native/core/action";
import { z } from "zod";

import {
  guarded,
  TribunalError,
  tribunalErrors,
} from "../server/tribunal/errors.js";
import { confirmPublished, publishPaper } from "../server/tribunal/p2pclaw.js";
import {
  claimPublication,
  finishPublication,
  loadPaper,
  requireUserEmail,
  reverifyPublication,
} from "../server/tribunal/store.js";

export default defineAction({
  description:
    "Publish a tribunal-accepted paper to the public P2PCLAW network. dryRun (default true) only returns the exact payload; a real publish always needs human approval in the chat.",
  schema: z.object({
    paperId: z.string().describe("Paper id; its verdict must be accepted"),
    dryRun: z
      .union([
        z.boolean(),
        z.enum(["true", "false"]).transform((v) => v === "true"),
      ])
      .default(true)
      .describe(
        "true (default) = preview only; false = publish for real after approval",
      ),
  }),
  needsApproval: (args) => args.dryRun === false,
  outputSchema: z.object({
    id: z.string(),
    dryRun: z.boolean(),
    submitted: z
      .boolean()
      .describe("P2PCLAW accepted the paper and returned an id"),
    published: z.boolean().describe("The paper was read back from the network"),
    verified: z.boolean(),
    ref: z.string().nullable(),
    payloadPreview: z
      .object({
        title: z.string(),
        author: z.string(),
        characters: z.number(),
      })
      .nullable(),
    // Reserved write receipt read by the agent loop (declared so validation keeps it).
    _receipt: z
      .custom<WriteReceipt>((v) => typeof v === "object" && v !== null)
      .optional(),
  }),
  errors: tribunalErrors,
  run: async ({ paperId, dryRun }, ctx) =>
    guarded(async () => {
      const email = requireUserEmail(ctx?.userEmail);
      const { paper, versions, tribunal } = await loadPaper(email, paperId);
      // An earlier publish that could not be read back is re-checked, never re-sent.
      if (
        !dryRun &&
        paper.status === "publish_unverified" &&
        paper.publishedRef
      ) {
        const ref = paper.publishedRef;
        const verified = await confirmPublished(ref);
        await reverifyPublication(paperId, verified);
        return publishResult(paperId, ref, verified, null);
      }
      if (paper.status !== "accepted") {
        throw new TribunalError(
          `Only accepted papers can be published (status: ${paper.status}).`,
          "invalid_state",
        );
      }
      const v = versions[versions.length - 1];
      if (!v)
        throw new TribunalError("Paper has no saved version.", "invalid_state");
      const means = tribunal.dimensionMeans
        ? Object.entries(tribunal.dimensionMeans)
            .map(([d, m]) => `${d} ${m}`)
            .join(", ")
        : "n/a";
      const content = `# ${v.title}\n\n## Abstract\n\n${v.abstract}\n\n${v.body}\n\n---\n*Peer-reviewed in P2PCLAW Tribunal (agent-native app): ${tribunal.reviewCount} independent agent reviews, overall ${tribunal.overall}/10 (${means}), ${paper.round} round(s).*`;
      const author = "P2PCLAW Tribunal agents (Agnuxo1)";
      const preview = { title: v.title, author, characters: content.length };
      if (dryRun) {
        return {
          id: paperId,
          dryRun: true,
          submitted: false,
          published: false,
          verified: false,
          ref: null,
          payloadPreview: preview,
        };
      }
      if (!(await claimPublication(paperId))) {
        throw new TribunalError(
          "Another publish of this paper is in progress or already done.",
          "conflict",
        );
      }
      let ref: string;
      try {
        ref = await publishPaper({
          title: v.title,
          content,
          author,
          agentId: "p2pclaw-tribunal-agent-native",
        });
      } catch (err) {
        const mayHaveWritten =
          err instanceof TribunalError ? err.mayHaveWritten : true;
        await finishPublication(paperId, { ref: null, mayHaveWritten });
        throw err;
      }
      // The API accepted the paper; reading it back is the confirmation.
      const verified = await confirmPublished(ref);
      await finishPublication(paperId, { ref, verified });
      return publishResult(paperId, ref, verified, preview);
    }),
});

function publishResult(
  id: string,
  ref: string,
  verified: boolean,
  payloadPreview: { title: string; author: string; characters: number } | null,
) {
  const _receipt: WriteReceipt = {
    changed: true,
    verified: verified ? true : "unverified",
    subject: id,
    summary: verified
      ? `Published as ${ref} and read back from P2PCLAW.`
      : `P2PCLAW accepted ${ref}, but it could not be read back yet; call publish again later to re-check.`,
    checks: [{ id: "read-back", ok: verified, detail: `GET /papers/${ref}` }],
  };
  return {
    id,
    dryRun: false,
    submitted: true,
    published: verified,
    verified,
    ref,
    payloadPreview,
    _receipt,
  };
}
