const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Decoder = require('..')

const mp3 = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'tone-440hz-2s-stereo-44100.mp3')
)

// 2 s * 44100 Hz * 2 channels * 2 bytes
const EXPECTED_PCM_BYTES = 352800

function decode (input, chunkSize = input.length) {
  return new Promise((resolve, reject) => {
    const decoder = new Decoder()
    const out = []
    decoder.on('data', chunk => out.push(chunk))
    decoder.on('error', reject)
    decoder.on('end', () => resolve(Buffer.concat(out)))
    for (let i = 0; i < input.length; i += chunkSize) {
      decoder.write(input.subarray(i, i + chunkSize))
    }
    decoder.end()
  })
}

// Samples of one channel from interleaved 16-bit little-endian PCM
function channel (pcm, ch, channels = 2) {
  const samples = new Int16Array(pcm.length / 2 / channels)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = pcm.readInt16LE((i * channels + ch) * 2)
  }
  return samples
}

function zeroCrossings (samples) {
  let n = 0
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1] < 0) !== (samples[i] < 0)) n++
  }
  return n
}

test('decodes the whole file in one chunk to 16-bit PCM', async () => {
  const pcm = await decode(mp3)
  assert.ok(pcm.length > 0)
  assert.equal(pcm.length % 4, 0, 'whole stereo sample frames')
})

test('decoded audio is a 440 Hz tone in both channels', async () => {
  const pcm = await decode(mp3)
  for (const ch of [0, 1]) {
    const samples = channel(pcm, ch)
    const peak = samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0)
    assert.ok(peak > 1000, `channel ${ch} is not silent (peak ${peak})`)
    // 440 Hz => 880 zero crossings per second
    const seconds = samples.length / 44100
    const hz = zeroCrossings(samples) / 2 / seconds
    assert.ok(Math.abs(hz - 440) < 5, `channel ${ch} is ${hz} Hz`)
  }
})

// Known issues in the original implementation, fixed by the streaming rewrite.
// Remove `todo` as each one starts passing.
test('output is exactly 2 s of audio', { todo: true }, async () => {
  const pcm = await decode(mp3)
  assert.equal(pcm.length, EXPECTED_PCM_BYTES)
})

for (const size of [64 * 1024, 4096, 417, 1]) {
  // 64 KiB is larger than the fixture, so it is a single chunk and already works
  const todo = size < 64 * 1024
  test(`output is identical for ${size}-byte chunks`, { todo }, async () => {
    const whole = await decode(mp3)
    const chunked = await decode(mp3, size)
    assert.ok(chunked.equals(whole))
  })
}

test('prepended ID3v2 tag is skipped', async () => {
  const id3 = Buffer.concat([
    Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x0a', 'latin1'),
    Buffer.alloc(10)
  ])
  const withTag = await decode(Buffer.concat([id3, mp3]))
  const without = await decode(mp3)
  assert.ok(withTag.equals(without))
})

test('empty input produces no output', async () => {
  const pcm = await decode(Buffer.alloc(0))
  assert.equal(pcm.length, 0)
})

test('non-mp3 input does not crash the process', { todo: true }, async () => {
  const garbage = Buffer.alloc(4096, 0x55)
  const pcm = await decode(garbage)
  assert.equal(pcm.length, 0)
})
