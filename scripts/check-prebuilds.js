// Run by `npm publish` (prepublishOnly) so that a package is never published
// with binaries missing. Prebuilds are built by CI, see
// .github/workflows/release.yml. Keep PLATFORMS in sync with its matrix.
const fs = require('node:fs')
const path = require('node:path')

const PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-x64'
]

const dir = path.join(__dirname, '..', 'prebuilds')
const missing = PLATFORMS.filter(platform => {
  const files = fs.existsSync(path.join(dir, platform)) ? fs.readdirSync(path.join(dir, platform)) : []
  return !files.some(file => file.endsWith('.node'))
})

if (missing.length > 0) {
  console.error(`Refusing to publish: no prebuild for ${missing.join(', ')}.`)
  console.error('Publish from CI (the release workflow), which builds all of them.')
  process.exit(1)
}
console.log(`All ${PLATFORMS.length} prebuilds present.`)
