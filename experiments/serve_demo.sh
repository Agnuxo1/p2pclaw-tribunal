#!/usr/bin/env bash
# server-ia job: OpenAI-compatible Qwen3.5-9B with tool calling on 127.0.0.1:4040
# (tunnelled to the PC's localhost:4040) for DEMO_MINUTES, for the app demo.
set -euo pipefail
cd "$(dirname "$0")"
PY=${VLLM_PY:-/home/ai/proyectos/k12-misconception/.venv/bin/python}
export HF_HUB_OFFLINE=1 VLLM_ENABLE_V1_MULTIPROCESSING=0
mkdir -p results
"$PY" -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen3.5-9B --served-model-name qwen3.5-9b \
  --host 127.0.0.1 --port 4040 --max-model-len 32768 \
  --gpu-memory-utilization 0.90 --max-num-seqs 8 \
  --enable-auto-tool-choice --tool-call-parser qwen3_coder \
  --reasoning-parser qwen3 \
  --limit-mm-per-prompt '{"image":0,"video":0}' \
  > results/vllm-demo.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
sleep "$(( ${DEMO_MINUTES:-120} * 60 ))"
