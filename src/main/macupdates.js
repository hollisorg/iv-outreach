// IV Outreach's updates on a Mac. electron-updater's Mac path (Squirrel.Mac) only installs into an app signed with a
// paid Apple Developer ID, and the Mac build is ad-hoc signed, so a Mac copy swaps its own app bundle (the steps are in
// src/service/macupdate.js, from IV Studio). This class has AppUpdates' interface and phases (status, check, download,
// install), so Settings > Updates and the timers in index.js work the same as on Windows: it reads the release's
// latest-mac.yml, downloads the zip for this chip, checks its SHA-512 and size, unpacks and checks the new bundle, and
// a small script swaps it in when IV Outreach closes or on Restart and install.
// A copy that can't replace itself (run from the .dmg, from Downloads, or without write access) says why, and its
// Download button opens the release page instead.
// IV_OUTREACH_UPDATE_FEED points a test copy at a local feed; IV_OUTREACH_UPDATE_SELFTEST=1 then downloads and
// installs straight away (the Mac CI's update check, on a copy of the app in a temporary folder).
import { app, shell } from 'electron'
import { spawn, execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appBundleOf, cannotReplace, checkFile, download, feedUrls, installScript, newer, parseFeed, pickFile, stage } from '../service/macupdate.js'

const NAME = 'IV Outreach'
const runTool = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { maxBuffer: 4 << 20 }, (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr })))

export class MacAppUpdates {
  constructor({ version, releases, testFeed = null, selftest = false, onChange = () => {}, now = () => new Date().toISOString(), automatic = () => true }) {
    this.version = version; this.releases = releases; this.testFeed = testFeed; this.selftest = !!testFeed && selftest
    this.onChange = onChange; this.now = now; this.automatic = automatic
    this.urls = feedUrls(releases, testFeed)
    this.work = path.join(os.tmpdir(), 'iv-outreach-update')
    this.bundle = appBundleOf(process.execPath)
    this.supported = true; this.pending = null; this.feed = null; this.file = null; this.staged = null
    this.state = { version, phase: 'idle', availableVersion: null, progress: 0, checkedAt: null, message: 'Check for a newer version of IV Outreach.' }
    // a downloaded update also installs when IV Outreach closes (never from a test feed, except the selftest)
    app.on('will-quit', () => {
      if (!this.staged || this.state.phase !== 'ready' || (this.testFeed && !this.selftest)) return
      try { this.swap(false); this.staged = null } catch (err) { this.log(`couldn't start the install on quit: ${err.message}`) }
    })
  }
  status() { return { ...this.state } }
  set(patch) { Object.assign(this.state, patch); this.onChange(this.status()); return this.status() }
  log(line) {
    try { fs.mkdirSync(this.work, { recursive: true }); fs.appendFileSync(path.join(this.work, 'update.log'), `${new Date().toISOString()} ${line}\n`) } catch { /* the log is only a help */ }
  }
  fail(err) {
    this.log(`error: ${err?.message || err}`)
    return this.set({ phase: 'error', progress: 0, message: 'Could not complete the update. Check your connection, then try again. It also tries again by itself.' })
  }
  check() {
    if (['ready', 'installing', 'downloading'].includes(this.state.phase)) return Promise.resolve(this.status())
    if (this.pending) return this.pending
    this.set({ phase: 'checking', availableVersion: null, progress: 0, message: 'Checking for updates…' })
    this.pending = (async () => {
      try {
        const res = await fetch(`${this.urls.feed}${this.testFeed ? '' : `?t=${Date.now()}`}`, { redirect: 'follow' })
        // 404: the newest release has no Mac files yet
        const feed = res.status === 404 ? null : res.ok ? parseFeed(await res.text()) : null
        if (!res.ok && res.status !== 404) throw new Error(`GitHub answered ${res.status}.`)
        this.set({ checkedAt: this.now() })
        if (!feed || !newer(feed.version, this.version)) return this.set({ phase: 'current', availableVersion: null, manual: false, message: 'You have the latest release.' })
        this.feed = feed
        this.file = pickFile(feed.files, process.arch)
        const why = !this.file ? `The update has no ${process.arch === 'arm64' ? 'Apple Silicon' : 'Intel'} zip.` : cannotReplace(this.bundle, { name: NAME })
        if (why) {
          this.log(`${feed.version} is out; can't install here: ${why}`)
          return this.set({ phase: 'available', availableVersion: feed.version, manual: true, message: `Version ${feed.version} is available. ${why}` })
        }
        this.set({ phase: 'available', availableVersion: feed.version, manual: false, message: `Version ${feed.version} is available.` })
      } catch (err) { return this.fail(err) }
      finally { this.pending = null }
      if (this.state.phase === 'available' && !this.state.manual && (this.automatic() || this.selftest)) return this.download()
      return this.status()
    })()
    return this.pending
  }
  download() {
    if (this.state.phase === 'downloading' && this.pending) return this.pending
    if (this.state.phase !== 'available') throw new Error('Check for an available update first.')
    // a copy that can't replace itself: the release page instead
    if (this.state.manual) { shell.openExternal(`${this.releases}/latest`); return Promise.resolve(this.status()) }
    const { feed, file } = this
    this.set({ phase: 'downloading', progress: 0, message: 'Downloading your update…' })
    this.pending = (async () => {
      try {
        const zip = path.join(this.work, path.basename(file.url))
        this.log(`downloading ${file.url} (${feed.version})`)
        await download(this.urls.file(file.url, feed.version), zip, { agent: 'IV-Outreach-updater', onProgress: (p) => p !== this.state.progress && this.set({ progress: p }) })
        await checkFile(zip, file)
        const appPath = await stage(zip, path.join(this.work, `${NAME} ${feed.version}`), { version: feed.version, run: runTool })
        fs.rmSync(zip, { force: true })
        this.staged = { version: feed.version, app: appPath }
        this.log(`ready: ${appPath}`)
        this.set({ phase: 'ready', availableVersion: feed.version, progress: 100, message: 'Your update is ready. It installs when you close IV Outreach, or restart now.' })
        if (this.selftest) this.install()
        return this.status()
      } catch (err) { return this.fail(err) }
      finally { this.pending = null }
    })()
    return this.pending
  }
  // hand the swap to a script that waits for this process to end
  swap(relaunch) {
    const script = path.join(this.work, 'install.sh')
    fs.writeFileSync(script, installScript({ pid: process.pid, bundle: this.bundle, staged: this.staged.app, log: path.join(this.work, 'update.log'), relaunch, name: NAME }), { mode: 0o755 })
    spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref()
    this.log(`installing ${this.staged.version} over ${this.bundle}${relaunch ? ', then reopening' : ''}`)
  }
  install({ busy = false } = {}) {
    if (busy) throw new Error('Wait for the current chat or mailbox task to finish before restarting.')
    if (this.state.phase !== 'ready' || !this.staged) throw new Error('Download the update before restarting.')
    if (this.testFeed && !this.selftest) throw new Error('A test copy never installs.')
    this.set({ phase: 'installing', message: 'Restarting to install your update…' })
    this.swap(true)
    this.staged = null
    app.quit()
    return this.status()
  }
}
