const neostandard = require('neostandard')

module.exports = neostandard({
  // build/ and prebuilds/ come from .gitignore. The TypeScript files in
  // test/types are checked by tsc, see `npm run test:types`.
  ignores: [...neostandard.resolveIgnoresFromGitignore(), 'test/types/**']
})
