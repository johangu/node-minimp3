# Fixtures

`tone-440hz-2s-stereo-44100.mp3`: 2 s, 440 Hz sine, stereo, 44.1 kHz, 128 kbps CBR
(33061 bytes). Decodes to 176400 sample frames (352800 bytes of 16-bit PCM).

Regenerate with:

```sh
ffmpeg -fflags +bitexact -f lavfi -i "sine=frequency=440:duration=2:sample_rate=44100" \
  -ac 2 -b:a 128k -map_metadata -1 -flags:a +bitexact tone-440hz-2s-stereo-44100.mp3
```
