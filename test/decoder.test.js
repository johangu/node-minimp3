const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Decoder = require('..')

// Expected values were checked against ffmpeg's decode of the same files.
// `bytes` is the length of the 16-bit PCM, trimmed for encoder delay/padding
// where the file has a Xing/LAME tag.
const fixtures = [
  {
    name: 'tone-440hz-2s-stereo-44100.mp3',
    note: 'CBR with Info tag',
    sampleRate: 44100,
    channels: 2,
    frequency: 440,
    bytes: 352800
  },
  {
    name: 'tone-880hz-1s-mono-48000-vbr.mp3',
    note: 'mono, VBR with Xing tag',
    sampleRate: 48000,
    channels: 1,
    frequency: 880,
    bytes: 96000
  },
  {
    name: 'tone-440hz-1s-stereo-44100-notag.mp3',
    note: 'no Xing/LAME tag, so nothing is trimmed',
    sampleRate: 44100,
    channels: 2,
    frequency: 440,
    bytes: 184320
  },
  {
    name: 'tone-440hz-1s-stereo-44100-id3.mp3',
    note: 'ID3v2 tag at the start, ID3v1 tag at the end',
    sampleRate: 44100,
    channels: 2,
    frequency: 440,
    bytes: 176400
  }
]

for (const fixture of fixtures) {
  fixture.data = fs.readFileSync(path.join(__dirname, 'fixtures', fixture.name))
}
const [stereo, mono, , tagged] = fixtures

const chunkSizes = [Infinity, 4096, 417, 1]

// Pushes `input` through a Decoder in `chunkSize` pieces.
function run (input, chunkSize = Infinity) {
  return new Promise(resolve => {
    const decoder = new Decoder()
    const out = []
    const formats = []
    let error = null
    decoder.on('format', format => formats.push(format))
    decoder.on('data', chunk => out.push(chunk))
    decoder.on('error', err => { error = err })
    decoder.on('close', () => resolve({ pcm: Buffer.concat(out), formats, error, decoder }))
    const size = Math.min(chunkSize, input.length) || 1
    for (let i = 0; i < input.length; i += size) {
      decoder.write(input.subarray(i, i + size))
    }
    decoder.end()
  })
}

async function decode (input, chunkSize) {
  const { pcm, error } = await run(input, chunkSize)
  assert.ifError(error)
  return pcm
}

function channel (pcm, ch, channels) {
  const samples = new Int16Array(pcm.length / 2 / channels)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = pcm.readInt16LE((i * channels + ch) * 2)
  }
  return samples
}

// Frequency from zero crossings, measured between the first and last audible
// samples so near-silent padding (which can hold +-1 noise) does not count.
function frequencyOf (samples, sampleRate) {
  const audible = i => Math.abs(samples[i]) > 1000
  let first = 0
  let last = samples.length - 1
  while (first < last && !audible(first)) first++
  while (last > first && !audible(last)) last--
  let crossings = 0
  for (let i = first + 1; i <= last; i++) {
    if ((samples[i - 1] < 0) !== (samples[i] < 0)) crossings++
  }
  return crossings / 2 / ((last - first) / sampleRate)
}

