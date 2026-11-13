import { app, BrowserWindow, ipcMain } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APPS } from '../../../src/service/iv-workspace.js'
import { findHarnesses } from '../../../src/service/harness.js'
import { appStatus, openApp, readWorkspace } from './workspace.js'
import { createChat } from './chat.js'

const directory = dirname(fileURLToPath(import.meta.url))
let window
let chat
app.setName('Hivemind')
if (process.env.HIVEMIND_DATA_DIR) app.setPath('userData', process.env.HIVEMIND_DATA_DIR)

function focusWindow() {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.focus()
}

function start() {
  const programs = join(app.getPath('appData'), '..', 'Local', 'Programs')
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
      return status
    })
    const engines = Object.entries(findHarnesses()).map(([id, path]) => ({ id, available: Boolean(path) }))
    return {
      apps, engines, problem,
      brands: brands.map(({ id, name }) => ({ id, name })),
      handoffs: handoffs.map(item => ({
        id: item.id, source: item.source, target: item.target, brandId: item.brandId,
        brandName: item.brandSnapshot?.name, title: item.brief.title, goal: item.brief.goal,
        status: item.status, createdAt: item.createdAt, channel: item.brief.channel,
      })),
    }
  })
  handle('open-app', (id, handoffId) => openApp({ id, handoffId, programs }))
  const conversation = () => chat ||= createChat({ directory: join(app.getPath('userData'), 'chat'), workspace, emit: publish })
  handle('messages', (brandId, engine) => conversation().status(brandId, engine))
  handle('send', (request) => conversation().send(request))
  handle('stop', () => chat?.stop())

  window = new BrowserWindow({
    title: 'Hivemind', width: 1360, height: 900, minWidth: 740, minHeight: 620,
    backgroundColor: '#121011', show: false, autoHideMenuBar: true,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#131012', symbolColor: '#f3eae1', height: 44 },
    webPreferences: { preload: join(directory, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(join(directory, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', focusWindow)
  app.whenReady().then(start)
  app.on('before-quit', () => chat?.stop())
  app.on('window-all-closed', () => app.quit())
}
