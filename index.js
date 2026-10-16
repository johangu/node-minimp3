const { Transform } = require('node:stream')
const { debuglog } = require('node:util')
const binding = require('node-gyp-build')(__dirname)

const debug = debuglog('minimp3')

// The output is always 16-bit signed little-endian PCM
function formatOf (decoder) {
  const format = decoder.format
  return format && { ...format, bitDepth: 16 }
}

class Decoder extends Transform {
  constructor (options) {
    super({ ...options, objectMode: false })
    this._decoder = new binding.Decoder()
    this.format = null
  }

  // Decodes a complete MP3 held in memory. Throws if it cannot be decoded.
  // `format` is null if no MP3 frames were found.
  static decodeSync (input) {
    if (!ArrayBuffer.isView(input)) {
      throw new TypeError('Expected a Buffer or Uint8Array')
    }
    const buffer = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
    const decoder = new binding.Decoder()
    const first = decoder.write(buffer)
    const rest = decoder.flush()
    return { format: formatOf(decoder), pcm: Buffer.concat([first, rest]) }
  }

  // Called once the first frame has been read, before any PCM is pushed.
  _updateFormat () {
    if (this.format) return
    this.format = formatOf(this._decoder)
    if (!this.format) return
    debug('format: %o', this.format)
    this.emit('format', this.format)
  }

  _decode (method, chunk, callback) {
    let pcm
    try {
      pcm = method === 'write' ? this._decoder.write(chunk) : this._decoder.flush()
    } catch (err) {
      return callback(err)
    }
    this._updateFormat()
    debug('%s: %d bytes in, %d bytes out', method, chunk ? chunk.length : 0, pcm.length)
    if (pcm.length > 0) this.push(pcm)
    callback()
  }

  _transform (chunk, encoding, callback) {
    this._decode('write', chunk, callback)
  }

  _flush (callback) {
    this._decode('flush', null, callback)
  }
}

// Lets `const { Decoder } = require('minimp3')` work next to the default export
Decoder.Decoder = Decoder

module.exports = Decoder
