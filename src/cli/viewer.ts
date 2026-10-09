import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { homeDirectory, logDirectory, viewerPidFile, viewerPort } from '../shared/settings.js'
import { isProcessAlive, openInBrowser } from './processes.js'

const STARTUP_ATTEMPTS = 20
const STARTUP_DELAY_MS = 250
const HEALTH_TIMEOUT_MS = 1_000
const serverEntry = fileURLToPath(new URL('../server/main.js', import.meta.url))

export const viewerUrl = `http://localhost:${viewerPort}/`

/**
 * Builds the viewer address that opens straight on one project.
 *
 * @param project - Project name, or `undefined` for the default page.
 * @returns The URL to open.
 */
export function viewerUrlFor(project: string | undefined): string {
  return project ? `${viewerUrl}#${encodeURIComponent(project)}` : viewerUrl
}

export async function isViewerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${viewerPort}/api/sources`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function ensureViewer(): Promise<boolean> {
  if (await isViewerRunning()) return true

  await mkdir(homeDirectory, { recursive: true })
  const child = spawn(process.execPath, [serverEntry, '--dir', logDirectory, '--port', String(viewerPort)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  if (child.pid !== undefined) await writeFile(viewerPidFile, String(child.pid))

  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, STARTUP_DELAY_MS))
    if (await isViewerRunning()) return true
  }
  return false
}

export async function stopViewer(): Promise<boolean> {
  const pid = Number(await readFile(viewerPidFile, 'utf8').catch(() => ''))
  await rm(viewerPidFile, { force: true })
  if (!Number.isInteger(pid) || pid <= 0 || !isProcessAlive(pid) || !(await isViewerRunning())) return false
  process.kill(pid)
  return true
}

/**
 * Opens the viewer on a project, starting it first when needed.
 *
 * @param project - Project to show, or `undefined` for the default page.
 * @returns `true` when the viewer is up and was opened.
 */
export async function openViewer(project: string | undefined): Promise<boolean> {
  if (!(await ensureViewer())) {
    console.error(`The springtail viewer did not start on port ${viewerPort}. Is another program using it?`)
    return false
  }
  const url = viewerUrlFor(project)
  openInBrowser(url)
  console.log(`springtail viewer: ${url}`)
  return true
}
