#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- Check Emscripten ---
if ! command -v emcc &>/dev/null; then
  echo "ERROR: emcc not found. Please install and activate the Emscripten SDK first."
  echo "  git clone https://github.com/emscripten-core/emsdk.git"
  echo "  cd emsdk && ./emsdk install latest && ./emsdk activate latest"
  echo "  source emsdk_env.sh"
  exit 1
fi

# --- Clone libsamplerate if not present ---
if [ ! -d "libsamplerate" ]; then
  echo ">>> Cloning libsamplerate..."
  git clone --depth 1 https://github.com/libsndfile/libsamplerate.git libsamplerate
fi

export EM_CACHE="$(pwd)/../.em_cache"

# --- Build ---
echo ">>> Building WASM module..."
make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)"

echo ""
echo "=== Build complete ==="
echo "Output files:"
ls -lh out/
