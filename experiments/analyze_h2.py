"""H2 analysis (amendment A2). All three texts per (task, seed) were judged in one
fresh blind session: the shared first draft, the H1 tribunal final (9B reviewers)
and the H2 final (27B reviewers)."""
import argparse
import json
import statistics as st
from collections import Counter
from pathlib import Path

from scipy.stats import wilcoxon

from analyze import METRICS, boot_ci, load


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs-h1", default="results/runs.jsonl")
    ap.add_argument("--runs-h2", default="results_h2/runs_h2.jsonl")
    ap.add_argument("--judgements", default="results_h2/judgements_h2.jsonl")
    ap.add_argument("--out", default="results_h2/summary_h2.json")
    a = ap.parse_args()
    h1 = {r["run_id"]: r for r in load(Path(a.runs_h1)) if r["arm"] == "tribunal"}
    h2 = {r["run_id"]: r for r in load(Path(a.runs_h2))}
    j = {x["run_id"]: x for x in load(Path(a.judgements))}

    out: dict = {"n_h2_runs": len(h2), "n_judged": len(j), "means": {}, "contrasts": {}}
    groups = {"draft1": [k + "#draft1" for k in h1], "h1_final": list(h1), "h2_final": list(h2)}
    for g, ids in groups.items():
        out["means"][g] = {m: round(st.fmean(j[i][m] for i in ids if i in j), 3) for m in METRICS}
        out["means"][g]["n"] = sum(i in j for i in ids)

    def contrast(name: str, pairs: list[tuple[str, str]]) -> None:
        for m in METRICS:
            d = [j[x][m] - j[y][m] for x, y in pairs if x in j and y in j]
            nz = [v for v in d if v]
            lo, hi = boot_ci(d)
            out["contrasts"][f"{name}:{m}"] = {
                "n_pairs": len(d), "mean_diff": round(st.fmean(d), 3), "ci95": [round(lo, 3), round(hi, 3)],
                "wilcoxon_p": round(float(wilcoxon(nz).pvalue), 4) if len(nz) >= 5 else None}

    pair_h1 = [(k, k.replace("-tribunal_h2", "-tribunal")) for k in h2]
    pair_d1 = [(k, k.replace("-tribunal_h2", "-tribunal") + "#draft1") for k in h2]
    pair_h1d = [(k, k + "#draft1") for k in h1]
    contrast("h2_final-h1_final", pair_h1)
    contrast("h2_final-draft1", pair_d1)
    contrast("h1_final-draft1 (session 2)", pair_h1d)

    finals = Counter()
    for r in h2.values():
        ev = [h for h in r["history"] if h["event"] == "tribunal"]
        finals[ev[-1]["verdict"]] += 1
    out["h2_final_verdicts"] = dict(finals)
    out["h2_mean_tokens"] = round(st.fmean(r["prompt_tokens"] + r["completion_tokens"] for r in h2.values()), 1)
    out["h2_completion_rate"] = round(sum(r["completed"] for r in h2.values()) / len(h2), 3)
    parsed = [v["parsed"] for r in h2.values() for h in r["history"] if h["event"] == "tribunal" for v in h["reviews"]]
    out["h2_reviews_unparsed"] = f"{parsed.count(False)}/{len(parsed)}"
    Path(a.out).write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
