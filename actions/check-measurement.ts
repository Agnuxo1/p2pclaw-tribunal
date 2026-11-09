// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { measurementRequestSchema } from "../shared/measurement.js";
import { checkMeasurement, storedMeasurementSchema } from "../server/tribunal/measurements.js";
import { requireUserEmail } from "../server/tribunal/store.js";
import { guarded, tribunalErrors } from "../server/tribunal/errors.js";
export default defineAction({
  description: "Check and save caller-supplied numbers against a numeric claim in an owned paper version. Exact bounded decimal arithmetic for distance, isotropic area, percentage reduction or weighted mean. Null means missing: never invent calibration or counts. This is a numeric comparison, not source extraction or a scientific verdict. Verify inputs against the draft.",
  schema: z.object({
    id: z.string().min(1).max(200).describe("Owned paper id"),
    version: z.number().int().positive().describe("Existing paper version containing the claim"),
    measurement: measurementRequestSchema.describe("Explicit claim and typed inputs from that version"),
  }).strict(),
  outputSchema: storedMeasurementSchema,
  errors: tribunalErrors,
  run: async ({ id, version, measurement }, ctx) => guarded(() =>
    checkMeasurement(requireUserEmail(ctx?.userEmail), id, version, measurement,
      { frontend: ctx?.caller === "frontend", threadId: ctx?.threadId })),
});

