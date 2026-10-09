import { execSync } from 'node:child_process'

try {
  execSync('git config --unset core.hooksPath')
  console.log('Git hooks disabled.')
} catch {
  console.log('Git hooks were not enabled.')
}
