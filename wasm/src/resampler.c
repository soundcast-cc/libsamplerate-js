#include <emscripten.h>
#include <stdlib.h>
#include "samplerate.h"

/*
 * Thin C wrapper around libsamplerate's streaming (`src_process`) API so the
 * JS side never has to marshal the SRC_DATA struct by hand. All buffers are
 * interleaved float32 living in the WASM heap; frame counts are per channel.
 */

EMSCRIPTEN_KEEPALIVE
SRC_STATE *resampler_new(int converterType, int channels, int *error) {
    return src_new(converterType, channels, error);
}

EMSCRIPTEN_KEEPALIVE
void resampler_delete(SRC_STATE *state) {
    if (state) {
        src_delete(state);
    }
}

EMSCRIPTEN_KEEPALIVE
int resampler_reset(SRC_STATE *state) {
    if (!state) {
        return -1;
    }
    return src_reset(state);
}

/*
 * Resample one interleaved chunk.
 *   in / out            : interleaved float32 buffers in the WASM heap
 *   inFrames / outFrames: capacities in frames (per channel)
 *   ratio               : outputSampleRate / inputSampleRate
 *   endOfInput          : non-zero on the final chunk to flush the filter
 *   inUsed / outGen      : receive frames consumed / produced (per channel)
 * Returns the libsamplerate error code (0 == success).
 */
EMSCRIPTEN_KEEPALIVE
int resampler_process(SRC_STATE *state, const float *in, int inFrames, float *out, int outFrames,
                      double ratio, int endOfInput, int *inUsed, int *outGen) {
    if (!state) {
        return -1;
    }

    SRC_DATA data;
    data.data_in = in;
    data.data_out = out;
    data.input_frames = inFrames;
    data.output_frames = outFrames;
    data.input_frames_used = 0;
    data.output_frames_gen = 0;
    data.end_of_input = endOfInput;
    data.src_ratio = ratio;

    int err = src_process(state, &data);

    if (inUsed) {
        *inUsed = (int)data.input_frames_used;
    }
    if (outGen) {
        *outGen = (int)data.output_frames_gen;
    }
    return err;
}

EMSCRIPTEN_KEEPALIVE
const char *resampler_strerror(int error) {
    return src_strerror(error);
}

EMSCRIPTEN_KEEPALIVE
int resampler_is_valid_ratio(double ratio) {
    return src_is_valid_ratio(ratio);
}
