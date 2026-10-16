// Packs the package, installs the tarball into an empty project and decodes a
// file through it, the way a user would.
//
//   node scripts/smoke-install.js                   the tarball must work without
//                                                   running any install script, i.e.
//                                                   from its prebuilt binary
//   node scripts/smoke-install.js --expect=source   install scripts run, and the
//                                                   addon must be compiled
//                                                   (pack without prebuilds/ first)
const { spawnSync } = require('node:child_process')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const fromSource = process.argv.includes('--expect=source')
const root = path.join(__dirname, '..')
const fixture = path.join(root, 'test', 'fixtures', 'tone-440hz-2s-stereo-44100.mp3')
const shell = process.platform === 'win32' // npm is a .cmd file there

function run (command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell, stdio: ['ignore', 'pipe', 'inherit'] })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
  return result.stdout
}

const cjs = `
const assert = require('node:assert/strict')
const Decoder = require('minimp3')
const { format, pcm } = Decoder.decodeSync(require('node:fs').readFileSync('tone.mp3'))
assert.deepEqual(format, { sampleRate: 44100, channels: 2, bitDepth: 16 })
assert.equal(pcm.length, 352800)
`

const esm = `
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Decoder, { decodeSync } from 'minimp3'
assert.equal(decodeSync, Decoder.decodeSync)
assert.equal(decodeSync(readFileSync('tone.mp3')).pcm.length, 352800)
`

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'minimp3-smoke-'))
try {
  const [{ filename }] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', tmp], root))
  console.log(`packed ${filename}`)

  const app = path.join(tmp, 'app')
  fs.mkdirSync(app)
  fs.writeFileSync(path.join(app, 'package.json'), '{ "private": true }')
  fs.copyFileSync(fixture, path.join(app, 'tone.mp3'))
  fs.writeFileSync(path.join(app, 'check.cjs'), cjs)
  fs.writeFileSync(path.join(app, 'check.mjs'), esm)

  const flags = ['--no-audit', '--no-fund', ...(fromSource ? [] : ['--ignore-scripts'])]
  run('npm', ['install', path.join(tmp, filename), ...flags], app)

  const installed = path.join(app, 'node_modules', 'minimp3')
  const hasBuild = fs.existsSync(path.join(installed, 'build', 'Release', 'minimp3.node'))
  const hasPrebuilds = fs.existsSync(path.join(installed, 'prebuilds'))
  if (fromSource) {
    assert.ok(hasBuild, 'expected the addon to be compiled on install')
    assert.ok(!hasPrebuilds, 'expected a tarball without prebuilds')
  } else {
    assert.ok(hasPrebuilds, 'the tarball has no prebuilds/')
    assert.ok(!hasBuild, 'nothing should have been compiled')
  }

  run(process.execPath, ['check.cjs'], app)
  run(process.execPath, ['check.mjs'], app)
  console.log(`ok: installed from ${fromSource ? 'source' : 'a prebuilt binary'}, loads with require and import`)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