// Deterministic PRNG so failures are reproducible
function prng (seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function id3v2Tag (size) {
  // Syncsafe size: 7 bits per byte
  const syncsafe = Buffer.from([(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f])
  return Buffer.concat([Buffer.from('ID3\x03\x00\x00', 'latin1'), syncsafe, Buffer.alloc(size)])
}

for (const fixture of fixtures) {
  test(`${fixture.name} (${fixture.note})`, async t => {
    const whole = await decode(fixture.data)

    await t.test('decodes to the expected length', () => {
      assert.equal(whole.length, fixture.bytes)
    })

    await t.test('is the expected tone in every channel', () => {
      for (let ch = 0; ch < fixture.channels; ch++) {
        const samples = channel(whole, ch, fixture.channels)
        const peak = samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0)
        assert.ok(peak > 1000, `channel ${ch} is not silent (peak ${peak})`)
        const hz = frequencyOf(samples, fixture.sampleRate)
        assert.ok(Math.abs(hz - fixture.frequency) < 5, `channel ${ch} is ${hz} Hz`)
      }
    })

    for (const size of chunkSizes.slice(1)) {
      await t.test(`output is identical in ${size}-byte chunks`, async () => {
        assert.ok((await decode(fixture.data, size)).equals(whole))
      })
    }

    await t.test('emits format once, before any data', async () => {
      const decoder = new Decoder()
      const events = []
      decoder.on('format', format => events.push(['format', format]))
      decoder.on('data', () => events.push(['data']))
      decoder.end(fixture.data)
      await new Promise(resolve => decoder.on('close', resolve))
      assert.deepEqual(events[0], ['format', {
        sampleRate: fixture.sampleRate,
        channels: fixture.channels,
        bitDepth: 16,
        signed: true
      }])
      assert.equal(events.filter(e => e[0] === 'format').length, 1)
      assert.deepEqual(decoder.format, events[0][1])
    })
  })
}

test('ID3v2 tag at the start is skipped, even split across chunks', async () => {
  const expected = await decode(stereo.data)
  const input = Buffer.concat([id3v2Tag(3000), stereo.data])
  for (const size of [Infinity, 1000, 333, 7, 1]) {
    assert.ok((await decode(input, size)).equals(expected), `${size}-byte chunks`)
  }
})

test('ID3v1 tag at the end is skipped', async () => {
  const tag = Buffer.concat([Buffer.from('TAG'), Buffer.alloc(125)])
  const expected = await decode(stereo.data)
  const input = Buffer.concat([stereo.data, tag])
  for (const size of [Infinity, 4096, 1]) {
    assert.ok((await decode(input, size)).equals(expected), `${size}-byte chunks`)
  }
})

test('junk before the first frame is skipped', async () => {
  const expected = await decode(stereo.data)
  const input = Buffer.concat([Buffer.alloc(1000), stereo.data])
  for (const size of [Infinity, 333]) {
    assert.ok((await decode(input, size)).equals(expected), `${size}-byte chunks`)
  }
})

test('a truncated file decodes what is there', async () => {
  const whole = await decode(stereo.data)
  const pcm = await decode(stereo.data.subarray(0, 10000), 1000)
  assert.ok(pcm.length > 0 && pcm.length < whole.length)
  assert.equal(pcm.length % 4, 0, 'whole sample frames')
  assert.ok(whole.subarray(0, pcm.length).equals(pcm), 'is a prefix of the full decode')
})

test('empty input produces no data and no format', async () => {
  const { pcm, formats, error } = await run(Buffer.alloc(0))
  assert.ifError(error)
  assert.equal(pcm.length, 0)
  assert.equal(formats.length, 0)
})

test('input that is not mp3 produces no data and no error', async () => {
  const random = prng(1)
  const junk = Buffer.alloc(100000)
  for (let i = 0; i < junk.length; i++) junk[i] = Math.floor(random() * 255) // never 0xff, so no sync
  for (const size of [Infinity, 1000]) {
    const { pcm, formats, error } = await run(junk, size)
    assert.ifError(error)
    assert.equal(pcm.length, 0)
    assert.equal(formats.length, 0)
  }
})

test('a change of sample rate or channels is an error', async () => {
  const { error } = await run(Buffer.concat([stereo.data, mono.data]), 4096)
  assert.match(error.message, /change of sample rate, channels or layer/)
})

test('corrupt input never crashes', async () => {
  const random = prng(42)
  for (let round = 0; round < 25; round++) {
    const input = Buffer.from(tagged.data)
    for (let i = 0; i < 20; i++) input[Math.floor(random() * input.length)] = Math.floor(random() * 256)
    const { pcm, error } = await run(input, 1 + Math.floor(random() * 5000))
    assert.equal(pcm.length % 2, 0)
    // A mutated header can legitimately look like a format change
    if (error) assert.match(error.message, /change of sample rate/)
  }
})

test('decoders are independent', async () => {
  const [expectedStereo, expectedMono] = await Promise.all([decode(stereo.data), decode(mono.data)])
  const a = new Decoder()
  const b = new Decoder()
  const outA = []
  const outB = []
  a.on('data', chunk => outA.push(chunk))
  b.on('data', chunk => outB.push(chunk))
  const size = 1000
  for (let i = 0; i < stereo.data.length; i += size) {
    a.write(stereo.data.subarray(i, i + size))
    b.write(mono.data.subarray(i, i + size))
  }
  a.end()
  b.end()
  await Promise.all([a, b].map(d => new Promise(resolve => d.on('close', resolve))))
  assert.ok(Buffer.concat(outA).equals(expectedStereo))
  assert.ok(Buffer.concat(outB).equals(expectedMono))
})

test('the native decoder rejects non-buffer input', () => {
  const decoder = new Decoder()
  assert.throws(() => decoder._decoder.write('not a buffer'), TypeError)
})
