// Compile-only check of the CommonJS typings. Run with `npm run test:types`.
import Decoder = require('minimp3')
import { Decoder as Named, decodeSync } from 'minimp3'
import { createReadStream } from 'node:fs'

const decoder = new Decoder({ highWaterMark: 1024 })
const same: typeof Decoder = Named

decoder.on('format', format => {
  const rate: number = format.sampleRate
  const channels: number = format.channels
  const depth: 16 = format.bitDepth
  console.log(rate, channels, depth)
})
decoder.on('data', (chunk: Buffer) => chunk.length)

const format: Decoder.Format | null = decoder.format
const result: Decoder.DecodeResult = Decoder.decodeSync(new Uint8Array(0))
const pcm: Buffer = result.pcm
const maybe = decodeSync(Buffer.alloc(0)).format

createReadStream('file.mp3').pipe(decoder)

// @ts-expect-error input must be a Uint8Array
Decoder.decodeSync('not a buffer')

export { same, format, pcm, maybe }
