import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APPS } from '../../../src/service/iv-workspace.js'
import { findHarnesses } from '../../../src/service/harness.js'
import { TOOLS, appStatus, openApp, openTool, readWorkspace, toolStatus } from './workspace.js'
import { createChat } from './chat.js'
import { chatActions } from './actions.js'
import { CATALOG, installApp, installInfo, latestRelease } from './install.js'
import { modelList } from './models.js'
import { openMemory } from '../../../src/service/iv-memory.js'
import { memoryActions } from './memory-tools.js'
import { PASTE_PROMPT, gatherMaterial, importSources, parseSuggestions, runDistill } from './memory-import.js'
import { appTools } from './app-tools.js'

const directory = dirname(fileURLToPath(import.meta.url))
let window
let chat
let router
// The program is called IV Hivemind; its data stays in %APPDATA%\Hivemind so saved chats and settings carry over.
app.setName('IV Hivemind')
app.setPath('userData', process.env.HIVEMIND_DATA_DIR || join(app.getPath('appData'), 'Hivemind'))

// Hivemind is a borderless, transparent overlay over the work area of one screen. Empty space lets the mouse
// through to whatever is behind it; the renderer reports when the pointer is over a visible control.
const overlayFile = () => join(app.getPath('userData'), 'overlay.json')
function overlayPrefs() {
  try { return JSON.parse(readFileSync(overlayFile(), 'utf8')) } catch { return {} }
}
function saveOverlayPrefs(next) {
  try { writeFileSync(overlayFile(), JSON.stringify({ ...overlayPrefs(), ...next })) } catch {}
}
const cursorArea = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea

function coverArea(area = cursorArea()) {
  if (!window || window.isDestroyed()) return
  const now = window.getBounds()
  if (now.x !== area.x || now.y !== area.y || now.width !== area.width || now.height !== area.height) window.setBounds(area)
  shapeWindow()
}

// While the pointer is over a control the overlay takes clicks, and to Windows it is then a plain opaque rectangle
// over the whole screen. Chrome and Edge treat a window fully covered by one as hidden and stop drawing its video
// (YouTube froze whenever Hivemind was dragged). A window region with one corner pixel left out is not a simple
// rectangle, so browsers' occlusion checks skip the overlay. Nothing visible changes.
function shapeWindow() {
  if (!window || window.isDestroyed()) return
  const { width, height } = window.getContentBounds()
  if (width < 2 || height < 2) return
  window.setShape([{ x: 0, y: 0, width: width - 1, height }, { x: width - 1, y: 1, width: 1, height: height - 1 }])
}

function focusWindow() {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  coverArea()
  window.show()
  window.focus()
}

