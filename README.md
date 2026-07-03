# @axonkit/libsamplerate-js

Audio sample-rate conversion for the browser, backed by a WebAssembly build of
[libsamplerate](https://github.com/libsndfile/libsamplerate).

Unlike most libsamplerate ports, this package ships the WASM as a **separate
`.wasm` file with a tiny (~9 KB) JS glue** instead of a ~2 MB base64 blob inlined
into JS. The `.wasm` is fetched on demand, so it never bloats your main bundle.

## Install

```bash
npm install @axonkit/libsamplerate-js
```

## Usage

```typescript
import { create, ConverterType } from '@axonkit/libsamplerate-js';

// 2 channels, 44100 Hz -> 48000 Hz
const src = await create(2, 44100, 48000, {
  converterType: ConverterType.SRC_SINC_FASTEST,
});

// dataIn: interleaved Float32Array (length = frames * channels)
const outLength = { frames: 0 };
const out = src.full(dataIn, outBuffer, outLength);
// outLength.frames = produced frames per channel

src.destroy();
```

### API

- `create(nChannels, inputSampleRate, outputSampleRate, options?)` → `Promise<SRC>`
- `SRC.full(dataIn, dataOut?, outLength?)` — streaming resample (`src_process`)
- `SRC.reset()` — reset filter state on a discontinuity
- `SRC.destroy()` — free the WASM state + heap buffers
- `ConverterType` — `SRC_SINC_BEST_QUALITY | SRC_SINC_MEDIUM_QUALITY | SRC_SINC_FASTEST | SRC_ZERO_ORDER_HOLD | SRC_LINEAR`

### WASM asset URL overrides (optional)

Not re-exported from the main entry. Use the subpath when you host the `.wasm` /
glue yourself:

```typescript
import { setWasmUrl, setWasmGlueUrl } from '@axonkit/libsamplerate-js/wasm-runtime';

setWasmGlueUrl('/static/wasm/libsamplerate.js');
setWasmUrl('/static/wasm/libsamplerate.wasm');
```

Also available: `setWasmModuleFactory`.

## Build

Requires the [Emscripten SDK](https://emscripten.org/) (`emcc` on PATH) and CMake.

```bash
npm run build:wasm   # compiles libsamplerate -> wasm/out/{libsamplerate.js,libsamplerate.wasm}
npm run build:ts     # rollup -> dist/
```

Artifacts: `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.ts`,
`dist/wasm-runtime.mjs`, `dist/wasm/libsamplerate.{js,wasm}`.

## License

Wrapper: MIT. libsamplerate is 2-clause BSD.
