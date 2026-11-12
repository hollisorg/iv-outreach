// Main-process-owned runtime. Agents never receive keys, paths, arbitrary commands, or mailbox access.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { killTree } from './agentrun.js'
import { getCampaign, importOpenOutreachRecords } from '../core/index.js'

export const OPENOUTREACH_VERSION = '0.1.93'
const UV_SHA256 = '03fa174894b9d0cbe08762d40d1c2c64d10e875bd56f1a1e334ee1e00d60cdbe'
const ACTIVE = new Set(['running', 'cancelling'])
const MAX_OUTPUT = 12 * 1024 * 1024

// Do not pass unrelated account/API variables, Python injection hooks, or sender credentials to the engine.
export function runtimeEnv(config, campaign, cacheDir, base = process.env) {
  const env = {}
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'NUMBER_OF_PROCESSORS']) {
    if (base[key]) env[key] = base[key]
  }
  return { ...env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONNOUSERSITE: '1',
    OPENOUTFIND_PRODUCT_DOCS: campaign.offer || '', OPENOUTFIND_CAMPAIGN_TARGET: JSON.stringify(campaign.icp || {}),
    OPENOUTFIND_AI_MODEL: config.model || '', OPENOUTFIND_LLM_API_KEY: config.llmKey || '',
    OPENOUTFIND_BETTERCONTACT_API_KEY: config.betterContactKey || '', OPENOUTFIND_LLM_API_BASE: '',
    OPENOUTFIND_OPERATOR_COUNTRY: config.country || '', OPENOUTFIND_OPERATOR_EMAIL: '',
    OPENOUTFIND_NEWSLETTER: 'false', IV_OUTREACH_CACHE_DIR: cacheDir,
    HF_HOME: join(cacheDir, 'huggingface'), HF_HUB_DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1',
    OTEL_SDK_DISABLED: 'true', OUTSEND_HOME: join(cacheDir, 'unused-sender'),
  }
}

export function validateSearch(args) {
  if (!args || typeof args.campaign_id !== 'string') throw new Error('Choose a campaign first.')
  if (!Number.isInteger(args.count) || args.count < 1 || args.count > 25) throw new Error('Find between 1 and 25 leads per search.')
  if (args.emails !== undefined && typeof args.emails !== 'boolean') throw new Error('emails must be true or false.')
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(args.request_id || '')) throw new Error('Use a unique request_id (8–80 letters, digits, hyphens or underscores). Reuse it only to retry the same request.')
  return { campaign_id: args.campaign_id, count: args.count, emails: args.emails === true, request_id: args.request_id }
}

