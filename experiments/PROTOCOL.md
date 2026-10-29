# Pre-registered ablation protocol (frozen 2026-10-29 before any run)

**Question.** Does P2PCLAW peer review (three independent reviewer agents + a deterministic tribunal) improve the quality of short research reports over a single agent?

**Hypothesis H1.** `tribunal` beats `solo` on blind judged quality. To separate the effect of *peer* review from the effect of extra compute, a third arm `self_refine` lets the same single agent critique and revise its own draft for the same number of rounds.

## Arms (same model, same prompts from `server/tribunal/prompts.ts`)
| Arm | Procedure |
|---|---|
| `solo` | Researcher writes one draft. |
| `self_refine` | Researcher drafts; the same agent reviews its own draft with the review instructions and revises; up to 2 rounds, stopping when its self-review recommends accept. |
| `tribunal` | Researcher drafts; 3 reviewers (methodologist, domain expert, skeptic) review independently; `tribunalVerdict` (same rules as the app) decides; on `revise` the researcher revises; max 2 rounds. |

## Design
- 20 tasks (`tasks.json`), 3 seeds (0, 1, 2), 3 arms = 180 runs.
- Model: Qwen3.5-9B (open weights), served with vLLM on one RTX 3090 of server-ia, temperature 0.7, seed fixed per run.
- Tribunal rules: Python port `experiments/tribunal.py`, checked against the TypeScript rules on shared fixtures (`experiments/verdict_fixtures.json`).

## Metrics
1. **Completion:** a final report with all five required sections (Introduction, Method, Results/Analysis, Limitations, References) and >= 300 words.
2. **Blind quality:** an independent judge from a different model family (Codex CLI, GPT) scores each final report 1-10 on accuracy, fabrication risk (higher = fewer invented facts/citations), completeness, reasoning and clarity; reports are anonymised and shuffled, and the judge never sees the arm.
3. **Cost:** prompt + completion tokens and wall-clock seconds per task.

## Analysis
Primary: mean blind overall score per arm with per-seed standard deviation; paired difference tribunal - solo and tribunal - self_refine over the 60 (task, seed) pairs with bootstrap 95 % CI (10 000 resamples) and a Wilcoxon signed-rank test. Secondary: fabrication-risk score, completion rate, tokens and time.
Decision: H1 is supported only if the tribunal - solo CI excludes 0. Whether peer review beats extra self-revision is reported separately from the tribunal - self_refine contrast. Negative or null results are reported as they are.

## Amendment A1 (2026-10-29, after the pilot, before the main run)
Pilot (`T01,T15` × seed 0 × 3 arms, job `f2eeb600eec9403e`, not included in the analysis): both tribunal runs were rejected in round 1 (>= 2 reject votes) and so never revised. The rejections were justified (the T01 draft claimed a "meta-analysis we conducted" that never happened), but under that rule the tribunal arm can only filter, never improve.
Change (JEV, provenance=jev, 0.98, `jev/answer-02.json`): before the last round any non-accept outcome means **revise**; rejection is final only after round 2. The original rule is still computed and stored as `legacyGate` in every tribunal event, so its validity as a publication gate is analysed as a secondary result (blind quality of first drafts the legacy gate would accept vs reject). The same rule ships in the app (`server/tribunal/score.ts`); the Python port matches it on 300 fixtures. Reviews (scores, recommendations, comments) are now stored in the run history.

## Amendment A2 (2026-10-29, after the main run, before H2)
Main-run result: H1 rejected (see README). Registered follow-ups (JEV, provenance=jev, 0.58, `jev/answer-03.json`):
- **H2 (stronger reviewers):** the same tribunal protocol with reviewers on Qwen3.5-27B-AWQ and the researcher on Qwen3.5-9B, starting from the *same* first drafts as the main run's tribunal arm (60 runs, `run_h2.py`). Primary contrast: blind overall of H2 final vs H1 tribunal final on the same draft (paired, bootstrap 95 % CI, Wilcoxon), plus H2 final vs its own first draft. Same blind judge, with H2 finals mixed into a fresh shuffled set alongside re-judged copies of the H1 finals so that both are scored in the same session.
- **H3 (tribunal as a filter, no new runs):** treat the round-1 tribunal decision on first drafts as a classifier of blind-judged quality. Report the Spearman correlation and the mean blind quality of drafts the gate passes vs blocks.
Implementation notes for A2: on one RTX 3090 the 27B-AWQ model is served text-only (`--language-model-only`, eager mode, 12k context), and the job alternates models (`run_h2_job.sh`). After the code audit of 29-10, the quorum rule gained a "three distinct lenses" condition. Every tribunal call in both harness runs uses exactly the three lenses, so verdicts are unaffected; the Python port and the fixtures were updated together (300/300).
