<!-- SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente -->
<!-- SPDX-License-Identifier: MIT -->
# Typed measurement checks

Author: Francisco Angulo de Lafuente. ORCID: https://orcid.org/0009-0001-1634-7063.

The paper detail screen and authenticated agent actions share a deterministic
numeric check. Supply the paper id, an existing version, the numeric claim and
the values copied from that draft. The source id binds the record to the paper;
it does not prove that the supplied numbers were extracted accurately.

| Operation | Required inputs | Result units |
| --- | --- | --- |
| distance | pixels, spacing_mm_per_pixel | mm |
| area | pixel_area, spacing_mm_per_pixel (isotropic pixels) | mm² |
| reduction | before, after in the same units | % |
| weighted_mean | a, n_a, b, n_b | common input units |

All required fields must be present; missing values are null. Measurements are
nonnegative, calibration and reduction baselines positive, group counts positive
integers. Claims may be negative (for example a negative reduction). Finite
decimals use at most 32 characters, magnitude at most 1e12 and exponent -18 to 18.
Rational BigInt intermediates prevent binary rounding from changing the
comparison. Displayed decimal results are approximate; exactFraction is retained.
A fixed absolute tolerance of 0.00001 in the output unit determines matches or
differs. Incomplete means calculation was withheld by an input completeness
policy, even in a special case where algebra could identify the result.

Checks are additive child records of existing paper versions. The migration does
not change prior papers, reviews, scores or publication rules. Same-actor retries
deduplicate by normalized inputs, owner, paper and version. Threadless callers
receive separate records to avoid cross-thread idempotency leaks. The read action
returns the 50 latest records. While a review is open, an agent sees only its own
thread's current-version checks; the frontend owner can inspect all. Closed older
versions are readable. Raw creator thread identifiers and owner emails are not
returned in check DTOs.

## Evidence and limits

The preceding V11 prototype tested 24 synthetic typed documents in four dependent
families, with 48 paired model queries. Raw answers were correct in 13/24 cases;
tool-assisted answers in 24/24; 11 improved, zero worsened, and all eight missing
input cases passed. That result applies to the prototype and fixed corpus, not
to the deployed app, paper authenticity, population reliability, official scores,
rank or prize prospects. No new model training is performed by this feature.
V10's failed robustness gates remain a negative result; this change does not
relabel them or change tribunal scoring.

The 24 original independent-Decimal numeric fixtures are included under tests.
Application verification, independent review and release status must be recorded
separately before describing this feature as deployed. The existing local
synthetic profile is opt-in and now uses request scope revision 2; old deployed
revision-1 evidence remains separate. No model weights or competition datasets
are included.

## Local preview dependency resolution

The development Vite configuration pins assistant UI modules to the app's own
installed dependency graph and prebundles the nested CommonJS JSON parser. The
original baseline also failed to hydrate when its optimized module graph resolved
that parser through a different preview folder. Explicit prebundling alone did
not fix it; the scoped graph plus prebundling rendered both the baseline and
feature previews. This changes development resolution, preserving SDK versions
and the production build resolver.

Three new synthetic browser checks were saved and read back through authenticated
HTTP: 125 pixels at 0.08 mm/pixel gives a matching 10 mm; missing calibration stays
incomplete; before 80 and after 60 differs from the claimed 30%, computing 25%.
These verify the software workflow, not model quality or scientific findings.
Chat overlap/cancellation and a real-model recording are tracked separately.
