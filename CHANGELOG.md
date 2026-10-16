# Changelog

## 2.0.0

A rewrite of the decoder. The `Decoder` stream is used the same way, but its output
is different, and often correct where it was not before. Please read **Changed**.

### Fixed

- `1.0.0` could not be loaded after installing it from npm: `require('minimp3')`
  threw `Cannot find module 'debug'`, because `debug` was only a development
  dependency.
- The stream decoded every chunk of input on its own, so frames that straddled a
  chunk boundary were lost, without an error. For a 2 second file, which should
  give 352800 bytes of audio, `1.0.0` gave 262656 bytes with 4096 byte chunks and
  nothing at all with chunks of 417 bytes. The decoder now keeps its state from one
  chunk to the next, and the output is the same whatever the chunk sizes are.
- The decoded audio was not freed, which leaked memory for every chunk.
- The audio included the silence that encoders add at the start and the end. If the
  file has a Xing/Info/LAME tag, which most encoders write, it is trimmed now, so
  the output is as long as the original audio (352800 instead of 364032 bytes for the
  file above).
- ID3v2 tags at the start and ID3v1 tags at the end of the file are skipped,
  wherever the chunk boundaries fall.

### Added

- The `'format'` event and `decoder.format`, with the sample rate, the number of
  channels and the bit depth of the audio.
- `Decoder.decodeSync(buffer)` to decode a complete MP3 in memory.
- An ES module entry point (`import Decoder, { decodeSync } from 'minimp3'`), and
  TypeScript typings for both module systems.
- Prebuilt binaries for macOS (arm64, x64), Linux with glibc (x64, arm64) and
  Windows (x64). Installing no longer needs a compiler on those platforms, and it
  works with `--ignore-scripts`. Other platforms still build from source when the
  package is installed.

### Changed

- **Node.js 22 or later is required.**
- **The output is different** from `1.0.0`: it is the exact audio, as described
  above, and not the audio with extra silence. Code that relied on the old lengths
  needs to be updated.
- Input that is not MP3 data produces no output and no error. `1.0.0` threw
  `Unknown failure` in some cases.
- A change of sample rate, number of channels or MPEG layer in the middle of a
  stream is an error, emitted as an `'error'` event.
- The options passed to `new Decoder(options)` are passed on to the `Transform`
  stream. They were ignored before. `objectMode` is always off.
- Debug logging uses Node's own `NODE_DEBUG=minimp3` and not `DEBUG=minimp3`.
- minimp3 is updated from the 2019 version to
  [`ea99364`](https://github.com/lieff/minimp3/commit/ea99364f61c14656440e8d77e9c233ccf3124633)
  (2026-07-27), which includes its security hardening since then.

### Removed

- The `debug` and `bindings` packages are no longer used.
