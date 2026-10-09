import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (!existsSync('.git')) {
  console.log('Not a git checkout, skipping git hooks.')
  process.exit(0)
}

execSync('git config core.hooksPath .githooks')
console.log('Git hooks enabled from .githooks/')
