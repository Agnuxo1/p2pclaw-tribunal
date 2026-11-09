// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { getMeasurementChecks, storedMeasurementSchema } from "../server/tribunal/measurements.js";
import { requireUserEmail } from "../server/tribunal/store.js";
import { guarded, tribunalErrors } from "../server/tribunal/errors.js";
export default defineAction({
  description: "Read up to 50 recent numeric checks for an owned paper version. During an open review round agents see only their own thread's checks, preserving independent review. Frontend users can inspect all checks. No score or verdict is changed.",
  schema: z.object({
    id: z.string().min(1).max(200).describe("Owned paper id"),
    version: z.number().int().positive().describe("Existing paper version"),
  }).strict(),
  outputSchema: z.object({ checks: z.array(storedMeasurementSchema),
    visibility: z.enum(["own-thread", "owner"]) }),
  http: { method: "GET" }, readOnly: true, errors: tribunalErrors,
  run: async ({ id, version }, ctx) => guarded(() =>
    getMeasurementChecks(requireUserEmail(ctx?.userEmail), id, version,
      { frontend: ctx?.caller === "frontend", threadId: ctx?.threadId })),
});

