import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Releases come from the public repo, so no key or sign-in is needed. While the repo is still private, the person's
// GitHub CLI sign-in is used as a fallback (and never stored or returned).
export const UPDATE_REPOSITORY = { provider: 'github', owner: 'hollisorg', repo: 'iv-outreach' }
const run = promisify(execFile)

// Use the person's existing GitHub credentials only in the main process. Never persist or return the token.
export async function githubUpdateToken() {
  const candidates = process.platform === 'win32'
    ? [join(process.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI', 'gh.exe'), 'gh.exe'] : ['gh']
  for (const command of candidates) {
    if (command.includes('\\') && !existsSync(command)) continue
    try {
      const { stdout } = await run(command, ['auth', 'token', '--hostname', 'github.com'], { windowsHide: true, timeout: 10000, maxBuffer: 16384 })
      const token = stdout.trim()
      if (token && !/\s/.test(token)) return token
    } catch { /* CLI errors can contain auth details; do not log or expose them. */ }
  }
  return null
}

export class AppUpdates {
  constructor({ updater, version, supported, token = githubUpdateToken, onChange = () => {}, now = () => new Date().toISOString(), automatic = () => true }) {
    this.updater = updater; this.token = token; this.onChange = onChange; this.now = now; this.automatic = automatic; this.quiet = false
    this.state = { version, phase: supported ? 'idle' : 'unsupported', availableVersion: null, progress: 0, checkedAt: null, message: supported ? 'Check for a newer version of IV Outreach.' : 'Updates are available in the installed Windows app.' }
    this.supported = supported; this.pending = null
    updater.autoDownload = false
    // A downloaded update installs when IV Outreach closes; Restart and install does it now.
    updater.autoInstallOnAppQuit = true
    updater.allowDowngrade = false
    updater.allowPrerelease = false
    updater.disableDifferentialDownload = true
    updater.logger = null // Upstream errors may include authenticated URLs and request headers.
    updater.on('update-available', info => this.set({ phase: 'available', availableVersion: info.version, message: `Version ${info.version} is available.` }))
    updater.on('update-not-available', () => this.set({ phase: 'current', availableVersion: null, message: 'You have the latest release.' }))
    updater.on('download-progress', p => this.set({ phase: 'downloading', progress: Math.max(0, Math.min(100, Math.round(p.percent || 0))), message: 'Downloading your update…' }))
    updater.on('update-downloaded', info => this.set({ phase: 'ready', availableVersion: info.version, progress: 100, message: 'Your update is ready. It installs when you close IV Outreach, or restart now.' }))
    updater.on('error', () => { if (!this.quiet) this.fail() })
  }
  status() { return { ...this.state } }
  set(patch) { Object.assign(this.state, patch); this.onChange(this.status()); return this.status() }
  fail() { return this.set({ phase: 'error', progress: 0, message: 'Could not complete the update. Check your connection, then try again. It also tries again by itself.' }) }
  check() {
    if (!this.supported || ['ready', 'installing', 'downloading'].includes(this.state.phase)) return Promise.resolve(this.status())
    if (this.pending) return this.pending
    this.set({ phase: 'checking', availableVersion: null, progress: 0, message: 'Checking for updates…' })
    this.pending = (async () => {
      try {
        // Fixed destination; no URL or credentials supplied by renderer/MCP callers.
        try {
          this.quiet = true
          this.updater.setFeedURL({ ...UPDATE_REPOSITORY })
          await this.updater.checkForUpdates()
        } catch {
          this.quiet = false
          const token = await this.token()
          if (!token) return this.fail()
          this.updater.setFeedURL({ ...UPDATE_REPOSITORY, private: true, token })
          await this.updater.checkForUpdates()
        } finally { this.quiet = false }
        this.set({ checkedAt: this.now() })
      } catch { return this.fail() }
      finally { this.pending = null }
      // New versions download by themselves unless the person turned automatic updates off.
      if (this.state.phase === 'available' && this.automatic()) return this.download()
      return this.status()
    })()
    return this.pending
  }
  download() {
    if (this.state.phase === 'downloading' && this.pending) return this.pending
    if (this.state.phase !== 'available') throw new Error('Check for an available update first.')
    this.set({ phase: 'downloading', progress: 0, message: 'Downloading your update…' })
    this.pending = (async () => {
      try { await this.updater.downloadUpdate(); return this.status() }
      catch { return this.fail() }
      finally { this.pending = null }
    })()
    return this.pending
  }
  install({ busy = false } = {}) {
    if (busy) throw new Error('Wait for the current chat or mailbox task to finish before restarting.')
    if (this.state.phase !== 'ready') throw new Error('Download the update before restarting.')
    this.set({ phase: 'installing', message: 'Restarting to install your update…' })
    this.updater.quitAndInstall(false, true)
    return this.status()
  }
}
