import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const UPDATE_REPOSITORY = { provider: 'github', owner: 'hollisorg', repo: 'iv-outreach', private: true }
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
  constructor({ updater, version, supported, token = githubUpdateToken, onChange = () => {}, now = () => new Date().toISOString() }) {
    this.updater = updater; this.token = token; this.onChange = onChange; this.now = now
    this.state = { version, phase: supported ? 'idle' : 'unsupported', availableVersion: null, progress: 0, checkedAt: null, message: supported ? 'Check for a newer version of IV Outreach.' : 'Updates are available in the installed Windows app.' }
    this.supported = supported; this.pending = null
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.allowDowngrade = false
    updater.allowPrerelease = false
    updater.disableDifferentialDownload = true
    updater.logger = null // Upstream errors may include authenticated URLs and request headers.
    updater.on('update-available', info => this.set({ phase: 'available', availableVersion: info.version, message: `Version ${info.version} is available.` }))
    updater.on('update-not-available', () => this.set({ phase: 'current', availableVersion: null, message: 'You have the latest release.' }))
    updater.on('download-progress', p => this.set({ phase: 'downloading', progress: Math.max(0, Math.min(100, Math.round(p.percent || 0))), message: 'Downloading your update…' }))
    updater.on('update-downloaded', info => this.set({ phase: 'ready', availableVersion: info.version, progress: 100, message: 'Your update is ready. Restart when it suits you.' }))
    updater.on('error', () => this.fail())
  }
  status() { return { ...this.state } }
  set(patch) { Object.assign(this.state, patch); this.onChange(this.status()); return this.status() }
  fail() { return this.set({ phase: 'error', progress: 0, message: 'Could not complete the update. Check your connection and GitHub access, then try again.' }) }
  check() {
    if (!this.supported || ['ready', 'installing', 'downloading'].includes(this.state.phase)) return Promise.resolve(this.status())
    if (this.pending) return this.pending
    this.set({ phase: 'checking', availableVersion: null, progress: 0, message: 'Checking for updates…' })
    this.pending = (async () => {
      try {
        const token = await this.token()
        if (!token) return this.set({ phase: 'auth-required', message: 'Private test updates need GitHub CLI signed in to an account with access to hollisorg/iv-outreach. Run gh auth login, then check again.' })
        // Fixed destination; no URL or credentials supplied by renderer/MCP callers.
        this.updater.setFeedURL({ ...UPDATE_REPOSITORY, token })
        await this.updater.checkForUpdates()
        return this.set({ checkedAt: this.now() })
      } catch { return this.fail() }
      finally { this.pending = null }
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
