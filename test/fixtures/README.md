# Fixtures

All are generated sine tones. Expected PCM lengths are in `../decoder.test.js`
and were checked against ffmpeg's decode of the same files.

| File | Format | Notes |
| --- | --- | --- |
| `tone-440hz-2s-stereo-44100.mp3` | 2 s, stereo, 44.1 kHz, 128 kbps CBR | Info tag |
| `tone-880hz-1s-mono-48000-vbr.mp3` | 1 s, mono, 48 kHz, VBR (`-q:a 5`) | Xing tag |
| `tone-440hz-1s-stereo-44100-notag.mp3` | 1 s, stereo, 44.1 kHz, 128 kbps CBR | no Xing/LAME tag, so no gapless trimming |
| `tone-440hz-1s-stereo-44100-id3.mp3` | 1 s, stereo, 44.1 kHz, 128 kbps CBR | ID3v2 tag at the start, ID3v1 tag at the end |

Regenerate with:

```sh
ffmpeg -fflags +bitexact -f lavfi -i "sine=frequency=440:duration=2:sample_rate=44100" \
  -ac 2 -b:a 128k -map_metadata -1 -flags:a +bitexact tone-440hz-2s-stereo-44100.mp3

ffmpeg -fflags +bitexact -f lavfi -i "sine=frequency=880:duration=1:sample_rate=48000" \
  -ac 1 -q:a 5 -map_metadata -1 -flags:a +bitexact tone-880hz-1s-mono-48000-vbr.mp3

ffmpeg -fflags +bitexact -f lavfi -i "sine=frequency=440:duration=1:sample_rate=44100" \
  -ac 2 -b:a 128k -write_xing 0 -map_metadata -1 -flags:a +bitexact tone-440hz-1s-stereo-44100-notag.mp3

ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=44100" \
  -ac 2 -b:a 128k -metadata title="Test tone" -metadata artist="node-minimp3" \
  -id3v2_version 3 -write_id3v1 1 tone-440hz-1s-stereo-44100-id3.mp3
```
