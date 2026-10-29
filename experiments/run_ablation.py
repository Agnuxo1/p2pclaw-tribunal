"""Pre-registered ablation (PROTOCOL.md): solo vs self_refine vs tribunal.

Talks to any OpenAI-compatible endpoint (vLLM on server-ia in the paper runs).
Prompts come from prompts.json (exported from the app) and the verdict from
tribunal.py (checked against the app's TypeScript rules)."""
import argparse
import json
import re
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from tribunal import DIMENSIONS, MAX_ROUNDS, tribunal_verdict

HERE = Path(__file__).parent
PROMPTS = json.loads((HERE / "prompts.json").read_text(encoding="utf-8"))
TASKS = json.loads((HERE / "tasks.json").read_text(encoding="utf-8"))["tasks"]
LENSES = ["methodologist", "domain-expert", "skeptic"]
SECTIONS = ["introduction", "method", "results", "limitations", "references"]

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "scores": {
            "type": "object",
            "properties": {d: {"type": "number", "minimum": 0, "maximum": 10} for d in DIMENSIONS},
            "required": DIMENSIONS,
        },
        "recommendation": {"type": "string", "enum": ["accept", "revise", "reject"]},
        "comments": {"type": "string"},
    },
    "required": ["scores", "recommendation", "comments"],
}


class Client:
    def __init__(self, base_url: str, model: str, temperature: float, max_tokens: int):
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.model, self.temperature, self.max_tokens = model, temperature, max_tokens

    def chat(self, system: str, user: str, seed: int, schema: dict | None = None) -> tuple[str, int, int]:
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "seed": seed,
            "chat_template_kwargs": {"enable_thinking": False},
        }
        if schema:
            body["response_format"] = {"type": "json_schema", "json_schema": {"name": "review", "schema": schema}}
        req = urllib.request.Request(self.url, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=600) as r:
                    out = json.loads(r.read())
                u = out.get("usage", {})
                return out["choices"][0]["message"]["content"] or "", u.get("prompt_tokens", 0), u.get("completion_tokens", 0)
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(5 * (attempt + 1))
        raise RuntimeError("unreachable")


class Run:
    def __init__(self, client: Client, task: dict, seed: int, arm: str):
        self.c, self.task, self.seed, self.arm = client, task, seed, arm
        self.calls = 0
        self.prompt_tokens = self.completion_tokens = 0
        self.history: list[dict] = []

    def _chat(self, system, user, schema=None):
        text, p, c = self.c.chat(system, user, self.seed * 1000 + self.calls, schema)
        self.calls += 1
        self.prompt_tokens += p
        self.completion_tokens += c
        return text

    def draft(self) -> str:
        return self._chat(PROMPTS["RESEARCHER_PROMPT"], f"Research question: {self.task['question']}\n\nWrite the paper in Markdown, starting with a '# Title' line.")

    def revise(self, paper: str, reviews: list[dict]) -> str:
        notes = "\n\n".join(f"Reviewer {i + 1} ({r['lens']}, {r['recommendation']}): {r['comments']}" for i, r in enumerate(reviews))
        return self._chat(
            PROMPTS["RESEARCHER_PROMPT"],
            f"Research question: {self.task['question']}\n\nYour current paper:\n{paper}\n\nReviews:\n{notes}\n\n"
            "Revise the paper to address every comment. Return the full revised paper in Markdown, then a final section '## Changelog'.",
        )

    def review(self, paper: str, lens: str, reviewer: str) -> dict:
        system = PROMPTS["REVIEWER_PROMPTS"][lens] if lens in PROMPTS["REVIEWER_PROMPTS"] else "You review your own paper critically."
        raw = self._chat(system, f"{PROMPTS['REVIEW_INSTRUCTIONS']}\n\nResearch question: {self.task['question']}\n\nPaper:\n{paper}\n\nAnswer as JSON.", REVIEW_SCHEMA)
        try:
            data = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
            scores = {d: max(0.0, min(10.0, float(data["scores"][d]))) for d in DIMENSIONS}
            rec = data["recommendation"] if data.get("recommendation") in ("accept", "revise", "reject") else "revise"
            return {"reviewer": reviewer, "lens": lens, "scores": scores, "recommendation": rec, "comments": str(data.get("comments", ""))[:4000], "parsed": True}
        except Exception:
            return {"reviewer": reviewer, "lens": lens, "scores": {d: 5.0 for d in DIMENSIONS}, "recommendation": "revise", "comments": "", "parsed": False}

    def execute(self) -> dict:
        t0 = time.time()
        paper = self.draft()
        first_draft = paper
        self.history.append({"event": "draft", "version": 1})
        if self.arm == "self_refine":
            for rnd in range(1, MAX_ROUNDS + 1):
                rv = self.review(paper, "self", "self")
                self.history.append({"event": "self_review", "round": rnd, "recommendation": rv["recommendation"], "review": rv})
                if rv["recommendation"] == "accept" or rnd == MAX_ROUNDS:
                    break
                paper = self.revise(paper, [rv])
                self.history.append({"event": "revision", "version": rnd + 1})
        elif self.arm == "tribunal":
            for rnd in range(1, MAX_ROUNDS + 1):
                reviews = [self.review(paper, lens, f"reviewer-{lens}") for lens in LENSES]
                v = tribunal_verdict(reviews, rnd)
                self.history.append({"event": "tribunal", "round": rnd, "verdict": v["verdict"], "legacyGate": v["legacyGate"],
                                     "overall": v["overall"], "reviews": reviews})
                if v["verdict"] != "revise":
                    break
                paper = self.revise(paper, reviews)
                self.history.append({"event": "revision", "version": rnd + 1})
        final = re.split(r"\n#+\s*Changelog", paper, flags=re.I)[0].strip()
        return {
            "run_id": f"{self.task['id']}-s{self.seed}-{self.arm}",
            "task": self.task["id"], "seed": self.seed, "arm": self.arm,
            "final": final, "first_draft": first_draft, "completed": completed(final), "words": len(final.split()),
            "history": self.history, "calls": self.calls,
            "prompt_tokens": self.prompt_tokens, "completion_tokens": self.completion_tokens,
            "seconds": round(time.time() - t0, 2),
        }


