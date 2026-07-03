import type { LibSampleRateModule } from './libsamplerate-types';

/**
 * Wraps a single libsamplerate `SRC_STATE` plus the reusable WASM heap buffers
 * used to shuttle interleaved float32 audio in and out. One instance per live
 * stream (channel count + input rate are fixed at construction).
 */
export class SRC {
  private readonly module: LibSampleRateModule;
  private statePtr: number;
  private readonly _nChannels: number;
  private readonly _inputSampleRate: number;
  private readonly _outputSampleRate: number;
  private readonly ratio: number;
  private destroyed = false;

  // Reusable heap allocations (grown on demand).
  private inPtr = 0;
  private inBytes = 0;
  private outPtr = 0;
  private outBytes = 0;
  private readonly inUsedPtr: number;
  private readonly outGenPtr: number;

  constructor(
    module: LibSampleRateModule,
    statePtr: number,
    nChannels: number,
    inputSampleRate: number,
    outputSampleRate: number,
  ) {
    this.module = module;
    this.statePtr = statePtr;
    this._nChannels = nChannels;
    this._inputSampleRate = inputSampleRate;
    this._outputSampleRate = outputSampleRate;
    this.ratio = outputSampleRate / inputSampleRate;
    this.inUsedPtr = module._malloc(4);
    this.outGenPtr = module._malloc(4);
  }

  get nChannels(): number {
    return this._nChannels;
  }

  get inputSampleRate(): number {
    return this._inputSampleRate;
  }

  get outputSampleRate(): number {
    return this._outputSampleRate;
  }

  /**
   * Resample one interleaved chunk (streaming `src_process`).
   *
   * @param dataIn interleaved float32 input, length = frames * nChannels
   * @param dataOut optional reusable output buffer; must hold ceil(ratio * frames) * nChannels
   * @param outLength optional object that receives the produced frame count (per channel)
   * @returns the resampled interleaved float32 (dataOut if supplied, else a fresh array)
   */
  full(
    dataIn: Float32Array,
    dataOut: Float32Array | null = null,
    outLength: { frames: number } | null = null,
  ): Float32Array {
    if (this.destroyed) throw new Error('SRC instance already destroyed');

    const channels = this._nChannels;
    const inFrames = Math.floor(dataIn.length / channels);

    // Passthrough when rates match: libsamplerate would just copy anyway.
    if (this._inputSampleRate === this._outputSampleRate) {
      if (outLength) outLength.frames = inFrames;
      if (dataOut) {
        dataOut.set(dataIn.subarray(0, dataIn.length));
        return dataOut;
      }
      return dataIn;
    }

    const outFloats = dataOut ? dataOut.length : Math.ceil(dataIn.length * this.ratio) + channels;
    const outFrames = Math.floor(outFloats / channels);

    this.ensureIn(dataIn.length * 4);
    this.ensureOut(outFrames * channels * 4);

    // Copy input into the heap (re-read HEAPF32 after any malloc-induced growth).
    this.module.HEAPF32.set(dataIn, this.inPtr >> 2);

    const err = this.module._resampler_process(
      this.statePtr,
      this.inPtr,
      inFrames,
      this.outPtr,
      outFrames,
      this.ratio,
      0,
      this.inUsedPtr,
      this.outGenPtr,
    );

    if (err !== 0) {
      const msg = this.module.UTF8ToString(this.module._resampler_strerror(err));
      throw new Error(`libsamplerate src_process failed: ${msg}`);
    }

    const genFrames = this.module.HEAP32[this.outGenPtr >> 2];
    if (outLength) outLength.frames = genFrames;

    const genFloats = genFrames * channels;
    const start = this.outPtr >> 2;
    const result = dataOut ?? new Float32Array(genFloats);
    result.set(this.module.HEAPF32.subarray(start, start + genFloats));
    return result;
  }

  /** Reset the internal filter state (e.g. on a stream discontinuity). */
  reset(): void {
    if (this.destroyed) return;
    this.module._resampler_reset(this.statePtr);
  }

  /** Free the WASM state and heap buffers. The instance is unusable afterwards. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.module._resampler_delete(this.statePtr);
    this.statePtr = 0;
    if (this.inPtr) this.module._free(this.inPtr);
    if (this.outPtr) this.module._free(this.outPtr);
    this.module._free(this.inUsedPtr);
    this.module._free(this.outGenPtr);
    this.inPtr = 0;
    this.outPtr = 0;
    this.inBytes = 0;
    this.outBytes = 0;
  }

  private ensureIn(bytes: number): void {
    if (this.inBytes >= bytes) return;
    if (this.inPtr) this.module._free(this.inPtr);
    this.inPtr = this.module._malloc(bytes);
    this.inBytes = bytes;
  }

  private ensureOut(bytes: number): void {
    if (this.outBytes >= bytes) return;
    if (this.outPtr) this.module._free(this.outPtr);
    this.outPtr = this.module._malloc(bytes);
    this.outBytes = bytes;
  }
}
