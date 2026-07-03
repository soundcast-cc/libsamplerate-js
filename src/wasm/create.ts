import { getWasmModule } from './module';
import { SRC } from './src';
import { ConverterType, type ConverterTypeValue } from '../converter-type';

export type CreateOptions = {
  converterType?: ConverterTypeValue;
};

/**
 * Load the libsamplerate WASM module and return an SRC resampler.
 *
 * @param nChannels number of interleaved channels (1-128)
 * @param inputSampleRate source sample rate (1-192000)
 * @param outputSampleRate target sample rate (1-192000)
 * @param options optional converterType (default SRC_SINC_FASTEST)
 */
export async function create(
  nChannels: number,
  inputSampleRate: number,
  outputSampleRate: number,
  options?: CreateOptions,
): Promise<SRC> {
  const converterType = options?.converterType ?? ConverterType.SRC_SINC_FASTEST;
  validate(nChannels, inputSampleRate, outputSampleRate, converterType);

  const module = await getWasmModule();
  const errPtr = module._malloc(4);
  const statePtr = module._resampler_new(converterType, nChannels, errPtr);
  const err = module.HEAP32[errPtr >> 2];
  module._free(errPtr);

  if (statePtr === 0) {
    const msg = module.UTF8ToString(module._resampler_strerror(err));
    throw new Error(`libsamplerate src_new failed: ${msg}`);
  }

  return new SRC(module, statePtr, nChannels, inputSampleRate, outputSampleRate);
}

function validate(
  nChannels: number,
  inputSampleRate: number,
  outputSampleRate: number,
  converterType: ConverterTypeValue,
): void {
  if (!Number.isFinite(nChannels) || nChannels < 1 || nChannels > 128) {
    throw new Error(`invalid nChannels: ${nChannels}`);
  }
  if (!Number.isFinite(inputSampleRate) || inputSampleRate < 1 || inputSampleRate > 192000) {
    throw new Error(`invalid inputSampleRate: ${inputSampleRate}`);
  }
  if (!Number.isFinite(outputSampleRate) || outputSampleRate < 1 || outputSampleRate > 192000) {
    throw new Error(`invalid outputSampleRate: ${outputSampleRate}`);
  }
  if (
    converterType < ConverterType.SRC_SINC_BEST_QUALITY ||
    converterType > ConverterType.SRC_LINEAR
  ) {
    throw new Error(`invalid converterType: ${converterType}`);
  }
}
