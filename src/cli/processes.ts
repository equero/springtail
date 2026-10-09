import { spawn } from 'node:child_process'

/**
 * Checks whether a process is still running.
 *
 * @param pid - Process id.
 * @returns `true` when the process exists.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function openInBrowser(url: string): void {
  const options = { stdio: 'ignore', detached: true, windowsHide: true } as const
  const opener =
    process.platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '""', `"${url}"`], { ...options, windowsVerbatimArguments: true })
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], options)
  opener.on('error', () => console.log(`Open ${url} in your browser.`))
  opener.unref()
}
