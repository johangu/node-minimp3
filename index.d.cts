import { Transform, TransformOptions } from 'node:stream'

declare class Decoder extends Transform {
  constructor(options?: TransformOptions)

  /** The format of the decoded audio. `null` until the first frame has been read. */
  readonly format: Decoder.Format | null

  /**
   * Decodes a complete MP3 held in memory. Throws if it cannot be decoded.
   * `format` is `null` if no MP3 frames were found.
   */
  static decodeSync(input: Uint8Array): Decoder.DecodeResult

  /** The class itself, so `const { Decoder } = require('minimp3')` works. */
  static Decoder: typeof Decoder

  /** Emitted once, before the first data, when the format is known. */
  on(event: 'format', listener: (format: Decoder.Format) => void): this
  once(event: 'format', listener: (format: Decoder.Format) => void): this
  off(event: 'format', listener: (format: Decoder.Format) => void): this
  addListener(event: 'format', listener: (format: Decoder.Format) => void): this
  removeListener(event: 'format', listener: (format: Decoder.Format) => void): this
  on(event: string | symbol, listener: (...args: any[]) => void): this
  once(event: string | symbol, listener: (...args: any[]) => void): this
  off(event: string | symbol, listener: (...args: any[]) => void): this
  addListener(event: string | symbol, listener: (...args: any[]) => void): this
  removeListener(event: string | symbol, listener: (...args: any[]) => void): this
}

declare namespace Decoder {
  /** Describes the PCM output. Matches the options of node-speaker. */
  interface Format {
    /** Samples per second per channel, e.g. 44100. */
    sampleRate: number
    /** 1 for mono, 2 for stereo. Samples are interleaved. */
    channels: number
    bitDepth: 16
    /** Samples are signed little-endian integers. */
    signed: true
  }

  interface DecodeResult {
    format: Format | null
    /** Interleaved 16-bit signed PCM. */
    pcm: Buffer
  }
}

export = Decoder
