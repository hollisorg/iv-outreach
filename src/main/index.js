import { app, BrowserWindow, ipcMain, shell, clipboard, dialog } from 'electron'
import { join, dirname } from 'node:path'
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import * as fs from '../core/index.js'
import { findHarnesses, codexWindow } from '../service/harness.js'
import { findHermes } from '../service/hermesacp.js'
import { AGENT_INFO, runInstall, openSignIn, signedIn } from '../service/agentinstall.js'
import { AGENT_NAMES } from '../service/agentrun.js'
import {
  startChatTurn, newChat, applyChatEvent, applyUsage, saveChat, loadChat, listChats, pruneChats,
  attachmentOf, withAttachments, MAX_ATTACH, ATTACH_EXTENSIONS,
} from '../service/agentchat.js'
import { skillMarkdown, pasteMessage } from '../service/agent.js'

const here = dirname(fileURLToPath(import.meta.url))
let db
let win

function getDb() {
  if (!db) db = fs.openDb()
  return db
}

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

// How agents launch our MCP server: the app's own Electron binary runs it in Node mode, so nobody needs Node.js.
function mcpCommand() {
  const script = app.isPackaged
    ? join(process.resourcesPath, 'app.asar', 'out', 'main', 'mcp.js')
    : join(here, 'mcp.js')
  const env = { ELECTRON_RUN_AS_NODE: '1' }
  if (process.env.FITSCOUT_DATA_DIR) env.FITSCOUT_DATA_DIR = process.env.FITSCOUT_DATA_DIR
  return { command: process.execPath, args: [script], env }
}

const claudeConfigPath = () => join(process.env.APPDATA || app.getPath('appData'), 'Claude', 'claude_desktop_config.json')

const isLinkedinProfile = (url) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && /(^|\.)linkedin\.com$/i.test(u.hostname) && /^\/(in|company)\//i.test(u.pathname)
  } catch {
    return false
  }
}

// --- Settings kept beside the database (chat engine, models, names) ---
const settingsFile = () => join(fs.defaultDataDir(), 'app-settings.json')
function readSettings() {
  try {
    return JSON.parse(readFileSync(settingsFile(), 'utf8'))
  } catch {
    return {}
  }
}
function writeSettings(patch) {
  const next = { ...readSettings(), ...patch }
  mkdirSync(dirname(settingsFile()), { recursive: true })
  writeFileSync(settingsFile(), JSON.stringify(next, null, 1))
  return next
}

// --- The person's own agents: find, install, sign in (ported from IV Studio) ---
const agentsFound = () => ({ ...findHarnesses(), hermes: findHermes() })
let agentInstall = null // { engine, status, lines, error, run }
const installView = () => (agentInstall ? { engine: agentInstall.engine, status: agentInstall.status, lines: agentInstall.lines.slice(-6), error: agentInstall.error } : null)
async function agentSetup() {
  const found = agentsFound()
  const one = async (engine) => ({ ...AGENT_INFO[engine], installed: !!found[engine], signedIn: found[engine] ? await signedIn(engine, found[engine]) : false })
  const [claude, codex] = await Promise.all([one('claude'), one('codex')])
  return { platform: process.platform, claude, codex, hermes: { name: 'Hermes', installed: !!found.hermes }, install: installView() }
}
const pushSetup = () => agentSetup().then((s) => send('agents:setupChanged', s), () => {})

// --- The chat ---
const chatsRoot = () => join(fs.defaultDataDir(), 'chats')
let chat = null
let chatTurn = null
const chatView = () => (chat ? { ...chat, busy: !!chatTurn } : null)
const pushChat = () => send('chat:changed', chatView())
const chatId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
function chatPreferred(found) {
  const s = readSettings()
  if (['claude', 'codex', 'hermes'].includes(s.chatEngine) && found[s.chatEngine]) return s.chatEngine
  return found.claude ? 'claude' : found.codex ? 'codex' : found.hermes ? 'hermes' : null
}
function chatEngine(engine) {
  const found = agentsFound()
  const e = engine || chatPreferred(found)
  if (!e || !AGENT_NAMES[e]) throw new Error('Install Claude Code, Codex or Hermes first: the chat uses your own.')
  if (!found[e]) throw new Error(`${AGENT_NAMES[e]} isn't installed on this PC.`)
  return e
}

