// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useRef, useState, type FormEvent } from "react";
import { measurementRequestSchema } from "@shared/measurement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const operations = {
  distance: { label: "Distance", fields: { pixels: "Distance (pixels)", spacing_mm_per_pixel: "Calibration (mm/pixel)" } },
  area: { label: "Area", fields: { pixel_area: "Area (square pixels)", spacing_mm_per_pixel: "Isotropic calibration (mm/pixel)" } },
  reduction: { label: "Reduction", fields: { before: "Before", after: "After (same units)" } },
  weighted_mean: { label: "Weighted mean", fields: { a: "Group A mean", n_a: "Group A count", b: "Group B mean", n_b: "Group B count" } },
} as const;
type Operation = keyof typeof operations;

export function MeasurementPanel({ id, version }: { id: string; version: number }) {
  const [operation, setOperation] = useState<Operation>("distance");
  const [values, setValues] = useState<Record<string, string>>({});
  const [claimedValue, setClaimedValue] = useState("");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const mutation = useActionMutation("check-measurement");
  const { data, isLoading, error } = useActionQuery("get-measurement-checks", { id, version });
  const fields = Object.entries(operations[operation].fields);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const parsed = measurementRequestSchema.safeParse({
      sourceStudyId: id, operation, claimedValue: claimedValue.trim(),
      inputs: Object.fromEntries(fields.map(([key]) => [key, values[key]?.trim() || null])),
    });
    if (!parsed.success) { setMessage(parsed.error.issues.map(issue => issue.message).join("; ")); return; }
    inFlight.current = true;
    setMessage("Saving numeric check…");
    mutation.mutate({ id, version, measurement: parsed.data }, {
      onSuccess: (saved) => { setMessage(`Saved ${saved.proof.status} check for v${saved.version}.`); },
      onError: () => { setMessage("The check could not be saved. Review the inputs and retry."); },
      onSettled: () => { inFlight.current = false; },
    });
  }
  return (
    <section className="mt-8 border-t pt-5" aria-labelledby="measurement-title">
      <h2 id="measurement-title" className="text-base font-semibold">Check a numeric claim · v{version}</h2>
      <form className="mt-3 space-y-3" onSubmit={submit} aria-busy={mutation.isPending}>
        <fieldset disabled={mutation.isPending} className="flex flex-wrap gap-2">
          <legend className="mb-2 text-xs text-muted-foreground">Calculation</legend>
          {(Object.keys(operations) as Operation[]).map(key => (
            <Button key={key} type="button" size="sm" aria-pressed={operation === key}
              variant={operation === key ? "default" : "outline"}
              onClick={() => { setOperation(key); setValues({}); setMessage(""); }}>
              {operations[key].label}
            </Button>
          ))}
        </fieldset>
        <p className="text-xs text-muted-foreground">Use the numbers from this draft. Leave unavailable inputs blank; calibration and group counts are never inferred.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map(([key, label]) => (
            <label key={key} className="space-y-1 text-xs">
              <span>{label}</span>
              <Input inputMode="decimal" value={values[key] ?? ""} maxLength={32}
                disabled={mutation.isPending}
                onChange={event => setValues(previous => ({ ...previous, [key]: event.target.value }))} />
            </label>
          ))}
          <label className="space-y-1 text-xs">
            <span>Claimed value ({operation === "distance" ? "mm" : operation === "area" ? "mm²" : operation === "reduction" ? "%" : "same units"})</span>
            <Input inputMode="decimal" value={claimedValue} maxLength={32} required
              disabled={mutation.isPending} onChange={event => setClaimedValue(event.target.value)} />
          </label>
        </div>
        <Button type="submit" size="sm" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Check and save"}</Button>
        <p className="min-h-5 text-xs" role="status" aria-live="polite">{message}</p>
      </form>
      <p className="text-xs text-muted-foreground">This compares supplied numbers. It does not authenticate their source or change the tribunal verdict.</p>
      {isLoading && <p className="mt-3 text-xs">Loading saved checks…</p>}
      {error && <p role="alert" className="mt-3 text-xs">Saved checks could not be loaded.</p>}
      {data && <div className="mt-4 space-y-3">
        {data.checks.length === 0 && <p className="text-xs text-muted-foreground">No saved checks for this version.</p>}
        {data.checks.map(check => (
          <details key={check.id} className="rounded-md border p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              {check.input.operation.replace("_", " ")} · {check.proof.status} · {check.proof.value === null ? "calculation not performed" : `${check.proof.value} ${check.proof.units}`}
            </summary>
            <dl className="mt-2 space-y-1 break-words">
              <dt className="font-medium">Formula</dt><dd>{check.proof.formula}</dd>
              <dt className="font-medium">Supplied inputs</dt><dd>{JSON.stringify(check.input.inputs)}</dd>
              <dt className="font-medium">Claim</dt><dd>{check.input.claimedValue} {check.proof.units}</dd>
              <dt className="font-medium">Exact result</dt><dd>{check.proof.exactFraction ?? "Missing: " + check.proof.missingInputs.join(", ")}</dd>
              <dt className="font-medium">Absolute tolerance</dt><dd>{check.proof.absoluteTolerance} {check.proof.units}</dd>
              <dt className="font-medium">Source binding</dt><dd>{check.paperId} · v{check.version} (caller-supplied inputs)</dd>
            </dl>
          </details>
        ))}
        {data.checks.length === 50 && <p className="text-xs text-muted-foreground">Showing the 50 most recent checks.</p>}
      </div>}
    </section>
  );
}

