#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const noTag = args.includes('--no-tag')
const major = args.includes('--major')
const minor = args.includes('--minor')
const patch = args.includes('--patch')

const exec = (command, options = {}) => {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'inherit', ...options })
  } catch (error) {
    console.error(`Error executing: ${command}`)
    process.exit(1)
  }
}

const execSilent = (command) => {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim()
  } catch (error) {
    return ''
  }
}

if (noTag) {
  console.log('Syncing develop to master (without tagging)...\n')
} else if (major) {
  console.log('Syncing develop to master (major version bump)...\n')
} else if (minor) {
  console.log('Syncing develop to master (minor version bump)...\n')
} else if (patch) {
  console.log('Syncing develop to master (patch version bump)...\n')
} else {
  console.log('Syncing develop to master...\n')
}

const currentBranch = execSilent('git rev-parse --abbrev-ref HEAD')
if (currentBranch !== 'develop') {
  console.error('Error: You must be on "develop" branch')
  console.error(`   Current branch: ${currentBranch}`)
  process.exit(1)
}

const hasChanges = execSilent('git diff-index --quiet HEAD -- || echo "changes"')
if (hasChanges === 'changes') {
  console.error('Error: You have uncommitted changes')
  console.error('   Please commit or stash them first')
  process.exit(1)
}

console.log('Pushing develop...')
exec('git push origin develop')

console.log('Switching to master...')
exec('git checkout master')

console.log('Merging develop into master...')
const env = noTag ? { ...process.env, SKIP_VERSION_BUMP: '1' } : process.env

if (major) {
  env.VERSION_BUMP_TYPE = 'major'
} else if (minor) {
  env.VERSION_BUMP_TYPE = 'minor'
} else if (patch) {
  env.VERSION_BUMP_TYPE = 'patch'
}

// Guard: if the target branch already contains develop, the merge is a no-op
// and the post-merge hook never runs, so no version bump happens. Warn instead
// of reporting a misleading success.
const behind = execSilent('git rev-list --count HEAD..develop')
if (behind === '0') {
  console.warn(
    'Warning: target branch already up to date with develop - nothing to merge.\n' +
      '   No version bump will occur (post-merge hook only runs on a real merge).\n' +
      '   Commit a change on develop first if you intended to bump.',
  )
}

try {
  execSync('git merge develop --no-edit', {
    encoding: 'utf8',
    stdio: 'pipe',
    env,
  })
  console.log('Merge completed successfully')
} catch (error) {
  const conflictedFiles = execSilent('git diff --name-only --diff-filter=U')

  if (conflictedFiles) {
    console.log('Merge conflicts detected, resolving automatically...')

    if (conflictedFiles.includes('package.json')) {
      console.log("   Resolving package.json: using develop's version")
      execSync('git checkout --theirs package.json', { stdio: 'pipe' })
      execSync('git add package.json', { stdio: 'pipe' })
    }

    const remainingConflicts = execSilent('git diff --name-only --diff-filter=U')

    if (remainingConflicts) {
      console.error(`Unresolved conflicts in: ${remainingConflicts}`)
      console.error('   Please resolve them manually')
      process.exit(1)
    }

    execSync('git commit --no-edit', {
      encoding: 'utf8',
      stdio: 'inherit',
      env,
    })
    console.log('Conflicts resolved and merge completed')
  } else {
    console.error('Error executing merge')
    process.exit(1)
  }
}

console.log('Pushing master...')
exec('git push origin master')

console.log('Pushing develop (synced version)...')
exec('git push origin develop')

let latestTag = ''
if (!noTag) {
  latestTag = execSilent('git describe --tags --abbrev=0')
  if (latestTag) {
    console.log(`Pushing tag ${latestTag}...`)
    exec(`git push origin ${latestTag}`)
  }
}

console.log('Returning to develop...')
exec('git checkout develop')

// post-merge hook syncs develop's version after master bump.
// Verify versions match; warn if not (indicates hook failure).
const masterPkg = execSilent('git show master:package.json')
const masterVersion = masterPkg ? JSON.parse(masterPkg).version : null
const developVersion = JSON.parse(readFileSync('./package.json', 'utf8')).version

if (masterVersion && masterVersion !== developVersion) {
  console.warn(
    `Warning: develop version (${developVersion}) does not match master (${masterVersion}). post-merge hook may have failed.`,
  )
  console.warn('Inspect manually before re-running sync.')
}

console.log('\nSync completed!')

if (noTag) {
  console.log('No tag was created (--no-tag flag used)')
} else {
  try {
    const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'))
    console.log(`Version: ${packageJson.version}`)
    if (major) {
      console.log('   Version bump type: major (first digit)')
    } else if (minor) {
      console.log('   Version bump type: minor (second digit)')
    } else if (patch) {
      console.log('   Version bump type: patch (third digit)')
    } else {
      console.log('   Version bump type: default')
    }
  } catch (error) {
    console.log('Version: unknown')
  }

  const latestTag = execSilent('git describe --tags --abbrev=0')
  if (latestTag) {
    console.log(`Tag: ${latestTag}`)
  }
}

console.log('')
