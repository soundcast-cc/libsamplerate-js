// Upstream @axonkit/libsamplerate-js 0.1.0 is the oracle: the converters this fork keeps must
// produce bit-identical output, and the removed ones must be refused.
import * as fork from "../dist/index.mjs";
import * as upstream from "@axonkit/libsamplerate-js";

const { ConverterType } = fork;
const kept = [ConverterType.SRC_SINC_FASTEST, ConverterType.SRC_ZERO_ORDER_HOLD, ConverterType.SRC_LINEAR];
const removed = [ConverterType.SRC_SINC_BEST_QUALITY, ConverterType.SRC_SINC_MEDIUM_QUALITY];

/** A deterministic multi-tone signal with noise, interleaved for `channels`. */
function signal(frames, channels, rate) {
  const data = new Float32Array(frames * channels);
  let seed = 7;
  for (let n = 0; n < frames; n++)
    for (let c = 0; c < channels; c++) {
      seed = (seed * 1_103_515_245 + 12_345) >>> 0;
      const t = n / rate;
      data[n * channels + c] =
        0.4 * Math.sin(2 * Math.PI * (220 + 110 * c) * t) +
        0.2 * Math.sin(2 * Math.PI * 3_150 * t) +
        0.05 * (seed / 2 ** 32 - 0.5);
    }
  return data;
}

/** Stream the signal through `create` in uneven chunks, then flush. */
async function resample(library, type, channels, from, to, input) {
  const src = await library.create(channels, from, to, { converterType: type });
  const parts = [];
  for (let at = 0, step = 997; at < input.length; at += step * channels, step = step === 997 ? 4_093 : 997)
    parts.push(src.process(input.subarray(at, Math.min(input.length, at + step * channels))));
  parts.push(src.flush());
  src.destroy();
  const output = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    output.set(part, at);
    at += part.length;
  }
  return output;
}

let cases = 0;
for (const type of kept)
  for (const [from, to] of [[44_100, 11_025], [48_000, 11_025], [22_050, 11_025], [44_100, 48_000]])
    for (const channels of [1, 2]) {
      const input = signal(from * 3, channels, from);
      const expected = await resample(upstream, type, channels, from, to, input);
      const actual = await resample(fork, type, channels, from, to, input);
      const same =
        expected.length === actual.length &&
        Buffer.compare(Buffer.from(expected.buffer), Buffer.from(actual.buffer)) === 0;
      if (!same) throw new Error(`Output differs: converter ${type}, ${channels} ch, ${from}->${to}`);
      cases++;
    }
for (const type of removed) {
  const refused = await fork.create(1, 44_100, 11_025, { converterType: type }).then(
    (src) => (src.destroy(), false),
    () => true,
  );
  if (!refused) throw new Error(`Removed converter ${type} was accepted`);
}
console.log(`Parity: ${cases} kept cases bit-identical; ${removed.length} removed converters refused.`);
