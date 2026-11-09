// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("../server/db/index.js", () => ({ getDb: () => holder.db }));
import * as schema from "../server/db/schema.js";
import { TRIBUNAL_MIGRATIONS } from "../server/plugins/db.js";
import { checkMeasurement, getMeasurementChecks } from "../server/tribunal/measurements.js";
import { requireUserEmail } from "../server/tribunal/store.js";

const engine = new PGlite();
const db = drizzle(engine, { schema });
holder.db = db;
const owner = "owner@example.invalid";
const measurement = { sourceStudyId: "p", operation: "distance", claimedValue: 5,
  inputs: { pixels: 10, spacing_mm_per_pixel: "0.5" } };
beforeAll(async () => {
  for (const migration of TRIBUNAL_MIGRATIONS.filter(x => x.version < 8)) await engine.exec(migration.sql);
  await db.insert(schema.papers).values({ id: "p", ownerEmail: owner, question: "Synthetic measurement",
    status: "under_review", currentVersion: 1, createdAt: "2026-11-09", updatedAt: "2026-11-09" });
  await db.insert(schema.paperVersions).values([1, 2].map(version => ({
    id: "v" + version, paperId: "p", version, title: "Synthetic", abstract: "Synthetic abstract",
    body: "Synthetic test body", createdAt: "2026-11-09",
  })));
  await db.insert(schema.reviews).values({ id: "legacy", paperId: "p", version: 1,
    reviewer: "historical", lens: "skeptic", novelty: 1, rigor: 1, evidence: 1,
    clarity: 1, reproducibility: 1, recommendation: "revise", comments: "Preserved", createdAt: "2026-11-08" });
  await engine.exec(TRIBUNAL_MIGRATIONS.find(x => x.version === 8)!.sql);
  await engine.exec(TRIBUNAL_MIGRATIONS.find(x => x.version === 8)!.sql);
}, 60000);
beforeEach(async () => {
  await db.delete(schema.measurementChecks);
  await db.update(schema.papers).set({ status: "under_review", currentVersion: 1 }).where(eq(schema.papers.id, "p"));
});
afterAll(async () => { await engine.close(); });

describe("measurement SQL ownership, provenance and review blindness", () => {
  it("migrates an existing version-7 database without changing historical rows", async () => {
    expect(await db.select().from(schema.reviews)).toMatchObject([{ id: "legacy", comments: "Preserved" }]);
    expect((await db.select().from(schema.paperVersions)).length).toBe(2);
  });
  it("rejects absent auth, wrong owner, source mismatch and nonexistent versions before writing", async () => {
    expect(() => requireUserEmail(undefined)).toThrow(/Sign in/);
    await expect(checkMeasurement("other@example.invalid", "p", 1, measurement, { frontend: true })).rejects.toMatchObject({ code: "not_found" });
    await expect(checkMeasurement(owner, "p", 7, measurement, { frontend: true })).rejects.toMatchObject({ code: "not_found" });
    await expect(checkMeasurement(owner, "p", 1, { ...measurement, sourceStudyId: "other" }, { frontend: true })).rejects.toMatchObject({ code: "invalid_state" });
    expect(await db.select().from(schema.measurementChecks)).toHaveLength(0);
  });
  it("deduplicates concurrent same-actor retries including equivalent decimal spellings", async () => {
    const results = await Promise.all([
      checkMeasurement(owner, "p", 1, measurement, { frontend: true }),
      checkMeasurement(owner, "p", 1, { ...measurement, inputs: { pixels: "10.0", spacing_mm_per_pixel: "0.50" } }, { frontend: true }),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(await db.select().from(schema.measurementChecks)).toHaveLength(1);
    const readback = await getMeasurementChecks(owner, "p", 1, { frontend: true });
    expect(readback.checks[0].id).toBe(results[0].id);
  });
  it("hides peers' checks and the user's check while the current review round is open", async () => {
    for (const actor of [{ frontend: true }, { frontend: false, threadId: "A" }, { frontend: false, threadId: "B" }]) {
      await checkMeasurement(owner, "p", 1, measurement, actor);
    }
    const own = await getMeasurementChecks(owner, "p", 1, { frontend: false, threadId: "A" });
    expect(own.visibility).toBe("own-thread"); expect(own.checks).toHaveLength(1);
    expect(own.checks[0]).not.toHaveProperty("creatorThread");
    expect(own.checks[0]).not.toHaveProperty("ownerEmail");
    expect((await getMeasurementChecks(owner, "p", 1, { frontend: false })).checks).toHaveLength(0);
    expect((await getMeasurementChecks(owner, "p", 1, { frontend: true })).checks).toHaveLength(3);
    await db.update(schema.papers).set({ status: "revise" }).where(eq(schema.papers.id, "p"));
    expect((await getMeasurementChecks(owner, "p", 1, { frontend: false, threadId: "A" })).checks).toHaveLength(3);
  });
  it("allows prior closed-version proofs during a new review round", async () => {
    await checkMeasurement(owner, "p", 1, measurement, { frontend: true });
    await db.update(schema.papers).set({ currentVersion: 2 }).where(eq(schema.papers.id, "p"));
    expect((await getMeasurementChecks(owner, "p", 1, { frontend: false, threadId: "A" })).checks).toHaveLength(1);
  });
});
