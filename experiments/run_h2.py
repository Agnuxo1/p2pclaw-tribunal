"""H2 (amendment A2): does peer review help when reviewers are stronger than the author?

Same tribunal protocol as the main run, but reviewers are Qwen3.5-27B-AWQ while the
researcher stays Qwen3.5-9B. One GPU cannot hold both, so the job alternates the
served model in phases; each phase is a step every run takes at the same point:
  review   (27B): round-1 reviews of the main run's tribunal first drafts
  revise   (9B):  revisions for drafts the tribunal sent back
  review   (27B): round-2 reviews
Starting from the same first drafts makes H2 vs H1 a paired comparison on identical
inputs.

  python run_h2.py --phase review1|revise|review2|finalize --base-url ... --model ...
"""
import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from run_ablation import LENSES, TASKS, Client, Run, completed
from tribunal import MAX_ROUNDS, tribunal_verdict

STATE = Path("results_h2/state.json")
TASK = {t["id"]: t for t in TASKS}


def load_state(source: Path) -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    runs = [json.loads(l) for l in source.read_text(encoding="utf-8").splitlines() if l.strip()]
    st = {}
    for r in runs:
        if r["arm"] == "tribunal" and r.get("first_draft"):
            st[r["run_id"].replace("-tribunal", "-tribunal_h2")] = {
                "task": r["task"], "seed": r["seed"], "paper": r["first_draft"], "first_draft": r["first_draft"],
                "rounds": [], "done": False, "calls": 0, "prompt_tokens": 0, "completion_tokens": 0,
            }
    return st


def save_state(st: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(st, ensure_ascii=False), encoding="utf-8")


def _runner(client: Client, s: dict) -> Run:
    run = Run(client, TASK[s["task"]], s["seed"], "tribunal_h2")
    run.calls = 100 + s["calls"]  # distinct sampling seeds from the main run's calls
    return run


def _account(s: dict, run: Run) -> None:
    s["calls"] = run.calls - 100
    s["prompt_tokens"] += run.prompt_tokens
    s["completion_tokens"] += run.completion_tokens


def review_phase(client: Client, st: dict, rnd: int, workers: int) -> None:
    todo = [k for k, s in st.items() if not s["done"] and len(s["rounds"]) == rnd - 1]

    def work(k: str) -> None:
        s = st[k]
        run = _runner(client, s)
        reviews = [run.review(s["paper"], lens, f"reviewer-{lens}") for lens in LENSES]
        v = tribunal_verdict(reviews, rnd)
        s["rounds"].append({"round": rnd, "verdict": v["verdict"], "legacyGate": v["legacyGate"],
                            "overall": v["overall"], "reviews": reviews})
        s["done"] = v["verdict"] != "revise"
        _account(s, run)

    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(work, todo))
    print(f"review round {rnd}: {len(todo)} papers", flush=True)


def revise_phase(client: Client, st: dict, workers: int) -> None:
    todo = [k for k, s in st.items() if not s["done"] and s["rounds"] and s["rounds"][-1]["verdict"] == "revise"]

    def work(k: str) -> None:
        s = st[k]
        run = _runner(client, s)
        s["paper"] = run.revise(s["paper"], s["rounds"][-1]["reviews"])
        _account(s, run)

    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(work, todo))
    print(f"revise: {len(todo)} papers", flush=True)


def finalize(st: dict, out: Path) -> None:
    with out.open("w", encoding="utf-8") as f:
        for k, s in st.items():
            final = re.split(r"\n#+\s*Changelog", s["paper"], flags=re.I)[0].strip()
            history = [{"event": "draft", "version": 1}]
            for i, r in enumerate(s["rounds"]):
                history.append({"event": "tribunal", **r})
                if r["verdict"] == "revise" and i + 1 < len(s["rounds"]):
                    history.append({"event": "revision", "version": i + 2})
            f.write(json.dumps({
                "run_id": k, "task": s["task"], "seed": s["seed"], "arm": "tribunal_h2",
                "final": final, "first_draft": s["first_draft"], "completed": completed(final),
                "words": len(final.split()), "history": history, "calls": s["calls"],
                "prompt_tokens": s["prompt_tokens"], "completion_tokens": s["completion_tokens"],
            }, ensure_ascii=False) + "\n")
    print(f"wrote {len(st)} runs to {out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", required=True, choices=["review1", "revise", "review2", "finalize"])
    ap.add_argument("--source", default="results/runs.jsonl")
    ap.add_argument("--base-url", default="http://127.0.0.1:8000/v1")
    ap.add_argument("--model", default="qwen3.5-9b")
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--max-tokens", type=int, default=2500)
    a = ap.parse_args()
    st = load_state(Path(a.source))
    client = Client(a.base_url, a.model, 0.7, a.max_tokens)
    if a.phase == "review1":
        review_phase(client, st, 1, a.workers)
    elif a.phase == "revise":
        revise_phase(client, st, a.workers)
    elif a.phase == "review2":
        assert MAX_ROUNDS == 2
        review_phase(client, st, 2, a.workers)
    else:
        finalize(st, Path("results_h2/runs_h2.jsonl"))
    save_state(st)


if __name__ == "__main__":
    main()
