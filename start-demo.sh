#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$DIR/arken-phase1-docker/workspace"
IMAGE="arken-phase1-docker-arken-dev"
NODE_PORT=3001
PY_PORT=3002

echo "Starting Arken Auth demo (Node.js + Python)..."
echo ""

# ── Clean up previous containers ────────────────────────────────────────────
docker rm -f arken-demo-node arken-demo-python 2>/dev/null && echo "Stopped previous containers." || true

# ── Start Node.js server ─────────────────────────────────────────────────────
echo "Starting Node.js / Express server on port $NODE_PORT..."
docker run -d \
  --name arken-demo-node \
  -p "$NODE_PORT:$NODE_PORT" \
  -e PORT=$NODE_PORT \
  -v "$WORKSPACE:/workspace" \
  "$IMAGE" \
  bash -c "cd /workspace/node-wrapper && npm install --silent 2>/dev/null && node test-server.js"

# ── Start Python server ──────────────────────────────────────────────────────
echo "Starting Python / FastAPI server on port $PY_PORT..."
docker run -d \
  --name arken-demo-python \
  -p "$PY_PORT:8000" \
  -v "$WORKSPACE:/workspace" \
  "$IMAGE" \
  bash -c "cd /workspace/python-wrapper && pip3 install -r requirements.txt -q && python3 test_server.py"

# ── Wait for both to be ready ────────────────────────────────────────────────
echo ""
echo -n "Waiting for Node.js"
for i in $(seq 1 20); do
  if curl -s -o /dev/null -w '%{http_code}' "http://localhost:$NODE_PORT/protected" | grep -q '401'; then
    echo " ready."
    break
  fi
  echo -n "."
  sleep 1
done

echo -n "Waiting for Python"
for i in $(seq 1 20); do
  if curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PY_PORT/protected" | grep -q '401'; then
    echo " ready."
    break
  fi
  echo -n "."
  sleep 1
done

URL="http://localhost:$NODE_PORT"
echo ""
echo "Demo:    $URL"
echo "Node.js: http://localhost:$NODE_PORT/protected"
echo "Python:  http://localhost:$PY_PORT/protected"
echo ""
echo "To stop: docker rm -f arken-demo-node arken-demo-python"
echo ""

open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || echo "Open $URL in your browser."