const METHODS = {
  // data
  overview: () => fs.overview(getDb()),
  listCampaigns: () => fs.listCampaigns(getDb()),
  updateCampaign: ({ id, ...patch }) => fs.updateCampaign(getDb(), id, patch),
  listLeads: (args) => fs.listLeads(getDb(), args),
  getLead: ({ id }) => fs.getLead(getDb(), id),
  updateLead: ({ id, ...patch }) => fs.updateLead(getDb(), id, patch),
  listMessages: (args) => fs.listMessages(getDb(), args),
  editMessage: ({ id, subject, body }) => fs.editMessage(getDb(), id, { subject, body }),
  approveMessages: ({ ids }) => fs.approveMessages(getDb(), ids),
  cancelMessages: ({ ids }) => fs.cancelMessages(getDb(), ids),
  linkedinQueue: () => fs.linkedinQueue(getDb()),
  copyAndOpenLinkedin: ({ url, note }) => {
    if (!isLinkedinProfile(url)) throw new Error('Only LinkedIn profile links can be opened from here')
    clipboard.writeText(note || '')
    shell.openExternal(url)
    return { copied: true }
  },
  markLinkedinSent: ({ id }) => {
    const m = getDb().prepare('select channel from messages where id = ?').get(id)
    if (m?.channel !== 'linkedin') throw new Error('Only LinkedIn messages are marked sent by hand')
    return fs.markSent(getDb(), id)
  },
  logReply: (args) => fs.logReply(getDb(), args),
  getSender: () => {
    const sender = fs.getSender(getDb())
    return { sender, missing: fs.senderGaps(sender) }
  },
  saveSender: (patch) => {
    const sender = fs.saveSender(getDb(), patch)
    return { sender, missing: fs.senderGaps(sender) }
  },
  listSuppression: () => fs.listSuppression(getDb()),
  suppress: (args) => fs.suppress(getDb(), args),
  importCsv: async ({ campaign_id }) => {
    const pick = await dialog.showOpenDialog(win, { title: 'Import leads', filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] })
    if (pick.canceled || !pick.filePaths[0]) return null
    const r = fs.importCsv(getDb(), campaign_id, pick.filePaths[0])
    return { rows: r.rows, added: r.added.length, duplicates: r.duplicates, suppressed: r.suppressed, invalid: r.invalid }
  },
  exportCsv: async ({ campaign_id }) => {
    const c = fs.getCampaign(getDb(), campaign_id)
    if (!c) throw new Error('No campaign')
    const safe = c.name.replace(/[^\w -]+/g, '').trim() || 'campaign'
    const dir = join(app.getPath('documents'), 'Fitscout')
    mkdirSync(dir, { recursive: true })
    const pick = await dialog.showSaveDialog(win, { title: 'Export leads', defaultPath: join(dir, `${safe}.csv`), filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (pick.canceled || !pick.filePath) return null
    writeFileSync(pick.filePath, fs.exportCsv(getDb(), campaign_id), 'utf8')
    return { written: pick.filePath }
  },
  copyText: ({ text }) => {
    clipboard.writeText(String(text || ''))
    return { copied: true }
  },
  appSettings: () => readSettings(),
  saveAppSettings: (patch) => {
    const clean = {}
    if (['claude', 'codex', 'hermes', ''].includes(patch.chatEngine)) clean.chatEngine = patch.chatEngine
    for (const k of ['claudeModel', 'codexModel', 'agentName', 'userName']) if (typeof patch[k] === 'string') clean[k] = patch[k].trim().slice(0, 80)
    return writeSettings(clean)
  },

  // agents: install, sign in, connect (IV Studio's Settings -> Agents)
  agentSetup: () => agentSetup(),
  agentInstall: ({ engine }) => {
    if (!AGENT_INFO[engine]) throw new Error('Fitscout can install Claude Code or Codex.')
    if (agentInstall?.status === 'running') throw new Error(`${AGENT_INFO[agentInstall.engine].name} is still installing.`)
    const state = { engine, status: 'running', lines: [], error: null, run: null }
    agentInstall = state
    state.run = runInstall(engine, {
      onLine: (line) => {
        state.lines.push(line)
        if (state.lines.length > 50) state.lines.shift()
        if (agentInstall === state) send('agents:setupChanged', { install: installView() })
      },
    })
    pushSetup()
    state.run.promise.then((r) => {
      const there = !!agentsFound()[engine]
      state.status = r.ok && there ? 'done' : 'failed'
      state.error = r.ok && !there ? `The installer finished, but Fitscout can't find ${AGENT_INFO[engine].name} yet. Restart Fitscout, or install it from ${AGENT_INFO[engine].site}` : r.error
      if (agentInstall === state) pushSetup()
    })
    return true
  },
  agentStopInstall: () => {
    if (agentInstall?.status === 'running') agentInstall.run.stop()
    return true
  },
  agentSignIn: ({ engine }) => {
    if (!AGENT_INFO[engine]) throw new Error('Fitscout can sign in to Claude Code or Codex.')
    const exe = agentsFound()[engine]
    if (!exe) throw new Error(`${AGENT_INFO[engine].name} isn't installed yet.`)
    openSignIn(engine, exe)
    return true
  },
  openLink: ({ url }) => {
    const allowed = Object.values(AGENT_INFO).map((a) => a.site).concat('https://hermes-agent.nousresearch.com')
    if (!allowed.includes(url)) throw new Error('That link isn\'t one Fitscout opens.')
    shell.openExternal(url)
    return true
  },
  agentsInfo: () => {
    const skillFile = join(homedir(), '.claude', 'skills', 'fitscout', 'SKILL.md')
    const text = skillMarkdown(mcpCommand())
    const installed = existsSync(skillFile)
    return {
      paste: pasteMessage(mcpCommand()),
      skillFile,
      skillInstalled: installed,
      skillCurrent: installed && readFileSync(skillFile, 'utf8') === text,
      desktopSnippet: JSON.stringify({ fitscout: mcpCommand() }, null, 2),
      desktopConfigPath: claudeConfigPath(),
    }
  },
  installSkill: () => {
    const skillFile = join(homedir(), '.claude', 'skills', 'fitscout', 'SKILL.md')
    mkdirSync(dirname(skillFile), { recursive: true })
    writeFileSync(skillFile, skillMarkdown(mcpCommand()))
    return skillFile
  },
  openClaudeConfigFolder: () => {
    const folder = dirname(claudeConfigPath())
    mkdirSync(folder, { recursive: true })
    shell.openPath(folder)
    return { opened: folder }
  },

  // chat
  chatStatus: () => {
    const found = agentsFound()
    const s = readSettings()
    return {
      installed: { claude: !!found.claude, codex: !!found.codex, hermes: !!found.hermes },
      preferred: chatPreferred(found),
      chat: chatView(),
      chats: listChats(chatsRoot()).slice(0, 20),
      agentName: (s.agentName || '').trim(),
      userName: (s.userName || '').trim(),
    }
  },
  chatNew: ({ engine }) => {
    if (chatTurn) throw new Error(`${chat.name} is still answering. Stop it first.`)
    chat = newChat({ id: chatId(), engine: chatEngine(engine) })
    pushChat()
    return chatView()
  },
  chatOpen: ({ id }) => {
    if (chatTurn) throw new Error(`${chat.name} is still answering. Stop it first.`)
    const c = loadChat(chatsRoot(), String(id || ''))
    if (!c) throw new Error('That chat is gone.')
    chat = c
    pushChat()
    return chatView()
  },
  chatPickFiles: async () => {
    const pick = await dialog.showOpenDialog(win, { title: 'Add to the chat', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Leads or notes', extensions: ATTACH_EXTENSIONS }] })
    return pick.canceled ? [] : pick.filePaths.slice(0, MAX_ATTACH)
  },
  chatSend: ({ text, context, engine, files = [] }) => {
    const attached = (Array.isArray(files) ? files : []).filter((p) => typeof p === 'string' && existsSync(p)).map(attachmentOf).filter((a) => a.kind).slice(0, MAX_ATTACH)
    const message = String(text || '').trim().slice(0, 8000) || (attached.length ? 'Here are some files.' : '')
    if (!message) throw new Error('Type a message first.')
    if (chatTurn) throw new Error(`${chat.name} is still answering. Stop it first, or wait.`)
    if (!chat) chat = newChat({ id: chatId(), engine: chatEngine(engine) })
    const exe = agentsFound()[chat.engine]
    if (!exe) throw new Error(`${chat.name} isn't installed on this PC.`)
    const current = chat
    const s = readSettings()
    if (current.engine === 'codex') {
      const cw = codexWindow(s.codexModel || '')
      if (cw) applyUsage(current, { window: cw.window, model: cw.model })
    }
    current.turnCalls = 0
    current.entries.push({ kind: 'you', text: message, at: new Date().toISOString(), ...(attached.length ? { files: attached.map((a) => ({ name: a.name, kind: a.kind, path: a.path })) } : {}) })
    if (!current.title) current.title = message.slice(0, 80)
    saveChat(chatsRoot(), current)
    const turn = startChatTurn({
      engine: current.engine,
      exe,
      dir: join(chatsRoot(), current.id),
      session: current.session,
      message: withAttachments(message, attached),
      context: context && typeof context === 'object' ? context : null,
      mcp: mcpCommand(),
      model: current.engine === 'claude' ? s.claudeModel || '' : current.engine === 'codex' ? s.codexModel || '' : '',
      names: { agentName: s.agentName, userName: s.userName },
      onEvent: (e) => {
        applyChatEvent(current, e)
        if (chat === current) pushChat()
        // the agent changed data: the page refreshes
        if (e.type === 'step') send('data:changed', { tool: e.tool })
      },
    })
    chatTurn = turn
    pushChat()
    turn.promise.then((r) => {
      if (r.session) current.session = r.session
      const last = current.entries[current.entries.length - 1]
      if (!r.ok && r.error && !(last?.kind === 'problem' && last.text === r.error)) current.entries.push({ kind: 'problem', text: r.error })
      current.updatedAt = new Date().toISOString()
      if (chatTurn === turn) chatTurn = null
      try {
        saveChat(chatsRoot(), current)
        pruneChats(chatsRoot())
      } catch {
        /* a full drive shouldn't take the chat down */
      }
      pushChat()
      send('data:changed', { tool: 'turn-end' })
    })
    return chatView()
  },
  chatAnswer: ({ id, allow }) => !!chatTurn?.answer(String(id || ''), !!allow),
  chatStop: () => {
    chatTurn?.stop()
    return true
  },
}

ipcMain.handle('fitscout:call', async (_event, method, args) => {
  const fn = METHODS[method]
  if (!fn) throw new Error(`Unknown method ${method}`)
  return fn(args || {})
})

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1040,
    minHeight: 660,
    title: 'Fitscout',
    backgroundColor: '#f3eee3',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  // Nothing in the renderer may navigate the app window or open arbitrary pages.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(here, '../renderer/index.html'))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })
  app.whenReady().then(createWindow)
  app.on('window-all-closed', () => {
    chatTurn?.stop()
    app.quit()
  })
}
