// IV Hivemind's route into the other IV apps: it runs each installed app's own tool server (the same one the app's
// own chat uses, from the app's install folder, in chat mode) and lets Hivemind's agent find and call those tools
// through three small Hivemind tools, so the agent never has to load hundreds of tool definitions at once.
//
// The apps keep their own rules. In chat mode each app's tool server already asks before anything that approves,
// spends, deletes, sends or changes settings: it writes an ask file and waits for the answer file. Hivemind shows each
// ask as an Allow card and writes the person's answer back; nothing it asks about runs without it. Credentials stay
// in the apps: Hivemind passes no keys.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const APP_TOOLS = {
  outreach: { name: 'IV Outreach', env: { FITSCOUT_AGENT_RUN: 'chat' }, askEnv: 'FITSCOUT_AGENT_ASK', business: ['business_id'] },
  signal: { name: 'IV Signal', env: { IV_SIGNAL_AGENT_RUN: 'chat', IV_SIGNAL_ACTOR: 'hivemind' }, askEnv: 'IV_SIGNAL_AGENT_ASK', business: ['brand_id'] },
  studio: { name: 'IV Studio', env: { IV_STUDIO_AGENT_RUN: 'chat', IV_STUDIO_AGENT_NAME: 'IV Hivemind' }, askEnv: 'IV_STUDIO_AGENT_ASK', business: [] },
}
// Tools that only work inside the app's own window (pointing at its controls); Hivemind brings the app up instead.
const WINDOW_ONLY = /(^|_)(show_in_app|inspect_app|list_places)$/
// Studio's tools carry no read-only marks, so its look-only tools are known by name.
const LOOKS = /^(list_|get_|check_|price_|search_|identify_|recommended_|rank_|review_|view_|read_|scan_|export_shot_list$|effects_list$|comfy_balance$|replace_history$|\w+_status$)/
const IDLE_MS = 3 * 60 * 1000
const CALL_MS = 20 * 60 * 1000
const MAX_RESULT = 30000

export const appScript = (programs, id) => join(programs, APP_TOOLS[id].name, 'resources', 'app.asar', 'out', 'main', 'mcp.js')
export const appExecutable = (programs, id) => join(programs, APP_TOOLS[id].name, `${APP_TOOLS[id].name}.exe`)
const isFile = path => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false

// A minimal MCP client over stdio (newline-delimited JSON-RPC).
export function connectServer({ command, args, env, cwd }) {
  const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  const waiting = new Map()
  let next = 1
  let buffer = ''
  let closed = null
  const fail = error => {
    closed ||= error
    for (const { reject, timer } of waiting.values()) { clearTimeout(timer); reject(error) }
    waiting.clear()
  }
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    buffer += chunk
    for (let end = buffer.indexOf('\n'); end !== -1; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end).trim()
      buffer = buffer.slice(end + 1)
      if (!line) continue
      let message
      try { message = JSON.parse(line) } catch { continue }
      const entry = message.id !== undefined && waiting.get(message.id)
      if (!entry) continue
      waiting.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) entry.reject(new Error(message.error.message || 'The app could not do that.'))
      else entry.resolve(message.result)
    }
  })
  child.stderr.on('data', () => {})
  child.stdin.on('error', () => {})
  child.once('error', () => fail(new Error('The app\'s tools could not start.')))
  child.once('exit', () => fail(new Error('The app\'s tools stopped.')))
  const send = message => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  return {
    child,
    get closed() { return closed },
    request(method, params = {}, timeout = 60000) {
      if (closed) return Promise.reject(closed)
      const id = next++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiting.delete(id); reject(new Error('The app took too long to answer.')) }, timeout)
        waiting.set(id, { resolve, reject, timer })
        send({ id, method, params })
      })
    },
    notify(method, params = {}) { if (!closed) send({ method, params }) },
    close() { try { child.kill() } catch {} },
  }
}

const shortText = (value, size) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > size ? `${text.slice(0, size - 1)}…` : text
}
const looksOnly = (id, tool) => tool.annotations?.readOnlyHint === true || (id === 'studio' && LOOKS.test(tool.name))

function resultText(result) {
  const parts = (result?.content || []).map(item => item.type === 'text' ? item.text : `[${item.type || 'item'} not shown in Hivemind]`)
  const text = parts.join('\n').trim() || (result?.structuredContent ? JSON.stringify(result.structuredContent) : '')
  return text.length > MAX_RESULT ? `${text.slice(0, MAX_RESULT)}\n[cut at ${MAX_RESULT} characters]` : text
}