function start() {
  // HIVEMIND_PROGRAMS_DIR points a test copy at another folder (for example an empty one, to see apps as not installed).
  const programs = process.env.HIVEMIND_PROGRAMS_DIR || join(app.getPath('appData'), '..', 'Local', 'Programs')
  let installing = null
  const workspace = () => readWorkspace()
  const publish = (state) => {
    if (window && !window.isDestroyed()) window.webContents.send('hivemind:chat', state)
  }
  const handle = (method, operation) => ipcMain.handle(`hivemind:${method}`, (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Hivemind can only accept requests from its own window.')
    }
    return operation(...args)
  })

  handle('snapshot', () => {
    let state = { brands: [], handoffs: [], registrations: {} }
    let problem = ''
    try { state = workspace() }
    catch { problem = 'Hivemind could not read the shared workspace. You can still open the IV apps.' }
    const { brands, handoffs, registrations } = state
    const apps = Object.keys(APPS).map(id => {
      const { executable, ...status } = appStatus(id, programs, registrations)
      return { ...status, ...installInfo(id) }
    })
    const engines = Object.entries(findHarnesses()).map(([id, path]) => ({ id, available: Boolean(path) }))
    const tools = Object.keys(TOOLS).map(id => {
      const { executable, ...status } = toolStatus(id, programs)
      return { ...status, ...installInfo(id) }
    })
    return {
      apps, tools, engines, problem,
      brands: brands.map(({ id, name }) => ({ id, name })),
      handoffs: handoffs.map(item => ({
        id: item.id, source: item.source, target: item.target, brandId: item.brandId,
        brandName: item.brandSnapshot?.name, title: item.brief.title, goal: item.brief.goal,
        status: item.status, createdAt: item.createdAt, channel: item.brief.channel,
      })),
    }
  })
  handle('open-app', (id, handoffId) => Object.hasOwn(TOOLS, id) && handoffId === undefined ? openTool({ id, programs }) : openApp({ id, handoffId, programs }))

  // Install a missing IV app the person picked from the menu, then open it once so it connects to the workspace.
  // HIVEMIND_INSTALL_DRYRUN=1 downloads and checks the installer without running it.
  const nameOf = id => APPS[id] || TOOLS[id]
  const sendInstall = state => { if (window && !window.isDestroyed()) window.webContents.send('hivemind:install', state) }
  handle('install', async (id) => {
    if (!nameOf(id) || !CATALOG[id]) throw new Error('Unknown IV app.')
    if (installing) throw new Error(`Wait for ${nameOf(installing)} to finish installing.`)
    installing = id
    const name = nameOf(id)
    try {
      const dryRun = process.env.HIVEMIND_INSTALL_DRYRUN === '1'
      const result = await installApp({
        id, name, programs, dryRun,
        tempDir: join(app.getPath('temp'), 'iv-hivemind-installers'),
        progress: state => sendInstall({ id, ...state }),
      })
      if (result.installed) {
        sendInstall({ id, stage: `Opening ${name}`, percent: 100 })
        try { await (Object.hasOwn(TOOLS, id) ? openTool({ id, programs }) : openApp({ id, programs })) } catch {}
      }
      sendInstall({ id, done: true, ...result })
      return result
    } catch (error) {
      sendInstall({ id, failed: error.message })
      throw error
    } finally {
      installing = null
    }
  })
  handle('release', (id) => latestRelease(id))
  handle('open-page', (id) => {
    const page = CATALOG[id]?.page
    if (!page || !/^https:\/\/github\.com\/hollisorg\//.test(page)) throw new Error('This app has no page yet.')
    return shell.openExternal(page)
  })
  const actions = chatActions({ readWorkspace, openApp, appStatus, programs })
  const mcpScript = app.isPackaged ? join(process.resourcesPath, 'app.asar', 'out', 'main', 'mcp.js') : join(directory, 'mcp.js')
  // IV memory, shared with the other IV apps (HIVEMIND_MEMORY_DIR points a test copy at its own).
  let memoryStore = null
  const memory = () => memoryStore ||= openMemory(process.env.HIVEMIND_MEMORY_DIR || undefined)
  const memoryTools = memoryActions({ memory })
  const memoryPrompt = options => memory().prompt(options)
  // The IV apps' own tools, run in chat mode. While the agent works in an app, its tile shows it, the app comes up on
  // screen the first time something changes there, and Hivemind stays above it so the chat and its Allow cards stay
  // in view; the keep-on-top choice is restored when the reply ends.
  const sendWorking = state => { if (window && !window.isDestroyed()) window.webContents.send('hivemind:working', state) }
  router = appTools({
    programs,
    askRoot: join(app.getPath('userData'), 'app-asks'),
    links: () => { try { return workspace().links || {} } catch { return {} } },
    hooks: {
      ask: turn => turn.refresh?.(),
      label: (turn, text) => turn.relabel?.(text),
      using: (turn, id, { look }) => {
        sendWorking({ app: id })
        if (look) return
        turn.shown ||= new Set()
        if (turn.shown.has(id)) return
        turn.shown.add(id)
        // A test copy kept off screen (HIVEMIND_HIDDEN=1) doesn't bring the real apps up.
        if (process.env.HIVEMIND_HIDDEN === '1') return
        if (window && !window.isDestroyed() && !window.isAlwaysOnTop()) { window.setAlwaysOnTop(true, 'floating'); turn.raised = true }
        openApp({ id, programs }).catch(() => {})
      },
    },
  })
  const turnEnded = turn => {
    sendWorking({ app: null })
    if (turn.raised && window && !window.isDestroyed() && !overlayPrefs().pinned) window.setAlwaysOnTop(false)
  }
  const conversation = () => chat ||= createChat({ directory: join(app.getPath('userData'), 'chat'), workspace, emit: publish, actions, memoryTools, memoryPrompt, mcpScript, apps: router, onTurnEnd: turnEnded })
  const brandExists = id => id === 'you' || workspace().brands.some(brand => brand.id === id)
  handle('memory-list', (brandId) => ({ you: memory().list('you'), business: brandId ? memory().list(brandId) : [] }))
  handle('memory-add', ({ scope, text, source }) => {
    if (!brandExists(scope)) throw new Error('Choose who this memory is about.')
    return memory().add({ scope, text, source: source === 'import' ? 'Imported' : 'Added in Hivemind', by: 'hivemind' })
  })
  handle('memory-update', (id, changes) => {
    if (changes?.scope !== undefined && !brandExists(changes.scope)) throw new Error('Choose who this memory is about.')
    return memory().update(id, changes || {})
  })
  handle('memory-remove', (id) => memory().remove(id))
  handle('import-sources', () => {
    const found = importSources()
    return { claude: { count: found.claude.count, bytes: found.claude.bytes }, codex: { count: found.codex.count, bytes: found.codex.bytes }, pastePrompt: PASTE_PROMPT }
  })
  handle('import-run', async ({ source, text, engine }) => {
    if (!['claude', 'codex', 'paste'].includes(source)) throw new Error('Choose where to import from.')
    if (!['claude', 'codex'].includes(engine)) throw new Error('Choose Claude Code or Codex to read it.')
    const brands = workspace().brands.map(({ id, name }) => ({ id, name }))
    const material = gatherMaterial(source, { text })
    const reply = await runDistill({ engine, material, brands, directory: join(app.getPath('userData'), 'chat') })
    const known = new Set(memory().list().map(item => `${item.scope}|${item.text.toLowerCase()}`))
    return { suggestions: parseSuggestions(reply, brands).filter(item => !known.has(`${item.scope}|${item.text.toLowerCase()}`)) }
  })
  handle('threads', (brandId) => conversation().list(brandId || ''))
  handle('thread', (id) => conversation().view(id))
  handle('new-thread', (request) => conversation().create(request || {}))
  handle('update-thread', (id, changes) => conversation().update(id, changes || {}))
  handle('delete-thread', (id) => conversation().remove(id))
  handle('models', () => modelList())
  handle('send', (request) => conversation().send(request))
  handle('choose', (request) => conversation().choose(request))
  handle('answer', (request) => conversation().answer(request || {}))
  handle('stop', () => chat?.stop())

  handle('overlay', () => ({ pinned: Boolean(window.isAlwaysOnTop()) }))
  handle('window', (action) => {
    if (action === 'minimize') window.minimize()
    else if (action === 'quit') app.quit()
    else if (action === 'pin' || action === 'unpin') {
      window.setAlwaysOnTop(action === 'pin', 'floating')
      saveOverlayPrefs({ pinned: action === 'pin' })
    } else throw new Error('Unknown window action.')
    return { pinned: Boolean(window.isAlwaysOnTop()) }
  })
  ipcMain.on('hivemind:solid', (event, solid) => {
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return
    if (solid) window.setIgnoreMouseEvents(false)
    else window.setIgnoreMouseEvents(true, { forward: true })
  })

  const area = cursorArea()
  window = new BrowserWindow({
    title: 'IV Hivemind', ...area,
    transparent: true, frame: false, backgroundColor: '#00000000', hasShadow: false, roundedCorners: false,
    resizable: false, maximizable: false, fullscreenable: false, thickFrame: false,
    show: false, autoHideMenuBar: true,
    webPreferences: { preload: join(directory, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })
  window.setIgnoreMouseEvents(true, { forward: true })
  shapeWindow()
  window.on('resize', shapeWindow)
  if (overlayPrefs().pinned) window.setAlwaysOnTop(true, 'floating')
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  // HIVEMIND_HIDDEN=1 keeps a test copy off the screen (checks capture the page instead).
  window.once('ready-to-show', () => { if (process.env.HIVEMIND_HIDDEN !== '1') window.show() })
  // Keep covering the screen if the taskbar, resolution or monitor layout changes.
  const refit = () => {
    const bounds = window.getBounds()
    coverArea(screen.getDisplayMatching(bounds).workArea)
  }
  screen.on('display-metrics-changed', refit)
  screen.on('display-removed', refit)
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(join(directory, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', focusWindow)
  app.whenReady().then(start)
  app.on('before-quit', () => { chat?.stop(); chat?.close(); router?.close() })
  app.on('window-all-closed', () => app.quit())
}
