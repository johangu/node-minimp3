const minimp3 = require('bindings')('minimp3')
const { Transform } = require('stream')
const debug = require('debug')('minimp3')

class Decoder extends Transform {
  constructor (opts) {
    debug('Constructor')
    super()
  }

  _transform (chunk, encoding, processed) {
    debug(`_transform(): (${chunk.length} bytes)`)

    const decodedBuffer = minimp3.decodeBuffer(chunk, chunk.length)
    debug(`decodedBuffer.length: ${decodedBuffer.length}`)

    if (decodedBuffer.length > 0) this.push(decodedBuffer)

    processed()
  }
}

module.exports = Decoder
