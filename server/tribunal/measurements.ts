// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { measurementChecks, paperVersions } from "../db/schema.js";
import { calculateMeasurement, measurementProofSchema, measurementRequestSchema, normalizedMeasurement } from "../../shared/measurement.js";
import { getOwnedPaper } from "./store.js";
import { TribunalError } from "./errors.js";

export type MeasurementActor = { frontend: boolean; threadId?: string | undefined };
export const storedMeasurementSchema = z.object({
  id: z.string(), paperId: z.string(), version: z.number(),
  input: measurementRequestSchema, proof: measurementProofSchema,
  inputHash: z.string(), createdAt: z.string(),
});
type Row = typeof measurementChecks.$inferSelect;
const publicRow = ({ id, paperId, version, input, proof, inputHash, createdAt }: Row) =>
  ({ id, paperId, version, input, proof, inputHash, createdAt });
async function ownedVersion(email: string, id: string, version: number) {
  const paper = await getOwnedPaper(email, id);
  const [saved] = await getDb().select({ id: paperVersions.id }).from(paperVersions)
    .where(and(eq(paperVersions.paperId, id), eq(paperVersions.version, version))).limit(1);
  if (!saved) throw new TribunalError("That paper version does not exist.", "not_found");
  return paper;
}
export async function checkMeasurement(email: string, id: string, version: number, raw: unknown, actor: MeasurementActor) {
  await ownedVersion(email, id, version);
  let input: z.infer<typeof measurementRequestSchema>;
  let proof: z.infer<typeof measurementProofSchema>;
  try { input = measurementRequestSchema.parse(raw); proof = calculateMeasurement(id, input); }
  catch { throw new TribunalError("Invalid measurements, calibration, counts or source study id.", "invalid_state"); }
  const inputHash = createHash("sha256").update(JSON.stringify(normalizedMeasurement(input))).digest("hex");
  // Frontend and distinct agent threads never share a deduplication oracle.
  const creatorKind = actor.frontend ? "frontend" : "agent";
  const creatorThread = actor.frontend ? null : actor.threadId ?? null;
  const scope = actor.frontend ? "frontend" : actor.threadId ? `agent:${actor.threadId}` : `anonymous:${randomUUID()}`;
  const checkId = "measurement_" + createHash("sha256").update(JSON.stringify([email, id, version, scope, inputHash])).digest("hex");
  await getDb().insert(measurementChecks).values({
    id: checkId, paperId: id, version, creatorKind, creatorThread,
    input, proof, inputHash, createdAt: new Date().toISOString(),
  }).onConflictDoNothing();
  const [saved] = await getDb().select().from(measurementChecks).where(eq(measurementChecks.id, checkId));
  if (!saved) throw new TribunalError("Measurement check could not be read back.", "upstream_failed");
  return publicRow(saved);
}
export async function getMeasurementChecks(email: string, id: string, version: number, actor: MeasurementActor) {
  const paper = await ownedVersion(email, id, version);
  // Agent review blindness applies to proofs as well as reviews. The user may see all.
  const blind = !actor.frontend && paper.status === "under_review" && version === paper.currentVersion;
  if (blind && !actor.threadId) return { checks: [], visibility: "own-thread" as const };
  const rows = await getDb().select().from(measurementChecks).where(and(
    eq(measurementChecks.paperId, id), eq(measurementChecks.version, version),
    ...(blind ? [eq(measurementChecks.creatorKind, "agent"), eq(measurementChecks.creatorThread, actor.threadId!)] : []),
  )).orderBy(desc(measurementChecks.createdAt), desc(measurementChecks.id)).limit(50);
  return { checks: rows.map(publicRow),
    visibility: blind ? "own-thread" as const : "owner" as const };
}
