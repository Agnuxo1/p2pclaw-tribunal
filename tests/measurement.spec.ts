// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { calculateMeasurement, measurementRequestSchema } from "../shared/measurement.js";
import fixtures from "./fixtures/measurement-v11.json";
const request = (inputs: unknown = { pixels: "0.1", spacing_mm_per_pixel: "0.2" }, claimedValue: string | number = "0.02") =>
  ({ sourceStudyId: "paper", operation: "distance", inputs, claimedValue });

describe("bounded exact numeric checks", () => {
  it.each(fixtures)("ports independent Decimal fixture $study_id", fixture => {
    const result = calculateMeasurement(fixture.study_id, {
      sourceStudyId: fixture.study_id, operation: fixture.request.operation,
      inputs: fixture.request.inputs, claimedValue: fixture.gold_from_independent_decimal ?? 1,
    });
    expect(result.value).toBe(fixture.gold_from_independent_decimal);
    expect(result.status).toBe(result.value === null ? "incomplete" : "matches");
    if (result.value === null) expect(result.missingInputs.length).toBeGreaterThan(0);
  });
  it("uses rational arithmetic and exact inclusive tolerance at the boundary", () => {
    expect(calculateMeasurement("paper", request()).exactFraction).toBe("1/50");
    expect(calculateMeasurement("paper", request(undefined, "0.02001")).status).toBe("matches");
    expect(calculateMeasurement("paper", request(undefined, "0.020010000000001")).status).toBe("differs");
  });
  it("does not invent missing calibration or claim non-identifiability", () => {
    expect(calculateMeasurement("paper", request({ pixels: 0, spacing_mm_per_pixel: null })).status).toBe("incomplete");
    expect(calculateMeasurement("paper", {
      sourceStudyId: "paper", operation: "weighted_mean", claimedValue: 7,
      inputs: { a: 7, n_a: null, b: 7, n_b: 5 },
    })).toMatchObject({ status: "incomplete", value: null, missingInputs: ["n_a"] });
  });
  it("represents an increase as a negative percentage reduction", () => {
    expect(calculateMeasurement("paper", { sourceStudyId: "paper", operation: "reduction",
      claimedValue: "-25", inputs: { before: 80, after: 100 } })).toMatchObject({ value: -25, status: "matches" });
  });
  it.each([true, false, NaN, Infinity, "1e999999", "1e19", "9".repeat(200), "-1", {}, []])("rejects malformed or unbounded measurement %j", bad => {
    expect(() => calculateMeasurement("paper", request({ pixels: bad, spacing_mm_per_pixel: 1 }))).toThrow();
  });
  it("rejects unknown fields, foreign sources, zero denominators and fractional counts", () => {
    expect(() => calculateMeasurement("different", request())).toThrow(/Source/);
    expect(measurementRequestSchema.safeParse({ ...request(), sourceURL: "injected" }).success).toBe(false);
    expect(() => calculateMeasurement("paper", request({ pixels: 1, spacing_mm_per_pixel: 0 }))).toThrow();
    expect(() => calculateMeasurement("paper", { sourceStudyId: "paper", operation: "reduction", claimedValue: 1, inputs: { before: 0, after: 1 } })).toThrow();
    expect(() => calculateMeasurement("paper", { sourceStudyId: "paper", operation: "weighted_mean", claimedValue: 1, inputs: { a: 1, n_a: 0.5, b: 1, n_b: 1 } })).toThrow();
  });
});
