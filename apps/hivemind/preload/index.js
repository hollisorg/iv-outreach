import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('hivemind', {
  snapshot: () => ipcRenderer.invoke('hivemind:snapshot'),
  openApp: (id, handoffId) => ipcRenderer.invoke('hivemind:open-app', id, handoffId),
  threads: (brandId) => ipcRenderer.invoke('hivemind:threads', brandId),
  thread: (id) => ipcRenderer.invoke('hivemind:thread', id),
  newThread: (request) => ipcRenderer.invoke('hivemind:new-thread', request),
  updateThread: (id, changes) => ipcRenderer.invoke('hivemind:update-thread', id, changes),
  deleteThread: (id) => ipcRenderer.invoke('hivemind:delete-thread', id),
  models: () => ipcRenderer.invoke('hivemind:models'),
  memoryList: (brandId) => ipcRenderer.invoke('hivemind:memory-list', brandId),
  memoryAdd: (request) => ipcRenderer.invoke('hivemind:memory-add', request),
  memoryUpdate: (id, changes) => ipcRenderer.invoke('hivemind:memory-update', id, changes),
  memoryRemove: (id) => ipcRenderer.invoke('hivemind:memory-remove', id),
  importSources: () => ipcRenderer.invoke('hivemind:import-sources'),
  importRun: (request) => ipcRenderer.invoke('hivemind:import-run', request),
  send: (request) => ipcRenderer.invoke('hivemind:send', request),
  choose: (request) => ipcRenderer.invoke('hivemind:choose', request),
  answer: (request) => ipcRenderer.invoke('hivemind:answer', request),
  onWorking: (listener) => {
    const receive = (_event, state) => listener(state)
    ipcRenderer.on('hivemind:working', receive)
    return () => ipcRenderer.removeListener('hivemind:working', receive)
  },
  stop: () => ipcRenderer.invoke('hivemind:stop'),
  overlay: () => ipcRenderer.invoke('hivemind:overlay'),
  install: (id) => ipcRenderer.invoke('hivemind:install', id),
  release: (id) => ipcRenderer.invoke('hivemind:release', id),
  openPage: (id) => ipcRenderer.invoke('hivemind:open-page', id),
  onInstall: (listener) => {
    const receive = (_event, state) => listener(state)
    ipcRenderer.on('hivemind:install', receive)
    return () => ipcRenderer.removeListener('hivemind:install', receive)
  },
  windowAction: (action) => ipcRenderer.invoke('hivemind:window', action),
  setSolid: (solid) => ipcRenderer.send('hivemind:solid', Boolean(solid)),
  onChat: (listener) => {
    const receive = (_event, state) => listener(state)
    ipcRenderer.on('hivemind:chat', receive)
    return () => ipcRenderer.removeListener('hivemind:chat', receive)
  },
})