def completed(text: str) -> bool:
    heads = [h.lower() for h in re.findall(r"^#+\s*(.+)$", text, flags=re.M)]
    has = all(any(s in h for h in heads) for s in SECTIONS)
    return has and len(text.split()) >= 300


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://127.0.0.1:8000/v1")
    ap.add_argument("--model", default="qwen3.5-9b")
    ap.add_argument("--seeds", default="0,1,2")
    ap.add_argument("--arms", default="solo,self_refine,tribunal")
    ap.add_argument("--tasks", default="all", help="comma ids or 'all'")
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--temperature", type=float, default=0.7)
    ap.add_argument("--max-tokens", type=int, default=2500)
    ap.add_argument("--out", default="results/runs.jsonl")
    a = ap.parse_args()

    client = Client(a.base_url, a.model, a.temperature, a.max_tokens)
    tasks = TASKS if a.tasks == "all" else [t for t in TASKS if t["id"] in a.tasks.split(",")]
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    done = set()
    if out.exists():  # resumable: skip runs already written
        done = {json.loads(l)["run_id"] for l in out.read_text(encoding="utf-8").splitlines() if l.strip()}
    jobs = [Run(client, t, int(s), arm) for t in tasks for s in a.seeds.split(",") for arm in a.arms.split(",")]
    jobs = [j for j in jobs if f"{j.task['id']}-s{j.seed}-{j.arm}" not in done]
    lock = threading.Lock()
    print(f"{len(jobs)} runs to do ({len(done)} already done)", flush=True)
    with ThreadPoolExecutor(a.workers) as ex, out.open("a", encoding="utf-8") as f:
        futs = {ex.submit(j.execute): j for j in jobs}
        for n, fut in enumerate(as_completed(futs), 1):
            j = futs[fut]
            try:
                res = fut.result()
            except Exception as e:  # recorded, never silently dropped
                res = {"run_id": f"{j.task['id']}-s{j.seed}-{j.arm}", "task": j.task["id"], "seed": j.seed, "arm": j.arm,
                       "error": repr(e)[:500], "completed": False}
            with lock:
                f.write(json.dumps(res, ensure_ascii=False) + "\n")
                f.flush()
            print(f"[{n}/{len(jobs)}] {res['run_id']} completed={res.get('completed')} {res.get('seconds', '-')}s", flush=True)


if __name__ == "__main__":
    main()
