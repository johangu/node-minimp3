# minimp3

Node.js bindings for [minimp3](https://github.com/lieff/minimp3), a small, fast
and ISO-conformant MP3 decoder. Decode MP3 to raw PCM, either as a stream or from
a buffer in memory.

- Streaming `Transform` that handles any chunking of the input
- Gapless output: encoder delay and padding are trimmed when the file has a Xing/LAME tag
- Skips ID3v2 and ID3v1 tags
- Works with `require` and `import`, with TypeScript typings included
- minimp3 is bundled, there is nothing else to install

## Installation

```sh
npm install minimp3
```

Requires Node.js 22 or later.

Prebuilt binaries are included for:

| OS      | Architectures |
| ------- | ------------- |
| macOS   | arm64, x64    |
| Linux (glibc) | x64, arm64 |
| Windows | x64           |

On these, nothing is compiled during installation, and it works with
`--ignore-scripts`. On any other platform, such as Alpine Linux (musl), the addon
is compiled from the bundled source when you install, which needs Python 3, make
and a C++ compiler (on Alpine: `apk add python3 make g++`).

## Usage

### Decoding a stream

`Decoder` is a [`Transform`](https://nodejs.org/api/stream.html#class-streamtransform):
write MP3 data to it, read 16-bit PCM from it. The `'format'` event tells you what
the PCM looks like, and fires once before the first data.

```js
const { createReadStream, createWriteStream } = require('node:fs')
const { pipeline } = require('node:stream/promises')
const Decoder = require('minimp3')

const decoder = new Decoder()
decoder.on('format', format => {
  console.log(format) // { sampleRate: 44100, channels: 2, bitDepth: 16 }
})

pipeline(
  createReadStream('song.mp3'),
  decoder,
  createWriteStream('song.pcm') // raw interleaved 16-bit little-endian samples
).then(() => console.log('done'), console.error)
```

### Decoding a buffer

`decodeSync` decodes a complete MP3 that is already in memory. This example
writes the result as a WAV file, using the format to fill in the header.

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { decodeSync } from 'minimp3'

const { format, pcm } = decodeSync(readFileSync('song.mp3'))
if (!format) throw new Error('no MP3 data found')

const { sampleRate, channels, bitDepth } = format
const blockAlign = channels * (bitDepth / 8)
const header = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + pcm.length, 4)
header.write('WAVEfmt ', 8)
header.writeUInt32LE(16, 16) // size of the fmt chunk
header.writeUInt16LE(1, 20) // PCM
header.writeUInt16LE(channels, 22)
header.writeUInt32LE(sampleRate, 24)
header.writeUInt32LE(sampleRate * blockAlign, 28) // byte rate
header.writeUInt16LE(blockAlign, 32)
header.writeUInt16LE(bitDepth, 34)
header.write('data', 36)
header.writeUInt32LE(pcm.length, 40)

writeFileSync('song.wav', Buffer.concat([header, pcm]))
```

## API

### `new Decoder([options])`

A `Transform` stream. `options` are passed to the `Transform` constructor, except
`objectMode`, which is always `false`. Its input is MP3 data in chunks of any size,
and its output is PCM (see [Output format](#output-format)).

Errors, such as a change of sample rate (see [Limitations](#limitations)), are
emitted as `'error'` events and destroy the stream.

#### Event: `'format'`

- `format` [`Format`](#output-format)

Emitted once, when the first MP3 frame has been read and before the first `'data'`
event. Never emitted if the input contains no MP3 frames.

#### `decoder.format`

[`Format`](#output-format) or `null` until the `'format'` event has been emitted.

### `Decoder.decodeSync(input)`

- `input` `Buffer | Uint8Array` a complete MP3 file
- Returns `{ format, pcm }`
  - `format` [`Format`](#output-format), or `null` if no MP3 frames were found
  - `pcm` `Buffer` the decoded audio

Produces the same output as the stream. Throws a `TypeError` if `input` is not a
`Buffer` or `Uint8Array`, and an `Error` if the data cannot be decoded.

It is also available as a named export: `import { decodeSync } from 'minimp3'`.
`Decoder` is a named export as well, next to the default export.

### Output format

The audio is 16-bit signed little-endian PCM, with the channels interleaved
(`L R L R ...` for stereo).

| Field        | Type     | Description                            |
| ------------ | -------- | -------------------------------------- |
| `sampleRate` | `number` | Samples per second per channel, e.g. `44100` |
| `channels`   | `number` | `1` (mono) or `2` (stereo)             |
| `bitDepth`   | `16`     | Always 16                              |

## Notes

- **Gapless:** if the file has a Xing/Info/LAME tag, which most encoders write, the
  encoder delay and padding are removed, so the output is exactly as long as the
  original audio. Files without one are decoded as is.
- **Tags:** an ID3v2 tag at the start and an ID3v1 tag at the end are skipped.
  Anything else that is not an MP3 frame, such as junk before the first frame, is
  skipped as well.
- **Partial frames:** the stream keeps whatever it needs from one chunk to the
  next, so it does not matter where the chunk boundaries fall. Data that ends in
  the middle of a frame decodes up to the last complete frame.

## Limitations

- The sample rate, number of channels and MPEG layer must stay the same for the
  whole stream. A change is an error.
- Decoding only. There is no seeking, and no encoding.
- Output is 16-bit integer only.

## License

MIT. The bundled minimp3 is by [lieff](https://github.com/lieff/minimp3) and is
released under CC0. The version in use is recorded in
[`lib/UPSTREAM.md`](lib/UPSTREAM.md).
