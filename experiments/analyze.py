"""Analysis fixed in PROTOCOL.md: per-arm means (with per-seed SD), paired
contrasts over (task, seed) with bootstrap 95 % CI and Wilcoxon signed-rank."""
import argparse
import json
import random
import statistics as st
from collections import defaultdict
from pathlib import Path

from scipy.stats import wilcoxon

METRICS = ["overall", "accuracy", "fabrication_risk", "completeness", "reasoning", "clarity"]


def load(p: Path) -> list[dict]:
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


def boot_ci(diffs: list[float], n: int = 10_000, seed: int = 0) -> tuple[float, float]:
    rng = random.Random(seed)
    means = sorted(st.fmean(rng.choices(diffs, k=len(diffs))) for _ in range(n))
    return means[int(0.025 * n)], means[int(0.975 * n) - 1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", default="results/runs.jsonl")
    ap.add_argument("--judgements", default="results/judgements.jsonl")
    ap.add_argument("--out", default="results/summary.json")
    a = ap.parse_args()
    runs = {r["run_id"]: r for r in load(Path(a.runs))}
    judged = {j["run_id"]: j for j in load(Path(a.judgements))} if Path(a.judgements).exists() else {}
    arms = sorted({r["arm"] for r in runs.values()})

    summary: dict = {"n_runs": len(runs), "n_judged": len(judged), "arms": {}}
    for arm in arms:
        rs = [r for r in runs.values() if r["arm"] == arm]
        ok = [r for r in rs if "error" not in r]
        row = {
            "runs": len(rs),
            "errors": len(rs) - len(ok),
            "completion_rate": round(sum(r["completed"] for r in rs) / len(rs), 3),
            "mean_tokens": round(st.fmean(r["prompt_tokens"] + r["completion_tokens"] for r in ok), 1) if ok else None,
            "mean_seconds": round(st.fmean(r["seconds"] for r in ok), 1) if ok else None,
            "mean_calls": round(st.fmean(r["calls"] for r in ok), 2) if ok else None,
        }
        for m in METRICS:
            vals = [judged[r["run_id"]][m] for r in rs if r["run_id"] in judged]
            if not vals:
                continue
            by_seed = defaultdict(list)
            for r in rs:
                if r["run_id"] in judged:
                    by_seed[r["seed"]].append(judged[r["run_id"]][m])
            seed_means = [st.fmean(v) for v in by_seed.values()]
            row[m] = {"mean": round(st.fmean(vals), 3), "n": len(vals),
                      "sd_across_seeds": round(st.stdev(seed_means), 3) if len(seed_means) > 1 else None}
        verdicts = defaultdict(int)
        for r in ok:
            tribunal_events = [h for h in r.get("history", []) if h["event"] == "tribunal"]
            if tribunal_events:
                verdicts[tribunal_events[-1]["verdict"]] += 1
        if verdicts:
            row["final_tribunal_verdicts"] = dict(verdicts)
        summary["arms"][arm] = row

    contrasts = {}
    for a1, a0 in [("tribunal", "solo"), ("tribunal", "self_refine"), ("self_refine", "solo")]:
        if a1 not in arms or a0 not in arms:
            continue
        for m in METRICS:
            diffs = []
            for r in runs.values():
                if r["arm"] != a1:
                    continue
                other = f"{r['task']}-s{r['seed']}-{a0}"
                if r["run_id"] in judged and other in judged:
                    diffs.append(judged[r["run_id"]][m] - judged[other][m])
            if len(diffs) < 5:
                continue
            lo, hi = boot_ci(diffs)
            nonzero = [d for d in diffs if d != 0]
            p = wilcoxon(nonzero).pvalue if len(nonzero) >= 5 else None
            contrasts[f"{a1}-{a0}:{m}"] = {"n_pairs": len(diffs), "mean_diff": round(st.fmean(diffs), 3),
                                           "ci95": [round(lo, 3), round(hi, 3)],
                                           "wilcoxon_p": None if p is None else round(float(p), 4)}
    summary["contrasts"] = contrasts
    Path(a.out).write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
