// Cuts a release: bumps the version, commits, tags and pushes. Pushing the tag
// starts .github/workflows/release.yml, which builds the prebuilds and
// publishes to npm.
//
//   npm run release -- <major|minor|patch> [--yes] [--dry-run] [--skip-tests]
//
//   --yes          do not ask for confirmation
//   --dry-run      run the checks and show what would happen, change nothing
//   --skip-tests   do not run the linter and the tests first (CI still runs the
//                  tests before publishing)
//
// It is not called `publish` because npm runs a script of that name by itself
// after every `npm publish`.
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline/promises')

const BRANCH = 'master'
const REMOTE = 'origin'
const BUMPS = ['major', 'minor', 'patch']
const FLAGS = ['--yes', '--dry-run', '--skip-tests']

const root = path.join(__dirname, '..')
const shell = process.platform === 'win32' // npm is a .cmd file there

const args = process.argv.slice(2)
const flags = args.filter(arg => arg.startsWith('--'))
const [bump, ...extra] = args.filter(arg => !arg.startsWith('--'))
if (!BUMPS.includes(bump) || extra.length > 0 || flags.some(flag => !FLAGS.includes(flag))) {
  console.error(`Usage: npm run release -- <${BUMPS.join('|')}> [${FLAGS.join('] [')}]`)
  process.exit(2)
}
const dryRun = flags.includes('--dry-run')

function fail (message) {
  console.error(`\nrelease: ${message}`)
  process.exit(1)
}

function run (command, commandArgs, { inherit = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    shell,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe']
  })
  return { ok: result.status === 0, out: (result.stdout || '').trim(), err: (result.stderr || '').trim() }
}

function git (...gitArgs) {
  const result = run('git', gitArgs)
  if (!result.ok) fail(`git ${gitArgs.join(' ')} failed:\n${result.err}`)
  return result.out
}

function nextVersion (current, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
  if (!match) fail(`cannot bump version "${current}", expected major.minor.patch`)
  const [major, minor, patch] = match.slice(1).map(Number)
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

async function confirm (question) {
  if (flags.includes('--yes')) return
  if (!process.stdin.isTTY) fail('not a terminal, pass --yes to continue without asking')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(question)
  rl.close()
  if (!/^y(es)?$/i.test(answer.trim())) fail('aborted, nothing was changed')
}

async function main () {
  const { name, version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const next = nextVersion(version, bump)
  const tag = `v${next}`

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  if (branch !== BRANCH) fail(`releases are made from ${BRANCH}, you are on ${branch}`)

  // Untracked files are fine, like for `npm version`
  if (git('status', '--porcelain', '--untracked-files=no')) fail('there are uncommitted changes')

  git('fetch', '--tags', REMOTE)
  const behind = Number(git('rev-list', '--count', `HEAD..${REMOTE}/${BRANCH}`))
  if (behind > 0) fail(`${BRANCH} is ${behind} commit(s) behind ${REMOTE}, pull first`)
  const ahead = Number(git('rev-list', '--count', `${REMOTE}/${BRANCH}..HEAD`))

  if (git('tag', '--list', tag)) fail(`tag ${tag} already exists`)
  if (git('ls-remote', '--tags', REMOTE, tag)) fail(`tag ${tag} already exists on ${REMOTE}`)

  const changelog = path.join(root, 'CHANGELOG.md')
  if (fs.existsSync(changelog) && !new RegExp(`^## \\[?${next.replaceAll('.', '\\.')}\\]?`, 'm').test(fs.readFileSync(changelog, 'utf8'))) {
    fail(`CHANGELOG.md has no "## ${next}" entry, add it and commit first`)
  }

  if (!flags.includes('--skip-tests')) {
    console.log('Running the tests...')
    if (!run('npm', ['run', 'lint'], { inherit: true }).ok) fail('the linter reports problems')
    if (!run('npm', ['test'], { inherit: true }).ok) fail('the tests fail')
    if (!run('npm', ['run', 'test:types'], { inherit: true }).ok) fail('the type check fails')
  }

  console.log(`
Release ${name} ${version} -> ${next}
  commits "Release ${next}" and tags ${tag} on ${BRANCH}${ahead ? ` (together with ${ahead} commit(s) ${REMOTE} does not have yet)` : ''}
  pushes both to ${REMOTE}, which publishes ${name}@${next} to npm
`)
  if (dryRun) {
    console.log('Dry run, nothing was changed.')
    return
  }
  await confirm('Continue? [y/N] ')

  if (!run('npm', ['version', bump, '-m', 'Release %s'], { inherit: true }).ok) fail('npm version failed')

  if (!run('git', ['push', '--atomic', REMOTE, BRANCH, tag], { inherit: true }).ok) {
    fail(`the push failed. The release commit and ${tag} exist locally only. To retry: git push --atomic ${REMOTE} ${BRANCH} ${tag}
To undo instead: git tag -d ${tag} && git reset --hard HEAD~1`)
  }

  const remoteUrl = git('remote', 'get-url', REMOTE)
  const repo = /github\.com[:/](.+?)(\.git)?$/.exec(remoteUrl)
  console.log(`\nPushed ${tag}.${repo ? ` Follow the publish at https://github.com/${repo[1]}/actions` : ''}`)
}

main()
