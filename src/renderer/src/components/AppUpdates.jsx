import { useEffect, useState } from 'react'
import { call, on } from '../api'

export function useAppUpdates() {
  const [state, setState] = useState(null)
  useEffect(() => {
    let active = true, changed = false
    const off = on('updates:changed', value => { changed = true; if (active) setState(value) })
    call('updatesStatus').then(value => { if (active && !changed) setState(value) }, () => {})
    return () => { active = false; off() }
  }, [])
  return [state, setState]
}

export default function AppUpdates({ notify }) {
  const [state, setState] = useAppUpdates()
  const [working, setWorking] = useState(false)
  if (!state) return <p className="small dim">Loading app version…</p>
  const busy = working || ['checking', 'downloading', 'installing'].includes(state.phase)
  async function action(method, args) {
    setWorking(true)
    try { setState(await call(method, args)) } catch (error) { notify(error.message) }
    finally { setWorking(false) }
  }
  return <div className="app-updates">
    <div className="update-version"><span className="eyebrow">IV Outreach</span><strong>Version {state.version}</strong><span className="small dim">Private test releases</span></div>
    <p role="status">{state.message}</p>
    {state.phase === 'downloading' && <div><progress aria-label="Update download" value={state.progress} max="100"/><span className="mono"> {state.progress}%</span></div>}
    <div className="update-actions">
      <button className="btn" disabled={busy || ['ready', 'unsupported'].includes(state.phase)} onClick={() => action('updatesCheck')}>{state.phase === 'checking' ? 'Checking…' : 'Check for updates'}</button>
      {state.phase === 'available' && <button className="btn primary" disabled={busy} onClick={() => action('updatesDownload')}>Download {state.availableVersion}</button>}
      {state.phase === 'ready' && <button className="btn primary" disabled={busy} onClick={() => action('updatesInstall')}>Restart and install</button>}
    </div>
    <label className="update-auto"><input type="checkbox" checked={state.automaticChecks} disabled={working} onChange={e => action('updatesPreferences', { automaticChecks: e.target.checked })}/><span>Check for new versions automatically</span></label>
    <p className="small dim">You choose when to download and restart. Your businesses, campaigns and chat history stay on this PC.</p>
    {state.checkedAt && <p className="small dim">Last checked: {new Date(state.checkedAt).toLocaleString()}</p>}
  </div>
}
