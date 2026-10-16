const { Transform } = require('node:stream')
const { debuglog } = require('node:util')
const binding = require('bindings')('minimp3')

const debug = debuglog('minimp3')

class Decoder extends Transform {
  constructor (options) {
    super({ ...options, objectMode: false })
    this._decoder = new binding.Decoder()
    this.format = null
  }

  // Called once the first frame has been read, before any PCM is pushed.
  _updateFormat () {
    if (this.format) return
    const format = this._decoder.format
    if (!format) return
    // Same shape as the options of node-speaker
    this.format = { ...format, bitDepth: 16, signed: true }
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

module.exports = Decoder
