"""Blind judging of final reports with Codex CLI (a different model family from
the generator). Reports are anonymised and shuffled; the judge never sees the arm.

  python judge.py prepare --runs results/runs.jsonl --work judge
  python judge.py run --work judge [--codex <path>]
  python judge.py collect --work judge --out results/judgements.jsonl
"""
import argparse
import json
import random
import re
import subprocess
from pathlib import Path

RUBRIC = """You are an expert scientific reviewer judging short research reports written by AI systems.
Score each report independently, 1-10, on:
- accuracy: are the factual claims correct as of your knowledge?
- fabrication_risk: 10 = no invented facts, numbers or citations; 1 = clearly fabricated references or results.
- completeness: does it actually answer the question, with the important evidence and caveats?
- reasoning: are conclusions supported by the evidence presented?
- clarity: is it well organised and readable?
Then give overall (1-10, your holistic judgement, not an average) and a one-sentence note.
You do not know how each report was produced; judge only the text. Be consistent across reports."""

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["items"],
    "properties": {"items": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["id", "accuracy", "fabrication_risk", "completeness", "reasoning", "clarity", "overall", "note"],
        "properties": {
            "id": {"type": "string"},
            **{k: {"type": "integer", "minimum": 1, "maximum": 10} for k in
               ["accuracy", "fabrication_risk", "completeness", "reasoning", "clarity", "overall"]},
            "note": {"type": "string"},
        }}}},
}


def prepare(runs: list[Path], work: Path, batch_size: int, seed: int, arms: set[str] | None, drafts: bool) -> None:
    rows = [json.loads(l) for p in runs for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
    if arms:
        rows = [r for r in rows if r.get("arm") in arms]
    tasks = {t["id"]: t["question"] for t in json.loads((Path(__file__).parent / "tasks.json").read_text(encoding="utf-8"))["tasks"]}
    items = [{"run_id": r["run_id"], "task": r["task"], "text": r["final"]} for r in rows if r.get("final")]
    # First drafts of the tribunal arm, mixed in blind, measure what revision changed
    # and whether the legacy round-1 gate separated good from bad drafts.
    if drafts:
        items += [{"run_id": r["run_id"] + "#draft1", "task": r["task"], "text": r["first_draft"]}
                  for r in rows if r.get("arm") == "tribunal" and r.get("first_draft")]
    random.Random(seed).shuffle(items)
    rows = items
    work.mkdir(parents=True, exist_ok=True)
    key = {}
    for b in range(0, len(rows), batch_size):
        bdir = work / f"batch_{b // batch_size:03d}"
        bdir.mkdir(exist_ok=True)
        parts = [RUBRIC, "\nReports follow. Return one item per report id.\n"]
        for r in rows[b:b + batch_size]:
            rid = f"R{len(key) + 1:04d}"
            key[rid] = r["run_id"]
            text = re.split(r"\n#+\s*Changelog", r["text"], flags=re.I)[0].strip()
            parts.append(f"\n=== REPORT {rid} ===\nQuestion: {tasks[r['task']]}\n\n{text}\n=== END {rid} ===\n")
        (bdir / "reports.md").write_text("".join(parts), encoding="utf-8")
        (bdir / "schema.json").write_text(json.dumps(SCHEMA), encoding="utf-8")
    (work / "key.json").write_text(json.dumps(key, indent=1), encoding="utf-8")  # kept outside the batch folders
    print(f"{len(rows)} reports in {len(range(0, len(rows), batch_size))} batches")


def _judge_batch(bdir: Path, codex: str, model: str) -> str:
    out = bdir / "out.json"
    prompt = "Read reports.md in the current directory and follow its instructions exactly. Do not run commands other than reading that file."
    cmd = [codex, "exec", "-m", model, "-c", 'model_reasoning_effort="medium"', "--skip-git-repo-check", "--ephemeral",
           "-s", "read-only", "-C", str(bdir), "--output-schema", str(bdir / "schema.json"), "-o", str(out), prompt]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                         stdin=subprocess.DEVNULL, shell=codex.endswith(".cmd"), timeout=1800)
    (bdir / "codex.log").write_text(res.stdout[-20000:] + "\n--- stderr ---\n" + res.stderr[-20000:], encoding="utf-8")
    return f"{bdir.name} " + ("ok" if out.exists() else f"FAILED rc={res.returncode}")


def run(work: Path, codex: str, model: str, parallel: int) -> None:
    from concurrent.futures import ThreadPoolExecutor
    todo = [b for b in sorted(work.glob("batch_*")) if not (b / "out.json").exists()]
    with ThreadPoolExecutor(parallel) as ex:
        for line in ex.map(lambda b: _judge_batch(b, codex, model), todo):
            print(line, flush=True)


def collect(work: Path, out: Path) -> None:
    key = json.loads((work / "key.json").read_text(encoding="utf-8"))
    seen = set()
    with out.open("w", encoding="utf-8") as f:
        for bdir in sorted(work.glob("batch_*")):
            p = bdir / "out.json"
            if not p.exists():
                continue
            for it in json.loads(p.read_text(encoding="utf-8"))["items"]:
                if it["id"] in key and it["id"] not in seen:
                    seen.add(it["id"])
                    f.write(json.dumps({"run_id": key[it["id"]], "judge": "codex", **it}) + "\n")
    print(f"{len(seen)}/{len(key)} reports judged")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["prepare", "run", "collect"])
    ap.add_argument("--runs", nargs="+", default=["results/runs.jsonl"])
    ap.add_argument("--arms", default="", help="comma list of arms to include; empty = all")
    ap.add_argument("--no-drafts", action="store_true", help="do not add tribunal first drafts")
    ap.add_argument("--work", default="judge")
    ap.add_argument("--out", default="results/judgements.jsonl")
    ap.add_argument("--batch-size", type=int, default=6)
    ap.add_argument("--seed", type=int, default=20261029)
    ap.add_argument("--model", default="gpt-6-sol", help="Codex model for the judge (fixed for the whole run)")
    ap.add_argument("--parallel", type=int, default=4)
    ap.add_argument("--codex", default=r"C:\Users\Windows-500GB\AppData\Roaming\npm\codex.cmd")
    a = ap.parse_args()
    if a.cmd == "prepare":
        prepare([Path(p) for p in a.runs], Path(a.work), a.batch_size, a.seed,
                set(a.arms.split(",")) if a.arms else None, not a.no_drafts)
    elif a.cmd == "run":
        run(Path(a.work), a.codex, a.model, a.parallel)
    else:
        collect(Path(a.work), Path(a.out))
