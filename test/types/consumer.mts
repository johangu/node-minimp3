// Compile-only check of the ES module typings. Run with `npm run test:types`.
import Decoder, { Decoder as Named, decodeSync } from 'minimp3'
import type { DecodeResult, Format } from 'minimp3'

const decoder = new Decoder()
const same: typeof Decoder = Named

decoder.on('format', (format: Format) => format.sampleRate)

const result: DecodeResult = decodeSync(new Uint8Array(0))
const format: Format | null = result.format
const pcm: Buffer = result.pcm

// @ts-expect-error input must be a Uint8Array
decodeSync(42)

export { same, format, pcm }
