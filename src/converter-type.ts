/**
 * libsamplerate converter types.
 *
 *   0: SRC_SINC_BEST_QUALITY
 *   1: SRC_SINC_MEDIUM_QUALITY
 *   2: SRC_SINC_FASTEST
 *   3: SRC_ZERO_ORDER_HOLD
 *   4: SRC_LINEAR
 *
 * See http://libsndfile.github.io/libsamplerate/api_misc.html#converters
 */
export type ConverterTypeValue = 0 | 1 | 2 | 3 | 4;

export const ConverterType = {
  SRC_SINC_BEST_QUALITY: 0 as ConverterTypeValue,
  SRC_SINC_MEDIUM_QUALITY: 1 as ConverterTypeValue,
  SRC_SINC_FASTEST: 2 as ConverterTypeValue,
  SRC_ZERO_ORDER_HOLD: 3 as ConverterTypeValue,
  SRC_LINEAR: 4 as ConverterTypeValue,
};
