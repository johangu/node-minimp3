const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Decoder = require('minimp3')

const fixtures = path.join(__dirname, 'fixtures')
const load = name => fs.readFileSync(path.join(fixtures, name))

const names = fs.readdirSync(fixtures).filter(name => name.endsWith('.mp3'))

function streamDecode (input) {
  return new Promise((resolve, reject) => {
    const decoder = new Decoder()
    const out = []
    decoder.on('data', chunk => out.push(chunk))
    decoder.on('error', reject)
    decoder.on('close', () => resolve({ pcm: Buffer.concat(out), format: decoder.format }))
    decoder.end(input)
  })
}

test('loads as CommonJS', () => {
  assert.equal(typeof Decoder, 'function')
  assert.equal(Decoder.Decoder, Decoder)
  assert.equal(typeof Decoder.decodeSync, 'function')
  assert.equal(require('minimp3').Decoder, Decoder)
})

test('loads as an ES module with the same class', async () => {
  const esm = await import('minimp3')
  assert.equal(esm.default, Decoder)
  assert.equal(esm.Decoder, Decoder)
  assert.equal(esm.decodeSync, Decoder.decodeSync)
  assert.deepEqual(Object.keys(esm).sort(), ['Decoder', 'decodeSync', 'default'])
})

test('package.json is exported', () => {
  assert.equal(require('minimp3/package.json').name, 'minimp3')
})

for (const name of names) {
  test(`decodeSync matches the stream for ${name}`, async () => {
    const input = load(name)
    const sync = Decoder.decodeSync(input)
    const stream = await streamDecode(input)
    assert.ok(sync.pcm.equals(stream.pcm))
    assert.deepEqual(sync.format, stream.format)
    assert.equal(sync.format.bitDepth, 16)
    assert.ok(sync.pcm.length > 0)
  })
}

test('decodeSync accepts a Uint8Array, including a view into a larger buffer', () => {
  const input = load(names[0])
  const expected = Decoder.decodeSync(input)

  const bytes = new Uint8Array(input)
  assert.ok(Decoder.decodeSync(bytes).pcm.equals(expected.pcm))

  const padded = new Uint8Array(input.length + 100)
  padded.set(input, 50)
  const view = padded.subarray(50, 50 + input.length)
  assert.ok(Decoder.decodeSync(view).pcm.equals(expected.pcm))
})

test('decodeSync does not modify its input', () => {
  const input = load(names[0])
  const copy = Buffer.from(input)
  Decoder.decodeSync(input)
  assert.ok(input.equals(copy))
})

test('decodeSync returns a null format and no data when there are no frames', () => {
  for (const input of [Buffer.alloc(0), Buffer.alloc(5000, 1)]) {
    const result = Decoder.decodeSync(input)
    assert.equal(result.format, null)
    assert.equal(result.pcm.length, 0)
  }
})

test('decodeSync throws on input that is not a buffer', () => {
  for (const input of ['a string', 42, null, undefined, {}, [1, 2, 3], new ArrayBuffer(8)]) {
    assert.throws(() => Decoder.decodeSync(input), TypeError)
  }
})

test('decodeSync throws when the format changes', () => {
  const input = Buffer.concat([load('tone-440hz-2s-stereo-44100.mp3'), load('tone-880hz-1s-mono-48000-vbr.mp3')])
  assert.throws(() => Decoder.decodeSync(input), /change of sample rate, channels or layer/)
})