export class OpenOutreachRuntime {
  constructor({ dataDir, vendorDir, getDb, getConfig, onChange = () => {}, spawnProcess = spawn, timeoutMs = 15 * 60 * 1000, pythonPath }) {
    this.root = join(dataDir, 'openoutreach')
    this.vendor = vendorDir
    this.python = pythonPath || join(this.root, 'runtime', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    this.runner = join(vendorDir, 'openoutreach', 'runner.py')
    this.getDb = getDb
    this.getConfig = getConfig
    this.onChange = onChange
    this.spawn = spawnProcess
    this.timeoutMs = timeoutMs
    this.jobs = new Map()
    this.installState = { status: 'idle', message: null }
    this.installChild = null
    mkdirSync(this.root, { recursive: true })
    // Recover terminal history and mark interrupted jobs; never silently restart paid work.
    try {
      for (const saved of JSON.parse(readFileSync(join(this.root, 'jobs.json'), 'utf8'))) {
        if (ACTIVE.has(saved.status)) { saved.status = 'interrupted'; saved.message = 'The app closed during this search. Imported leads are retained. Start a new search explicitly to continue.' }
        this.jobs.set(saved.id, { ...saved, child: null, timer: null })
      }
    } catch { /* first use */ }
  }

  view(job) { const { child, timer, ...visible } = job; return visible }
  persist() {
    const history = [...this.jobs.values()].map((j) => this.view(j))
    writeFileSync(join(this.root, 'jobs.json'), JSON.stringify(history), { mode: 0o600 })
    this.onChange()
  }
  installed() {
    if (!existsSync(this.python)) return false
    try { return JSON.parse(readFileSync(join(this.root, 'installed.json'), 'utf8')).version === OPENOUTREACH_VERSION } catch { return false }
  }
  status() {
    const config = this.getConfig()
    const missing = []
    if (!this.installed()) missing.push('Install the OpenOutreach engine')
    if (!config.betterContactKey) missing.push('BetterContact API key')
    if (!config.llmKey) missing.push('Model-provider API key')
    if (!config.model) missing.push('Model')
    return { installed: this.installed(), version: OPENOUTREACH_VERSION, ready: !missing.length, missing,
      model: config.model || '', country: config.country || '', hasBetterContactKey: !!config.betterContactKey,
      hasLlmKey: !!config.llmKey, install: { ...this.installState },
      jobs: [...this.jobs.values()].slice(-10).reverse().map((j) => this.view(j)),
      privacy: 'Upstream registration, newsletter and contact sharing are disabled. Searches use your BetterContact and model provider.' }
  }
  async runCommand(exe, args, env, timeoutMs = 20 * 60 * 1000) {
    return new Promise((resolve, reject) => {
      let child
      try { child = this.spawn(exe, args, { env, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }) }
      catch { reject(new Error('Could not start the runtime installer.')); return }
      this.installChild = child
      let output = ''
      const timer = setTimeout(() => { killTree(child); reject(new Error('Runtime setup timed out. You can retry installation.')) }, timeoutMs)
      child.stdout?.on('data', (b) => { output = (output + b.toString('utf8')).slice(-20000) })
      child.stderr?.on('data', () => {}) // No raw package/provider diagnostics in the chat or renderer.
      child.on('error', () => { clearTimeout(timer); reject(new Error('Could not start Python or the runtime installer.')) })
      child.on('close', (code) => {
        clearTimeout(timer)
        this.installChild = null
        if (code === 0) resolve(output)
        else reject(new Error('Runtime setup failed. Check your internet connection and available disk space, then retry.'))
      })
    })
  }
  install() {
    if (this.installState.status === 'running') return this.status()
    if ([...this.jobs.values()].some((j) => ACTIVE.has(j.status) || (j.child && j.child.exitCode === null))) throw new Error('Wait for the current search before reinstalling the engine.')
    this.installState = { status: 'running', message: 'Preparing Python and OpenOutreach. The first install downloads several hundred MB.' }
    this.onChange()
    this.installPromise = (async () => {
      try {
        const uv = join(this.vendor, 'uv', process.platform === 'win32' ? 'uv.exe' : 'uv')
        if (process.platform !== 'win32') throw new Error('The managed engine installer currently supports Windows.')
        if (createHash('sha256').update(readFileSync(uv)).digest('hex') !== UV_SHA256) throw new Error('The runtime installer failed its integrity check. Reinstall IV Outreach.')
        rmSync(join(this.root, 'installed.json'), { force: true })
        const env = { ...runtimeEnv({}, { icp: {} }, join(this.root, 'cache')), UV_CACHE_DIR: join(this.root, 'uv-cache'), UV_PYTHON_INSTALL_DIR: join(this.root, 'python'), UV_NO_PROGRESS: '1' }
        if (!existsSync(this.python)) await this.runCommand(uv, ['venv', '--python', '3.12', '--python-preference', 'only-managed', join(this.root, 'runtime')], env)
        this.installState.message = 'Installing the pinned OpenOutreach engine and dependencies…'
        this.onChange()
        await this.runCommand(uv, ['pip', 'install', '--reinstall', '--python', this.python, '--requirements', join(this.vendor, 'openoutreach', 'requirements.lock')], env)
        this.installState.message = 'Checking the engine and privacy protections…'
        this.onChange()
        const probe = JSON.parse(await this.runCommand(this.python, [this.runner, 'probe'], env, 120000))
        if (probe.version !== OPENOUTREACH_VERSION || probe.privacy !== 'upstream-disabled' || probe.sending !== false) throw new Error('The engine did not pass its compatibility and privacy check.')
        writeFileSync(join(this.root, 'installed.json'), JSON.stringify({ version: OPENOUTREACH_VERSION, installed_at: new Date().toISOString() }))
        this.installState = { status: 'done', message: 'OpenOutreach is installed. Add your provider keys, then find leads from chat.' }
      } catch (e) {
        this.installState = { status: 'failed', message: e.message }
      }
      this.onChange()
    })()
    return this.status()
  }
  start(input) {
    const args = validateSearch(input)
    const previous = [...this.jobs.values()].find((j) => j.request_id === args.request_id)
    if (previous) {
      if (previous.campaign_id !== args.campaign_id || previous.count !== args.count || previous.emails !== args.emails) throw new Error('That request_id belongs to a different search.')
      return this.view(previous)
    }
    const active = [...this.jobs.values()].find((j) => ACTIVE.has(j.status) || (j.child && j.child.exitCode === null))
    if (active) throw new Error(`A search is already running. Check job ${active.id} or cancel it first.`)
    if (this.installState.status === 'running') throw new Error('OpenOutreach is still installing.')
    const ready = this.status()
    if (!ready.ready) throw new Error(`Open Settings → OpenOutreach: ${ready.missing.join(', ')}.`)
    const campaign = getCampaign(this.getDb(), args.campaign_id)
    if (!campaign || campaign.status !== 'active') throw new Error('Choose an active campaign.')
    if (!campaign.offer?.trim() || !Object.values(campaign.icp || {}).some((v) => Array.isArray(v) ? v.length : !!v)) throw new Error('Add the campaign offer and ideal customer criteria before searching.')
    const fingerprint = createHash('sha256').update(JSON.stringify([campaign.id, campaign.offer, campaign.icp])).digest('hex').slice(0, 24)
    const dir = join(this.root, 'campaigns', fingerprint)
    mkdirSync(dir, { recursive: true })
    const job = { id: randomUUID(), ...args, campaign_name: campaign.name, status: 'running', created_at: new Date().toISOString(),
      imported: 0, duplicates: 0, updated: 0, suppressed: 0, conflicts: 0, processed: 0, message: 'Searching and qualifying leads…', child: null, timer: null }
    this.jobs.set(job.id, job)
    this.persist()
    const config = this.getConfig()
    const env = runtimeEnv(config, campaign, join(this.root, 'cache'))
    const argv = [this.runner, '--db', join(dir, 'leads.sqlite3'), 'find', String(args.count), ...(args.emails ? ['emails'] : []), '--json']
    let child
    try { child = this.spawn(this.python, argv, { env, cwd: dir, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch { job.status = 'failed'; job.message = 'The OpenOutreach engine could not start. Reinstall it in Settings.'; this.persist(); return this.view(job) }
    job.child = child
    let stdout = '', stderr = '', bytes = 0, errorType = null
    const stop = (message) => { job.status = 'failed'; job.message = message; killTree(child); this.persist() }
    const record = (line) => {
      if (!line.trim() || !ACTIVE.has(job.status)) return
      const row = JSON.parse(line)
      if (typeof row !== 'object' || !row || row.lead_id == null) throw new Error('invalid record')
      const r = importOpenOutreachRecords(this.getDb(), campaign.id, [row], fingerprint)
      job.imported += r.added.length
      for (const k of ['duplicates', 'updated', 'suppressed', 'conflicts']) job[k] += r[k] || 0
      job.processed++
      job.message = `${job.imported} new leads added. Still searching…`
      this.persist()
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (text) => {
      bytes += Buffer.byteLength(text)
      if (bytes > MAX_OUTPUT) { stop('The engine exceeded the output limit. Already imported leads are retained.'); return }
      stdout += text
      const lines = stdout.split(/\r?\n/); stdout = lines.pop()
      try { for (const line of lines) record(line) } catch { stop('The engine returned an unreadable lead. Already imported leads are retained.') }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (text) => {
      stderr = (stderr + text).slice(-30000)
      // Only extract a bounded error code. Never forward raw traces, URLs, tokens or provider messages.
      for (const line of stderr.split(/\r?\n/)) {
        try { const type = JSON.parse(line)?.error?.type; if (/^[a-z_]{1,60}$/.test(type || '')) errorType = type } catch { /* partial or non-JSON diagnostics */ }
      }
    })
    job.timer = setTimeout(() => { job.status = 'timed_out'; job.message = 'The 15-minute search limit was reached. Imported leads are retained; no automatic retry will spend more credits.'; killTree(child); this.persist() }, this.timeoutMs)
    child.on('error', () => { job.status = 'failed'; job.message = 'Could not start the OpenOutreach engine. Reinstall it in Settings.' })
    child.on('close', (code) => {
      clearTimeout(job.timer); job.timer = null; job.child = null
      try { if (stdout.trim()) record(stdout) } catch { job.status = 'failed'; job.message = 'The engine ended with an incomplete lead record. Earlier leads are retained.' }
      if (job.status === 'cancelling') { job.status = 'cancelled'; job.message = 'Search cancelled. Imported leads are retained. Provider work already submitted may still be billed.' }
      else if (job.status === 'running') {
        job.status = code === 0 ? 'completed' : job.processed ? 'partial' : 'failed'
        job.message = code === 0 ? `Search finished. ${job.imported} new leads added.` : `Search stopped${errorType ? ` (${errorType})` : ''}. ${job.imported} new leads retained. Check your provider keys, quota and campaign criteria before trying again.`
      }
      job.finished_at = new Date().toISOString()
      this.persist()
    })
    return this.view(job)
  }
  job(id) {
    const job = this.jobs.get(id)
    if (!job) throw new Error('Unknown OpenOutreach job. Check OpenOutreach status for recent searches.')
    return this.view(job)
  }
  cancel(id) {
    const job = this.jobs.get(id)
    if (!job) throw new Error('Unknown OpenOutreach job.')
    if (job.status === 'running') { job.status = 'cancelling'; job.message = 'Stopping search…'; killTree(job.child); this.persist() }
    return this.view(job)
  }
  close() {
    if (this.installChild) killTree(this.installChild)
    for (const job of this.jobs.values()) if (ACTIVE.has(job.status)) { clearTimeout(job.timer); killTree(job.child); job.status = 'interrupted'; job.message = 'The app closed. Imported leads are retained.' }
    this.persist()
  }
}

// Local-only capability shared with the app's MCP process. No credential operations are exposed.
export async function startOpenOutreachBridge(runtime, dataDir) {
  const token = randomBytes(32).toString('hex')
  const file = join(dataDir, 'openoutreach-bridge.json')
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    const auth = Buffer.from(req.headers.authorization || '')
    const expected = Buffer.from(`Bearer ${token}`)
    if (req.method !== 'POST' || req.headers.origin || auth.length !== expected.length || !timingSafeEqual(auth, expected)) { res.writeHead(403); res.end('{"error":"Not authorized"}'); return }
    let body = '', size = 0
    try {
      for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new Error('Request too large.'); body += chunk.toString('utf8') }
      const args = JSON.parse(body || '{}')
      let value
      if (req.url === '/status') value = runtime.status()
      else if (req.url === '/find') value = runtime.start(args)
      else if (req.url === '/job') {
        const wait = Math.max(0, Math.min(15, Number(args.wait_seconds) || 0))
        if (wait && ACTIVE.has(runtime.job(args.job_id).status)) await new Promise((r) => setTimeout(r, wait * 1000))
        value = runtime.job(args.job_id)
      } else if (req.url === '/cancel') value = runtime.cancel(args.job_id)
      else throw new Error('Unknown operation.')
      res.end(JSON.stringify(value))
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })) }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  writeFileSync(file, JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, token }), { mode: 0o600 })
  return { close() { server.close(); server.closeAllConnections(); try { rmSync(file) } catch {} } }
}

export async function callOpenOutreachBridge(dataDir, operation, args = {}) {
  if (!['status', 'find', 'job', 'cancel'].includes(operation)) throw new Error('Unknown operation.')
  let bridge
  try { bridge = JSON.parse(readFileSync(join(dataDir, 'openoutreach-bridge.json'), 'utf8')) } catch { throw new Error('Open the IV Outreach desktop app to use OpenOutreach.') }
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(bridge.url) || !/^[a-f0-9]{64}$/.test(bridge.token)) throw new Error('Restart IV Outreach to reconnect its search engine.')
  let response
  try { response = await fetch(`${bridge.url}/${operation}`, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(20000) }) }
  catch { throw new Error('IV Outreach is not responding. Open or restart the desktop app; do not restart a search blindly.') }
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'OpenOutreach request failed.')
  return data
}
