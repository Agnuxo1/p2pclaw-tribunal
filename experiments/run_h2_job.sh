#!/usr/bin/env bash
# server-ia job for H2: alternate Qwen3.5-27B-AWQ (reviewers) and Qwen3.5-9B (researcher).
set -euo pipefail
cd "$(dirname "$0")"
PY=${VLLM_PY:-/home/ai/proyectos/k12-misconception/.venv/bin/python}
export HF_HUB_OFFLINE=1 VLLM_ENABLE_V1_MULTIPROCESSING=0
mkdir -p results_h2

serve() {  # $1 = HF model id, $2 = served name, rest = extra vLLM args
  local model=$1 name=$2; shift 2
  "$PY" -m vllm.entrypoints.openai.api_server --model "$model" --served-model-name "$name" \
    --host 127.0.0.1 --port 8000 --seed 0 "$@" \
    >> "results_h2/vllm-$name.log" 2>&1 &
  SRV=$!
  for i in $(seq 1 240); do
    curl -sf http://127.0.0.1:8000/v1/models >/dev/null && return 0
    kill -0 $SRV 2>/dev/null || { echo "vLLM $name exited"; tail -40 "results_h2/vllm-$name.log"; exit 1; }
    sleep 5
  done
  echo "vLLM $name not ready"; exit 1
}
stop() { kill $SRV 2>/dev/null || true; wait $SRV 2>/dev/null || true; sleep 10; }
trap 'kill ${SRV:-0} 2>/dev/null || true' EXIT

# The 27B AWQ weights take ~17.8 GiB: text-only, eager mode and a 12k context leave room for KV cache.
BIG=(--language-model-only --enforce-eager --max-model-len 12288 --gpu-memory-utilization 0.95 --max-num-seqs 8)
SMALL=(--max-model-len 16384 --gpu-memory-utilization 0.90 --max-num-seqs 16 --limit-mm-per-prompt '{"image":0,"video":0}')

python3 tribunal.py --check | tee results_h2/tribunal_check.txt
serve cyankiwi/Qwen3.5-27B-AWQ-4bit qwen3.5-27b-awq "${BIG[@]}"
python3 run_h2.py --phase review1 --model qwen3.5-27b-awq --workers 8
stop
serve Qwen/Qwen3.5-9B qwen3.5-9b "${SMALL[@]}"
python3 run_h2.py --phase revise --model qwen3.5-9b
stop
serve cyankiwi/Qwen3.5-27B-AWQ-4bit qwen3.5-27b-awq "${BIG[@]}"
python3 run_h2.py --phase review2 --model qwen3.5-27b-awq --workers 8
stop
python3 run_h2.py --phase finalize
