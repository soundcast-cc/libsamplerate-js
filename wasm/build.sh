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

# --- Fetch the pinned libsamplerate commit if not present ---
# 2ccde95 is the upstream commit 0.1.0 was built from, so output is unchanged.
LSR_COMMIT="2ccde9568cca73c7b32c97fefca2e418c16ae5e3"
if [ ! -d "libsamplerate" ]; then
  echo ">>> Fetching libsamplerate ${LSR_COMMIT}..."
  git init -q libsamplerate
  git -C libsamplerate fetch -q --depth 1 https://github.com/libsndfile/libsamplerate.git "$LSR_COMMIT"
  git -C libsamplerate checkout -q FETCH_HEAD
fi

export EM_CACHE="$(pwd)/../.em_cache"

# --- Build ---
echo ">>> Building WASM module..."
make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)"

echo ""
echo "=== Build complete ==="
echo "Output files:"
ls -lh out/
