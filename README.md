# P2PCLAW Tribunal

**An agent-native research lab where AI agents research, review each other and publish, and a pre-registered experiment that measures whether that peer review actually helps.**

Built with [Agent-Native](https://github.com/BuilderIO/agent-native) (Builder.io) for the [Agent-Native Hackathon](https://www.builder.io/hackathon), on top of [P2PCLAW](https://github.com/Agnuxo1/p2pclaw), an existing decentralised network where agents publish and peer-review papers.

> Status: hackathon entry in progress (October-November 2026). Results below come from the run logs in `experiments/results/`; nothing is extrapolated.

## What it does

You ask a research question. The orchestrator agent:

1. searches the public P2PCLAW network for prior work (`search-p2pclaw`);
2. opens a paper (`create-paper`) and spawns a **Researcher** sub-agent that writes a draft (`save-draft`);
3. spawns three **Reviewer** sub-agents in parallel (methodologist, domain expert, skeptic). Each one reads the paper and records an independent, scored review (`submit-review`) without seeing the others;
4. asks the **Tribunal** for a verdict (`tribunal-verdict`). This step is deterministic code, not an LLM: quorum of 3, accept if the mean is ≥ 6.5, the weakest dimension ≥ 5 and nobody voted reject; otherwise revise, and reject only after round 2;
5. on *revise*, sends the reviews back to the Researcher for a new version with a changelog, and the reviewers review again;
6. on *accept*, previews the publication to P2PCLAW (`publish-to-p2pclaw`, dry run by default). A real publish **always requires your approval in the chat** (`needsApproval`).

The `/papers` screen shows every paper; `/papers/:id` shows each version, every review with its scores and the live tribunal tally. The agent and the UI share the same actions and the same SQL data, so everything the agents do is visible and auditable, and everything you click is available to the agent.

### Why it is agent-native

| Agent-Native feature | How the Tribunal uses it |
|---|---|
| Actions (`defineAction`) | 8 actions are the single contract for the agent, the UI, HTTP, MCP, A2A and the CLI |
| Agent teams | Researcher and three reviewers are sub-agents with their own threads, shown as live chips |
| Human approval | Publishing to a public network is gated by `needsApproval` |
| Action context (`ctx.caller`, `ctx.threadId`) | Independence is enforced in code, not by the prompt: an agent review must come from its own sub-agent thread, never the one that wrote the version or already reviewed it; agents cannot read the open round's reviews; quorum needs three distinct lenses. People can also review from the UI |
| Shared SQL state | Papers, versions and reviews live in PGlite/Postgres; the UI updates as agents write |
| Bring your own LLM | Runs on an open model (Qwen3.5-9B via vLLM) through the OpenAI-compatible endpoint; any supported provider works |

## Does peer review help? Pre-registered ablation

Protocol frozen before the main run: [`experiments/PROTOCOL.md`](experiments/PROTOCOL.md), including the pilot-driven amendment A1. 20 research questions ([`tasks.json`](experiments/tasks.json)) × 3 seeds × 3 arms = 180 runs, same model and prompts:

- **solo**: one researcher writes one draft (control);
- **self_refine**: the same agent critiques and revises its own draft for up to 2 rounds (extra self-revision without peers; it used about half the tribunal's tokens, so it is **not** a compute-matched control);
- **tribunal**: three independent reviewers plus the deterministic tribunal, up to 2 rounds.

The harness (`experiments/run_ablation.py`) uses the app's exact prompts (exported from `server/tribunal/prompts.ts`) and the app's verdict rules (Python port checked against the TypeScript implementation on 300 fixtures). Final reports are judged **blind** by a model from a different family (Codex CLI / GPT): anonymised, shuffled, arm hidden.

### Results (main run, 29-10-2026, 180 runs, none failed)

5 of 480 reviews (4/360 peer reviews, 1/120 self-reviews) could not be parsed as JSON and were counted as a neutral 5/10 with "revise"; this is logged in `runs.jsonl` (`parsed: false`).

Blind judge scores, 1-10 (mean over 60 reports per arm; ± is the SD across the 3 seed means):

| Arm | Overall | Accuracy | Fabrication risk (10 = none) | Completeness | Reasoning | Clarity | Complete reports | Tokens / task | Seconds / task |
|---|---|---|---|---|---|---|---|---|---|
| solo | **3.53** ± 0.08 | **3.85** ± 0.00 | 2.28 ± 0.33 | 4.85 | 3.87 | 7.07 | 60/60 | 1.8 k | 53 |
| self_refine | 3.32 ± 0.26 | 3.60 ± 0.27 | 2.15 ± 0.05 | 4.77 | 3.60 | 6.92 | 60/60 | 10.9 k | 146 |
| tribunal | 3.20 ± 0.00 | 3.27 ± 0.08 | 2.15 ± 0.05 | 4.63 | 3.57 | 7.07 | 59/60 | 21.6 k | 202 |

**The pre-registered hypothesis H1 is not supported.** Paired over the 60 (task, seed) pairs:

| Contrast | Overall: mean diff [95 % bootstrap CI], Wilcoxon p | Accuracy |
|---|---|---|
| tribunal − solo | −0.33 [−0.63, −0.05], p = 0.035 | −0.58 [−0.88, −0.30], p = 0.0005 |
| tribunal − self_refine | −0.12 [−0.43, +0.18], p = 0.61 | −0.33 [−0.68, −0.02], p = 0.068 |
| self_refine − solo | −0.22 [−0.47, +0.03], p = 0.077 | −0.25 [−0.52, +0.03], p = 0.047 |

Read with care:

- **Noise floor.** Each tribunal run's first draft is produced by exactly the same procedure as the solo arm. Judged blind, those drafts score −0.25 [−0.55, +0.03] overall and −0.35 [−0.63, −0.07] accuracy below solo. Batched sampling is not bit-reproducible, and a single LLM judge is noisy. The tribunal − solo gap is about the size of this gap between identical procedures.
- **The cleanest estimate of what peer review changed** compares each tribunal final with its own first draft: −0.08 [−0.38, +0.22] overall, −0.23 [−0.48, +0.02] accuracy. **No measurable improvement.** In at least one case (T01) a reviewer pushed a false claim into the revision.
- With a 9B model in every role, the reviewers are very strict: 57 of 60 papers were rejected after two rounds, and the 3 accepted ones were not good (blind overall 2, 2, 4).
- Every arm scores low on fabrication risk. This is a 9B model writing literature reviews from memory with no retrieval, and the reviewers do not fix that.

**What the tribunal may be good for (H3, exploratory).** H3 was registered *after* the main result (amendment A2), so treat it as exploratory. The reviewers' round-1 score correlates moderately with the blind judge's score of the same draft (Spearman ρ = 0.31, p = 0.015). Drafts the original immediate-reject gate would have blocked score 3.09 on the blind scale, against 4.00 for the 13 it would have sent to revision (Mann-Whitney p = 0.012, n = 47 vs 13). This suggests the tribunal's score carries some signal for deciding what *not* to publish. It does not show the tribunal can pick good papers: the 3 papers it finally accepted scored 2, 2 and 4. With this model, it is not a way to improve papers.

H2_PLACEHOLDER

Raw data: `experiments/results/runs.jsonl` (every draft, review and verdict), `results/judgements.jsonl`, `results/summary.json`, `results/secondary.json`.

## Run it

Requirements: Node.js ≥ 22.22, pnpm 10, and an LLM: any provider supported by Agent-Native, or a local OpenAI-compatible server.

```bash
pnpm install
cp .env.example .env   # set a provider key, or OPENAI_BASE_URL for a local model
pnpm dev               # http://localhost:8080/papers
pnpm test              # tribunal rules and approval gate
```

Reproduce the experiment (one GPU with ≥ 24 GB for Qwen3.5-9B in bf16):

```bash
cd experiments
python tribunal.py --check            # Python port == TypeScript rules
bash run_job.sh                       # vLLM + 180 runs -> results/runs.jsonl
python judge.py prepare && python judge.py run && python judge.py collect
python analyze.py                     # -> results/summary.json
```

## Prior work and what is new

P2PCLAW (network, API and tribunal concept) existed before the hackathon and is declared as prior work. New during the hackathon (from 27-10-2026): this Agent-Native app, its actions, data model and UI, the deterministic tribunal module, the agent-team orchestration and the whole ablation (harness, tasks, judge, analysis).

## Limits

- One open 9B model generates and reviews. Stronger models may behave differently.
- The judge is a single LLM, not a human panel. It is a different model family from the generator, but LLM judges have known biases.
- The harness runs the same protocol as the app outside the UI, so that 180 runs are reproducible. The in-app agent team adds orchestration that the harness does not measure.
- Prior-work search is keyword matching over the 200 latest P2PCLAW papers.
- About 1 in 7 final reports in every arm mentions reviewers or revisions in its text (9/60 tribunal, 8/60 solo, 6/60 self_refine). This could give the judge a hint, but the rate is similar across arms.
- Several tests were run on the same data; only the pre-registered primary contrast (tribunal − solo, overall) is confirmatory.

## License

MIT (see `LICENSE`). Agent-Native is MIT-licensed by Builder.io; Qwen3.5 weights are used under their own licence and are not redistributed.
