// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
import { z } from "zod";

type Fraction = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b);
const fraction = (n: bigint, d = 1n): Fraction => {
  if (d === 0n) throw new Error("Zero denominator");
  const g = gcd(n, d);
  return { n: (d < 0n ? -n : n) / g, d: (d < 0n ? -d : d) / g };
};
const add = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const mul = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d);
const div = (a: Fraction, b: Fraction) => fraction(a.n * b.d, a.d * b.n);
const sub = (a: Fraction, b: Fraction) => add(a, { n: -b.n, d: b.d });

/** Bounded decimal parsing: no eval, binary arithmetic, arbitrary exponent or huge BigInt. */
function decimal(value: string | number): Fraction {
  const text = String(value).trim();
  if (text.length > 32) throw new Error("Use at most 32 decimal characters");
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,2}))?$/.exec(text);
  if (!match) throw new Error("Use a finite decimal number");
  const exponent = Number(match[4] ?? 0);
  if (Math.abs(exponent) > 18) throw new Error("Decimal exponent must be between -18 and 18");
  const digits = BigInt(match[2] + (match[3] ?? ""));
  const scale = (match[3]?.length ?? 0) - exponent;
  const result = fraction((match[1] === "-" ? -digits : digits) * (scale < 0 ? 10n ** BigInt(-scale) : 1n), scale > 0 ? 10n ** BigInt(scale) : 1n);
  if ((result.n < 0n ? -result.n : result.n) > 1_000_000_000_000n * result.d) throw new Error("Magnitude must be at most 1e12");
  return result;
}
const numeric = z.union([z.number().finite(), z.string().trim().min(1).max(32)])
  .superRefine((value, ctx) => { try { decimal(value); } catch (error) { ctx.addIssue({ code: "custom", message: (error as Error).message }); } });
const nonnegative = numeric.refine(value => { try { return decimal(value).n >= 0n; } catch { return false; } }, "Measurement must be nonnegative");
const positive = nonnegative.refine(value => { try { return decimal(value).n > 0n; } catch { return false; } }, "Must be greater than zero");
const count = positive.refine(value => { try { return decimal(value).d === 1n; } catch { return false; } }, "Count must be a positive integer");
const common = {
  sourceStudyId: z.string().min(1).max(200).describe("Exact paper id containing the supplied measurements; must match id"),
  claimedValue: numeric.describe("Numeric value claimed in that paper, in the operation's output units"),
};
export const measurementRequestSchema = z.discriminatedUnion("operation", [
  z.object({ ...common, operation: z.literal("distance"), inputs: z.object({
    pixels: nonnegative.nullable().describe("Distance in pixels, or null when missing"),
    spacing_mm_per_pixel: positive.nullable().describe("Calibration in millimetres per pixel, or null"),
  }).strict() }).strict(),
  z.object({ ...common, operation: z.literal("area"), inputs: z.object({
    pixel_area: nonnegative.nullable().describe("Area in square pixels, or null"),
    spacing_mm_per_pixel: positive.nullable().describe("Isotropic calibration in millimetres per pixel, or null"),
  }).strict() }).strict(),
  z.object({ ...common, operation: z.literal("reduction"), inputs: z.object({
    before: positive.nullable().describe("Positive original value, or null"),
    after: nonnegative.nullable().describe("Final value in the same units, or null"),
  }).strict() }).strict(),
  z.object({ ...common, operation: z.literal("weighted_mean"), inputs: z.object({
    a: nonnegative.nullable().describe("First group mean, or null"),
    n_a: count.nullable().describe("First group count, positive integer or null"),
    b: nonnegative.nullable().describe("Second group mean in the same units, or null"),
    n_b: count.nullable().describe("Second group count, positive integer or null"),
  }).strict() }).strict(),
]);
export type MeasurementRequest = z.infer<typeof measurementRequestSchema>;
export const measurementProofSchema = z.object({
  status: z.enum(["matches", "differs", "incomplete"]),
  value: z.number().nullable(),
  exactFraction: z.string().nullable(),
  units: z.string(),
  formula: z.string(),
  missingInputs: z.array(z.string()),
  absoluteTolerance: z.literal(0.00001),
});
export type MeasurementProof = z.infer<typeof measurementProofSchema>;
const formulas = {
  distance: ["pixels × spacing_mm_per_pixel", "mm"],
  area: ["pixel_area × spacing_mm_per_pixel² (isotropic pixels)", "mm²"],
  reduction: ["100 × (before − after) / before", "%"],
  weighted_mean: ["(a × n_a + b × n_b) / (n_a + n_b)", "input units"],
} as const;
export function calculateMeasurement(paperId: string, raw: unknown): MeasurementProof {
  const request = measurementRequestSchema.parse(raw);
  if (request.sourceStudyId !== paperId) throw new Error("Source study id does not match this paper");
  const missingInputs = Object.entries(request.inputs).filter(([, value]) => value === null).map(([key]) => key);
  const [formula, units] = formulas[request.operation];
  const base = { units, formula, missingInputs, absoluteTolerance: 0.00001 as const };
  // Conservative completeness policy, not a proof of mathematical non-identifiability.
  if (missingInputs.length) return { ...base, status: "incomplete", value: null, exactFraction: null };
  const values = Object.fromEntries(Object.entries(request.inputs).map(([key, value]) => [key, decimal(value!)]));
  const v = (key: string): Fraction => {
    const value = values[key];
    if (!value) throw new Error("Validated required input missing");
    return value;
  };
  let result: Fraction;
  if (request.operation === "distance") result = mul(v("pixels"), v("spacing_mm_per_pixel"));
  else if (request.operation === "area") result = mul(v("pixel_area"), mul(v("spacing_mm_per_pixel"), v("spacing_mm_per_pixel")));
  else if (request.operation === "reduction") result = mul(fraction(100n), div(sub(v("before"), v("after")), v("before")));
  else result = div(add(mul(v("a"), v("n_a")), mul(v("b"), v("n_b"))), add(v("n_a"), v("n_b")));
  const difference = sub(result, decimal(request.claimedValue));
  const matches = (difference.n < 0n ? -difference.n : difference.n) * 100000n <= difference.d;
  return { ...base, status: matches ? "matches" : "differs",
    value: Number(result.n) / Number(result.d),
    exactFraction: result.d === 1n ? String(result.n) : `${result.n}/${result.d}` };
}
/** Equivalent decimal spellings share an idempotency key; raw inputs remain readable. */
export function normalizedMeasurement(request: MeasurementRequest): unknown {
  const format = (value: string | number | null) => value === null ? null : (() => {
    const { n, d } = decimal(value); return `${n}/${d}`;
  })();
  return { sourceStudyId: request.sourceStudyId, operation: request.operation,
    claimedValue: format(request.claimedValue),
    inputs: Object.fromEntries(Object.entries(request.inputs).map(([key, value]) => [key, format(value)])) };
}

