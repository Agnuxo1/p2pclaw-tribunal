#!/usr/bin/env bash
# server-ia job: serve Qwen3.5-9B with vLLM (one process, low RAM) and run the ablation.
# Usage: bash run_job.sh [extra run_ablation.py args]
set -euo pipefail
cd "$(dirname "$0")"
PY=${VLLM_PY:-/home/ai/proyectos/k12-misconception/.venv/bin/python}  # read-only reuse of an existing vLLM 0.32 env
export HF_HUB_OFFLINE=1 VLLM_ENABLE_V1_MULTIPROCESSING=0
mkdir -p results
"$PY" -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen3.5-9B --served-model-name qwen3.5-9b \
  --host 127.0.0.1 --port 8000 --max-model-len 16384 \
  --gpu-memory-utilization 0.90 --max-num-seqs 16 --seed 0 \
  --limit-mm-per-prompt '{"image":0,"video":0}' \
  > results/vllm.log 2>&1 &
VLLM_PID=$!
trap 'kill $VLLM_PID 2>/dev/null || true' EXIT
for i in $(seq 1 180); do
  curl -sf http://127.0.0.1:8000/v1/models >/dev/null && break
  kill -0 $VLLM_PID 2>/dev/null || { echo "vLLM exited"; tail -50 results/vllm.log; exit 1; }
  sleep 5
done
curl -sf http://127.0.0.1:8000/v1/models >/dev/null || { echo "vLLM not ready after 15 min"; tail -50 results/vllm.log; exit 1; }
"$PY" -c "import platform, vllm, torch; print('python', platform.python_version(), 'vllm', vllm.__version__, 'torch', torch.__version__)" | tee results/env.txt
python3 tribunal.py --check | tee results/tribunal_check.txt
python3 run_ablation.py --out results/runs.jsonl "$@"