// One router for the life of Hivemind. hooks: ask(turn, ask) shows an Allow card; using(turn, app, info) says the
// agent is working in an app (Hivemind brings the app up and shows it on the tile); label(turn, text) names the step.
export function appTools({ programs, askRoot, links = () => ({}), hooks = {}, baseEnv = process.env, launch = app => ({ command: app.executable, args: [app.script] }) }) {
  const servers = new Map()
  const pending = new Map()
  let poller = null

  function status(id) {
    if (!Object.hasOwn(APP_TOOLS, id)) throw new Error('Choose outreach, signal or studio.')
    const executable = appExecutable(programs, id)
    const script = appScript(programs, id)
    // The tool server lives inside the app's app.asar, which only Electron can look into, so check the archive.
    const archive = join(programs, APP_TOOLS[id].name, 'resources', 'app.asar')
    return { id, name: APP_TOOLS[id].name, executable, script, installed: isFile(executable), ready: isFile(executable) && (isFile(archive) || existsSync(script)) }
  }

  async function server(id) {
    const found = servers.get(id)
    if (found && !found.connection.closed) { found.used = Date.now(); return found }
    const app = status(id)
    if (!app.installed) throw new Error(`${app.name} isn't installed. Get it from the Hivemind menu.`)
    if (!app.ready) throw new Error(`${app.name} is installed but its tools aren't there. Update ${app.name}.`)
    const askDir = join(askRoot, id)
    rmSync(askDir, { recursive: true, force: true })
    mkdirSync(askDir, { recursive: true })
    const env = { ...baseEnv, ELECTRON_RUN_AS_NODE: '1', ...APP_TOOLS[id].env, [APP_TOOLS[id].askEnv]: askDir }
    for (const key of ['HIVEMIND_BRIDGE_URL', 'HIVEMIND_BRIDGE_TOKEN', 'ELECTRON_RENDERER_URL']) delete env[key]
    const connection = connectServer({ ...launch(app), env, cwd: join(programs, app.name) })
    try {
      const hello = await connection.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'IV Hivemind', version: '0.6.0' } }, 90000)
      connection.notify('notifications/initialized')
      const tools = []
      let cursor
      do {
        const page = await connection.request('tools/list', cursor ? { cursor } : {}, 60000)
        tools.push(...(page.tools || []))
        cursor = page.nextCursor
      } while (cursor && tools.length < 2000)
      const entry = { id, name: app.name, connection, askDir, guide: shortText(hello?.instructions, 2500), tools: tools.filter(tool => !WINDOW_ONLY.test(tool.name)), used: Date.now(), seen: new Set() }
      servers.set(id, entry)
      return entry
    } catch (error) {
      connection.close()
      throw new Error(`${app.name}'s tools didn't start: ${error.message}`)
    }
  }

  // Asks the app's tool server writes while a call runs, and the clean-up of files meant for the app's own window.
  function watch() {
    if (poller) return
    poller = setInterval(() => {
      for (const entry of servers.values()) {
        let names = []
        try { names = readdirSync(entry.askDir) } catch { continue }
        for (const file of names) {
          if (/\.(show|undo)\.json$/.test(file)) { rmSync(join(entry.askDir, file), { force: true }); continue }
          const match = /^([\w-]+)\.ask\.json$/.exec(file)
          if (!match || entry.seen.has(match[1])) continue
          let ask
          try { ask = JSON.parse(readFileSync(join(entry.askDir, file), 'utf8')) } catch { continue }
          entry.seen.add(match[1])
          const call = [...pending.values()].find(item => item.app === entry.id)
          if (!call) { answerFile(entry, match[1], false); continue }
          const card = { key: `${entry.id}:${match[1]}`, app: entry.id, appName: entry.name, tool: ask.tool, why: shortText(ask.why, 600), state: 'waiting' }
          call.turn.asks ||= []
          call.turn.asks.push(card)
          hooks.ask?.(call.turn, card)
        }
      }
      const now = Date.now()
      for (const [id, entry] of servers) {
        if (![...pending.values()].some(item => item.app === id) && now - entry.used > IDLE_MS) { entry.connection.close(); servers.delete(id) }
      }
      if (!servers.size && !pending.size) { clearInterval(poller); poller = null }
    }, 300)
  }

  function answerFile(entry, id, allow) {
    const file = join(entry.askDir, `${id}.answer.json`)
    writeFileSync(`${file}.tmp`, JSON.stringify({ allow: Boolean(allow), by: 'IV Hivemind', at: new Date().toISOString() }))
    renameSync(`${file}.tmp`, file)
  }

  // The person's answer to an Allow card. Only a card that is still waiting can be answered, once.
  function answer(turn, key, allow) {
    const card = (turn?.asks || []).find(item => item.key === key)
    if (!card || card.state !== 'waiting') throw new Error('That request is no longer waiting.')
    const [app, id] = key.split(':')
    const entry = servers.get(app)
    if (!entry || !existsSync(join(entry.askDir, `${id}.ask.json`))) { card.state = 'expired'; throw new Error('That request is no longer waiting.') }
    answerFile(entry, id, allow)
    card.state = allow ? 'allowed' : 'declined'
    return card
  }

  // The selected business's own ID in each app, from the shared workspace's links.
  function businessIn(turn, id) {
    if (!turn.brandId || !APP_TOOLS[id].business.length) return null
    const linked = Object.entries(links()[id] || {})
    return { mine: linked.filter(([, brandId]) => brandId === turn.brandId).map(([local]) => local), others: new Set(linked.filter(([, brandId]) => brandId !== turn.brandId).map(([local]) => local)) }
  }

  async function list(turn, { app, search }) {
    const entry = await server(app)
    const words = String(search || '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 1)
    const scored = entry.tools.map(tool => {
      const hay = `${tool.name} ${tool.title || ''} ${tool.description || ''}`.toLowerCase()
      return { tool, score: words.reduce((sum, word) => sum + (tool.name.includes(word) ? 3 : hay.includes(word) ? 1 : 0), 0) }
    }).filter(item => !words.length || item.score > 0).sort((a, b) => b.score - a.score).slice(0, words.length ? 25 : 80)
    const business = businessIn(turn, app)
    return {
      app: entry.name, count: entry.tools.length, guide: entry.guide,
      ...(business ? { selectedBusinessIdHere: business.mine[0] || null } : {}),
      tools: scored.map(({ tool }) => ({ name: tool.name, does: shortText(tool.description || tool.title, words.length ? 240 : 120), kind: looksOnly(app, tool) ? 'look' : 'change' })),
      next: 'Call iv_app_tool for a tool\'s inputs before calling it with iv_app_call.',
    }
  }

  async function describe(turn, { app, tool }) {
    const entry = await server(app)
    const found = entry.tools.find(item => item.name === tool)
    if (!found) throw new Error(`${entry.name} has no tool called ${tool}. Use iv_app_tools to search.`)
    return { app: entry.name, name: found.name, description: found.description || found.title || '', inputSchema: found.inputSchema || { type: 'object' }, kind: looksOnly(app, found) ? 'look' : 'change' }
  }

  async function call(turn, { app, tool, arguments: input = {} }) {
    const entry = await server(app)
    const found = entry.tools.find(item => item.name === tool)
    if (!found) throw new Error(`${entry.name} has no tool called ${tool}. Use iv_app_tools to search.`)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Send the tool\'s inputs as an object.')
    // Keep the work inside the business selected in Hivemind wherever the app links its own business to it.
    const business = businessIn(turn, app)
    if (business) {
      for (const key of APP_TOOLS[app].business) {
        if (input[key] === undefined) continue
        if (business.others.has(String(input[key])) || (business.mine.length && !business.mine.includes(String(input[key])))) {
          throw new Error(`That ${key} belongs to another business in ${entry.name}. This chat works with the business selected in Hivemind${business.mine.length ? ` (${key} ${business.mine[0]} here)` : ''}.`)
        }
      }
    }
    const look = looksOnly(app, found)
    hooks.label?.(turn, `${entry.name.replace('IV ', '')}: ${shortText(found.title || found.name.replace(/^(fitscout|signal)_/, '').replace(/_/g, ' '), 60)}`)
    hooks.using?.(turn, app, { look, tool })
    const key = Symbol(tool)
    pending.set(key, { app, turn })
    watch()
    try {
      const result = await entry.connection.request('tools/call', { name: tool, arguments: input }, CALL_MS)
      const text = resultText(result)
      if (result?.isError) throw new Error(text || `${entry.name} could not do that.`)
      turn.appWork ||= []
      turn.appWork.push({ app, appName: entry.name, tool, look })
      return { app: entry.name, tool, result: text }
    } finally {
      pending.delete(key)
      entry.used = Date.now()
      for (const card of turn.asks || []) {
        if (card.app === app && card.state === 'waiting') { card.state = 'expired'; hooks.ask?.(turn, card) }
      }
    }
  }

  // A reply that ends or is stopped answers its open cards with Don't allow, so no app waits on a card nobody sees.
  function settle(turn) {
    for (const card of turn?.asks || []) {
      if (card.state !== 'waiting') continue
      const [app, id] = card.key.split(':')
      const entry = servers.get(app)
      try { if (entry && existsSync(join(entry.askDir, `${id}.ask.json`))) answerFile(entry, id, false) } catch {}
      card.state = 'expired'
    }
  }

  return {
    status, list, describe, call, answer, settle,
    close() {
      for (const entry of servers.values()) entry.connection.close()
      servers.clear()
      clearInterval(poller)
      poller = null
    },
  }
}
