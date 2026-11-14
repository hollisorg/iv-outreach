import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('hivemind', {
  snapshot: () => ipcRenderer.invoke('hivemind:snapshot'),
  openApp: (id, handoffId) => ipcRenderer.invoke('hivemind:open-app', id, handoffId),
  messages: (brandId, engine) => ipcRenderer.invoke('hivemind:messages', brandId, engine),
  send: (request) => ipcRenderer.invoke('hivemind:send', request),
  choose: (request) => ipcRenderer.invoke('hivemind:choose', request),
  stop: () => ipcRenderer.invoke('hivemind:stop'),
  overlay: () => ipcRenderer.invoke('hivemind:overlay'),
  windowAction: (action) => ipcRenderer.invoke('hivemind:window', action),
  setSolid: (solid) => ipcRenderer.send('hivemind:solid', Boolean(solid)),
  onChat: (listener) => {
    const receive = (_event, state) => listener(state)
    ipcRenderer.on('hivemind:chat', receive)
    return () => ipcRenderer.removeListener('hivemind:chat', receive)
  },
})
