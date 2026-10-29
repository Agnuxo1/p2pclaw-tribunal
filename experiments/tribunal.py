"""Python port of server/tribunal/score.ts. Verified against verdict_fixtures.json
(exported from the TypeScript rules) by `python tribunal.py --check`."""
import json
import sys
from pathlib import Path

DIMENSIONS = ["novelty", "rigor", "evidence", "clarity", "reproducibility"]
QUORUM = 3
ACCEPT_MEAN = 6.5
ACCEPT_MIN_DIMENSION = 5
REJECT_MEAN = 4.5
MAX_ROUNDS = 2


def _jssum(xs) -> float:
    # Plain left-to-right float addition, as Array.reduce does; Python >= 3.12
    # sum() uses compensated summation and can differ in the last bit.
    total = 0.0
    for x in xs:
        total += x
    return total


def _round2(x: float) -> float:
    # Math.round(x * 100) / 100 rounds half up, unlike Python's round().
    import math
    return math.floor(x * 100 + 0.5) / 100


def tribunal_verdict(reviews: list[dict], rnd: int) -> dict:
    by_reviewer = {}
    for r in reviews:
        by_reviewer[r["reviewer"]] = r  # like a JS Map: first insertion order, latest value
    votes = list(by_reviewer.values())
    rejects = sum(1 for v in votes if v["recommendation"] == "reject")
    lenses = len({v["lens"] for v in votes})
    if len(votes) < QUORUM or lenses < QUORUM:
        return {"verdict": "pending", "reviewCount": len(votes), "dimensionMeans": None,
                "overall": None, "rejects": rejects}
    means = {d: _round2(_jssum(v["scores"][d] for v in votes) / len(votes)) for d in DIMENSIONS}
    overall = _round2(_jssum(means[d] for d in DIMENSIONS) / len(DIMENSIONS))
    min_dim = min(means.values())
    accepted = overall >= ACCEPT_MEAN and min_dim >= ACCEPT_MIN_DIMENSION and rejects == 0
    if overall < REJECT_MEAN or rejects >= 2:
        legacy = "rejected"
    elif accepted:
        legacy = "accepted"
    else:
        legacy = "rejected" if rnd >= MAX_ROUNDS else "revise"
    if accepted:
        verdict = "accepted"
    elif rnd < MAX_ROUNDS:
        verdict = "revise"
    else:
        verdict = "rejected"
    return {"verdict": verdict, "legacyGate": legacy, "reviewCount": len(votes), "dimensionMeans": means,
            "overall": overall, "rejects": rejects}


def check() -> int:
    fixtures = json.loads((Path(__file__).parent / "verdict_fixtures.json").read_text())
    bad = 0
    for i, f in enumerate(fixtures):
        got = tribunal_verdict(f["reviews"], f["round"])
        exp = f["expected"]
        keys = ["verdict", "reviewCount", "dimensionMeans", "overall", "rejects"]
        if "legacyGate" in exp:
            keys.append("legacyGate")
        if any(got[k] != exp[k] for k in keys):
            bad += 1
            if bad <= 5:
                print("MISMATCH", i, got, {k: exp[k] for k in keys})
    print(f"{len(fixtures) - bad}/{len(fixtures)} fixtures match the TypeScript tribunal")
    return 1 if bad else 0


if __name__ == "__main__" and "--check" in sys.argv:
    sys.exit(check())
