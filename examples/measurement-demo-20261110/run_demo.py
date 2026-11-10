"""Current Codex action calls through the unmodified local framework CLI.

This is an explicitly synthetic app demonstration, not an efficacy experiment.
No caller, user or thread identity is supplied or overridden.
"""
import hashlib
import json
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
import subprocess
import shutil
import re

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT
OUT = ROOT / ".agent-native" / "measurement-demo-20261110"
NODE = shutil.which("node")
if not NODE:
    raise RuntimeError("Node.js 22.22 or newer must be on PATH")
CLI = APP / "node_modules/@agent-native/core/bin/agent-native.js"


def action(name, arguments=None, cache=None):
    cache_path = OUT / f"result-{cache}.json" if cache else None
    if cache_path and cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))
    payload = json.dumps(arguments or {}, ensure_ascii=True, separators=(",", ":"))
    # agent-native action delegates to this exact stock entry point. Invoke it
    # without the Windows shell wrapper so JSON quotes reach runScript intact.
    command = [NODE, "--import", "tsx", "--import",
               (Path(__file__).resolve().parent / "cli_json_output.mjs").as_uri(),
               str(APP / "actions/run.ts"), name]
    if arguments is not None:
        command.append(payload)
    completed = subprocess.run(command, cwd=APP, capture_output=True,
                               encoding="utf-8", timeout=150)
    record = {"utc": datetime.now(timezone.utc).isoformat(), "action": name,
              "arguments": arguments, "returncode": completed.returncode,
              "stdout": completed.stdout, "stderr": completed.stderr}
    with (OUT / "calls.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, ensure_ascii=True) + "\n")
    if completed.returncode:
        raise RuntimeError(f"{name} exited {completed.returncode}; saved private receipt")
    result = json.loads(completed.stdout)
    if isinstance(result, dict) and result.get("error"):
        raise RuntimeError(f"{name} returned an application error; inspect receipt")
    if cache_path:
        cache_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"action": name, "result": result}, ensure_ascii=True), flush=True)
    return result


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    oracle = {"area": {"status": "matches", "exactFraction": "36/1"},
              "weighted": {"status": "differs", "exactFraction": "119/20"},
              "missing": {"status": "incomplete", "exactFraction": None}}
    assert Fraction(900) * Fraction("0.2") ** 2 == 36
    assert (4 * 7 + 7 * 13) / Fraction(7 + 13) == Fraction(119, 20)
    assert abs(Fraction(119, 20) - Fraction("6.05")) > Fraction("0.00001")
    (OUT / "prospective-oracle.json").write_text(json.dumps(oracle, indent=2), encoding="utf-8")
    id_path = OUT / "paper-id.txt"
    if not id_path.exists() and (OUT / "calls.jsonl").exists():
        prior = [json.loads(line) for line in (OUT / "calls.jsonl").read_text(encoding="utf-8").splitlines()]
        successful = [call for call in prior if call["action"] == "create-paper" and call["returncode"] == 0]
        if successful:
            assert len(successful) == 1
            match = re.search(r"id: '(paper_[a-z0-9]+)'", successful[0]["stdout"])
            assert match, "Preserve successful creation; inspect its id before continuing"
            id_path.write_text(match.group(1), encoding="utf-8")
    if id_path.exists():
        pid = id_path.read_text(encoding="utf-8")
    else:
        paper = action("create-paper", {
            "question": "How can a synthetic measurement note expose an arithmetic mismatch and missing evidence without pretending to validate the science?",
            "mode": "solo"}, cache="create")
        pid = paper["id"]
    (OUT / "paper-id.txt").write_text(pid, encoding="utf-8")
    draft = action("save-draft", {
        "paperId": pid,
        "title": "Synthetic measurement audit: exact numbers, explicit gaps",
        "abstract": "This is an invented demonstration fixture created by the current Codex external agent through the framework CLI. It contains one correct area calculation, one deliberately injected weighted-mean error, and one incomplete group description. The app compares explicit inputs using exact arithmetic. These controls test the software workflow and do not establish scientific validity or peer-review quality.",
        "body": "# Synthetic demonstration data\n\n## Purpose\nThis note is an intentionally constructed software demonstration, not a study of patients, biological samples, or real research outcomes. Current Codex invokes the existing framework CLI; no in-app model generation or independent reviewer is claimed.\n\n## Methods and explicit claims\nCase A: an isotropic image region covers 900 square pixels. Calibration is 0.2 mm per pixel. Claimed area: 36 mm2.\n\nCase B: group A has mean 4 and count 7. Group B has mean 7 and count 13. Claimed weighted mean: 6.05 input units. This value is a deliberate fault injection: the fixture asks the app to detect the mismatch rather than silently fixing it.\n\nCase C is a separate incomplete example: first group mean 4, count 7; second group mean 7, count not supplied. Claimed weighted mean: 5.95 input units, currently unsupported. The missing count must remain null. Do not borrow the count from case B.\n\n## Analysis\nCompare only the explicit caller-supplied inputs with each claim. Preserve source paper id, version, units, formula and exact fraction. An absent count warrants an incomplete result.\n\n## Limitations\nAn arithmetic match does not authenticate measurements, extract evidence from an image or paper, or establish a scientific conclusion. There is no independent peer-review result in solo mode.\n\n## References\nInputs above were invented for this demo. No external source, dataset or scientific publication is asserted.\n",
        "changelog": "Prospectively defined synthetic controls: correct, differs, incomplete."}, cache="draft-v1")
    version = draft["version"]
    cases = {
        "area": {"operation": "area", "claimedValue": "36", "inputs": {"pixel_area": "900", "spacing_mm_per_pixel": "0.2"}},
        "weighted": {"operation": "weighted_mean", "claimedValue": "6.05", "inputs": {"a": "4", "n_a": "7", "b": "7", "n_b": "13"}},
        "missing": {"operation": "weighted_mean", "claimedValue": "5.95", "inputs": {"a": "4", "n_a": "7", "b": "7", "n_b": None}}}
    observed = {}
    for label, measurement in cases.items():
        measurement["sourceStudyId"] = pid
        observed[label] = action("check-measurement", {"id": pid, "version": version, "measurement": measurement}, cache="check-" + label)
    for label, expected in oracle.items():
        proof = observed[label]["proof"]
        assert proof["status"] == expected["status"]
        actual = Fraction(proof["exactFraction"]) if proof["exactFraction"] is not None else None
        wanted = Fraction(expected["exactFraction"]) if expected["exactFraction"] is not None else None
        assert actual == wanted
    readback = action("get-paper", {"id": pid})
    checks = action("get-measurement-checks", {"id": pid, "version": version})
    (OUT / "observed.json").write_text(json.dumps({"paper": readback, "checks": checks, "byCase": observed}, indent=2), encoding="utf-8")
    receipt = {"source_commit": "482f1ff86fd7338abbd5745f9e96d664692e4921",
               "actor": "Current Codex external LLM agent via normal framework CLI",
               "caller_identity_override": False, "synthetic_demo": True,
               "in_app_chat_generation": False, "independent_peer_review": False,
               "paper_id": pid, "version": version, "ui_path": f"/papers/{pid}",
               "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    (OUT / "RUN_RECEIPT.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
