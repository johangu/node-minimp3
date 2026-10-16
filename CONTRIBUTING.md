# Contributing

## Development

You need Node.js 22 or later, plus Python 3, make and a C++ compiler to build the
addon (Xcode command line tools on macOS, `build-essential` on Debian/Ubuntu, Visual
Studio Build Tools on Windows).

```sh
npm install            # installs and compiles the addon from source
npm run build          # recompile after changing lib/minimp3.cc
npm test               # unit tests (node:test)
npm run test:coverage  # the same, with coverage of the JavaScript
npm run test:types     # type-checks the typings with CommonJS and ESM consumers
```

The test fixtures in `test/fixtures` are described in the README next to them.

### The bundled minimp3

`lib/minimp3.h` and `lib/minimp3_ex.h` are unmodified copies of
[lieff/minimp3](https://github.com/lieff/minimp3). To update them, download both
files from the commit you want and record its SHA in `lib/UPSTREAM.md`. Then run
the tests and compare the output of the fixtures with ffmpeg's.

### Prebuilt binaries

The package ships prebuilt binaries (see `.github/workflows/release.yml`), so
nothing is compiled when users install it. They are only built in CI. To try
building one on your machine:

```sh
npm run prebuildify    # writes prebuilds/<platform>-<arch>/
npm run test:install   # packs the package and installs it into an empty project
                       # without running any install script
```

## Releasing

Releases are made from `master`, with a clean working tree. Update `CHANGELOG.md`
(if there is one) with an entry for the new version, commit it, then run:

```sh
npm run release -- patch   # or minor, or major
```

(The `--` is needed for npm to pass the argument on. Add `--dry-run` to see what
would happen without changing anything.)

It checks that `master` is up to date with `origin`, runs the tests, asks for
confirmation, bumps the version in `package.json` and the lockfile, commits it as
"Release x.y.z", tags it `vx.y.z` and pushes both.

Pushing the tag starts the **Release** workflow, which builds the binaries for every
platform, installs the packed package on each of them, and publishes it to npm with
provenance. Publishing uses npm's trusted publishing, so there is no token to
manage: the package's settings on npmjs.com name this repository and
`release.yml`.

You can run the **Release** workflow by hand from the Actions tab to test the whole
pipeline without publishing.
