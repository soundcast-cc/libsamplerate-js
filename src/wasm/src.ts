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
   * Feed one interleaved chunk through the converter (streaming `src_process`).
   *
   * Call repeatedly with successive chunks of a stream; the converter keeps its
   * internal filter state between calls, so the produced frame count per call is
   * approximate (it lags input by the filter delay and catches up over time).
   * When the stream ends, call {@link flush} to drain the buffered tail.
   *
   * @param dataIn interleaved float32 input, length = frames * nChannels
   * @param dataOut optional reusable output buffer; must hold ceil(ratio * frames) * nChannels + nChannels
   * @param outLength optional object that receives the produced frame count (per channel)
   * @returns the resampled interleaved float32. When `dataOut` is supplied it is
   *   returned as-is (full length); read `outLength.frames` for the valid range.
   *   When omitted, a fresh array sized to exactly the produced frames is returned.
   */
  process(
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

    const genFrames = this.runProcess(this.inPtr, inFrames, outFrames, false);
    if (outLength) outLength.frames = genFrames;

    const genFloats = genFrames * channels;
    const start = this.outPtr >> 2;
    const result = dataOut ?? new Float32Array(genFloats);
    result.set(this.module.HEAPF32.subarray(start, start + genFloats));
    return result;
  }

  /**
   * Signal end-of-input and drain every frame still held in the converter's
   * filter. Call once after the last {@link process} of a stream; the tail is a
   * few frames the SINC converters hold back due to their filter delay.
   *
   * Internally loops until the converter is empty and returns all remaining
   * output as a single fresh interleaved float32 array (empty when there is
   * nothing buffered, e.g. passthrough or already drained). The instance stays
   * usable — call {@link reset} before reusing it for a new stream.
   */
  flush(): Float32Array {
    if (this.destroyed) throw new Error('SRC instance already destroyed');
    if (this._inputSampleRate === this._outputSampleRate) return new Float32Array(0);

    const channels = this._nChannels;
    const drainFrames = 4096;
    this.ensureOut(drainFrames * channels * 4);
    // libsamplerate needs a non-NULL data_in pointer even with zero input
    // frames, otherwise the end-of-input drain stops short.
    this.ensureIn(channels * 4);

    const chunks: Float32Array[] = [];
    let totalFloats = 0;
    for (;;) {
      const genFrames = this.runProcess(this.inPtr, 0, drainFrames, true);
      if (genFrames <= 0) break;
      const genFloats = genFrames * channels;
      const start = this.outPtr >> 2;
      const chunk = new Float32Array(genFloats);
      chunk.set(this.module.HEAPF32.subarray(start, start + genFloats));
      chunks.push(chunk);
      totalFloats += genFloats;
    }

    if (chunks.length === 0) return new Float32Array(0);
    if (chunks.length === 1) return chunks[0]!;
    const out = new Float32Array(totalFloats);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  /** Run one `src_process` call; returns produced frames per channel. */
  private runProcess(
    inPtr: number,
    inFrames: number,
    outFrames: number,
    endOfInput: boolean,
  ): number {
    const err = this.module._resampler_process(
      this.statePtr,
      inPtr,
      inFrames,
      this.outPtr,
      outFrames,
      this.ratio,
      endOfInput ? 1 : 0,
      this.inUsedPtr,
      this.outGenPtr,
    );
    if (err !== 0) {
      const msg = this.module.UTF8ToString(this.module._resampler_strerror(err));
      throw new Error(`libsamplerate src_process failed: ${msg}`);
    }
    return this.module.HEAP32[this.outGenPtr >> 2]!;
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
