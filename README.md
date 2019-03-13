# node-minimp3

## NodeJS native binding to [lieff/minimp3](https://github.com/lieff/minimp3)
This module hook into `minimp3`, a "Minimalistic, single-header library for decoding MP3. minimp3  
is designed to be small, fast (with SSE and NEON support), and accurate (ISO conformant)", to  
provide a decode stream to NodeJS.

## Installation
`node-minimp3` is bundled with a copy of the library.  

Installation via npm:

``` bash
$ npm i minimp3
```

## Example usage

This is an example of how to decode an mp3-file and pipe the output to `node-speaker` ([TooTallNate/node-speaker](https://www.github.com/TooTallNate/node-speaker))

``` javascript
const { Decoder } = require('minimp3')
const Speaker = require('speaker')
const { createReadStream } = require('fs')

const decoder = new Decoder()
const speaker = new Speaker()
const fileStream = createReadStream('/path/to/my/file.mp')
fileStream.pipe(decoder).pipe(speaker)
```

## Api

The `Decoder` class inherits `Transform` from `stream` and accepts mp3-data and outputs a decoded buffer.
