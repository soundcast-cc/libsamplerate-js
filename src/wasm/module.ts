import type { LibSampleRateModule, LibSampleRateModuleFactory } from './libsamplerate-types';

let modulePromise: Promise<LibSampleRateModule> | null = null;
let customFactory: LibSampleRateModuleFactory | null = null;
let customWasmUrl: string | null = null;
let customGlueUrl: string | null = null;

/**
 * Override the default WASM module factory. Call before create() to take effect.
 */
export function setWasmModuleFactory(factory: LibSampleRateModuleFactory): void {
  customFactory = factory;
  modulePromise = null;
}

/**
 * Override the default WASM binary (.wasm) URL.
 */
export function setWasmUrl(url: string): void {
  customWasmUrl = url;
  modulePromise = null;
}

/**
 * Override the URL of the Emscripten glue JS file (libsamplerate.js).
 * By default it is resolved relative to this bundle.
 */
export function setWasmGlueUrl(url: string): void {
  customGlueUrl = url;
  modulePromise = null;
}

/**
 * Load (or return the cached) libsamplerate WASM module.
 */
export function getWasmModule(): Promise<LibSampleRateModule> {
  if (modulePromise) return modulePromise;

  modulePromise = (async () => {
    if (customFactory) {
      return customFactory();
    }

    const factory = await loadFactory();

    // Always steer the glue's `.wasm` fetch to our resolved URL. Bundlers
    // (Vite/Rollup) rewrite the `new URL('./wasm/libsamplerate.wasm', import.meta.url)`
    // below to the emitted (hashed) asset; without locateFile the glue would
    // otherwise look for an unhashed sibling and 404.
    const wasmUrl = customWasmUrl || resolveDefaultWasmUrl();
    const overrides: Record<string, unknown> = {
      locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path),
    };

    return factory(overrides) as Promise<LibSampleRateModule>;
  })();

  return modulePromise;
}

function resolveDefaultWasmUrl(): string {
  try {
    return new URL('./wasm/libsamplerate.wasm', import.meta.url).href;
  } catch {
    return './wasm/libsamplerate.wasm';
  }
}

async function loadFactory(): Promise<LibSampleRateModuleFactory> {
  const glueUrl = customGlueUrl || resolveDefaultGlueUrl();

  try {
    // Indirect import so bundlers don't try to statically resolve the glue.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await (Function('u', 'return import(u)') as (u: string) => Promise<any>)(
      glueUrl,
    );
    return mod.default || mod.createLibSampleRateModule || mod;
  } catch {
    throw new Error(
      `Failed to load libsamplerate WASM glue from "${glueUrl}". ` +
        'Make sure the WASM files are built (npm run build:wasm) and available at runtime. ' +
        'You can call setWasmGlueUrl() or setWasmModuleFactory() to provide a custom loader.',
    );
  }
}

function resolveDefaultGlueUrl(): string {
  // In ESM, import.meta.url is the URL of THIS bundle file; the glue lives in a
  // sibling `wasm/` directory (see rollup copy target).
  try {
    return new URL('./wasm/libsamplerate.js', import.meta.url).href;
  } catch {
    return './wasm/libsamplerate.js';
  }
}
