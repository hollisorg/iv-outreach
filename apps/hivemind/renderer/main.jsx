import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import logo from '../../../src/renderer/src/assets/hivemind-logo.png'
import './styles.css'

const api = window.hivemind
const appNames = { outreach: 'Outreach', studio: 'Studio', signal: 'Signal' }
const appDetails = {
  outreach: { action: 'Research leads', mark: '⌖' },
  studio: { action: 'Create media', mark: '◫' },
  signal: { action: 'Draft posts', mark: '≋' },
}
const engines = { claude: 'Claude Code', codex: 'Codex' }
const empty = { apps: [], engines: [], brands: [], handoffs: [] }

for (const href of [
  new URL('../../../src/renderer/src/assets/licenses/Barlow-Condensed-OFL.txt', import.meta.url).href,
  new URL('../../../src/renderer/src/assets/licenses/DM-Sans-OFL.txt', import.meta.url).href,
  new URL('../../../src/renderer/src/assets/licenses/JetBrains-Mono-OFL.txt', import.meta.url).href,
]) {
  const notice = document.createElement('link')
  notice.rel = 'license'
  notice.href = href
  document.head.appendChild(notice)
}

function AppNode({ app, launch, opening, compact = false }) {
  const detail = appDetails[app.id]
  return (
    <button className={`app-node node-${app.id}${compact ? ' compact' : ''}`} type="button"
      aria-label={`Open ${app.name}`} disabled={!app.installed || opening}
      title={app.installed ? app.name : `${app.name} is unavailable in the standard install folder.`}
      onClick={() => launch(app.id)}>
      <span className="app-symbol" aria-hidden="true">{detail.mark}</span>
      <span className="app-label"><strong>{appNames[app.id]}</strong><small>{app.installed ? detail.action : 'Unavailable'}</small></span>
      <span className="app-arrow" aria-hidden="true">↗</span>
    </button>
  )
}

function AppWheel({ apps, launch, opening, onChat }) {
  return (
    <div className="wheel" aria-label="IV apps">
      {apps.map(app => <AppNode key={app.id} app={app} launch={launch} opening={opening} />)}
      <div className="wheel-lines" aria-hidden="true"><i /><i /><i /></div>
      <button className="agent-eye" type="button" onClick={onChat} aria-label="Open Hivemind chat">
        <span className="eye-image"><img src={logo} alt="" draggable="false" /></span>
        <span className="eye-label">Ask Hivemind <span aria-hidden="true">↗</span></span>
      </button>
    </div>
  )
}

function Handoffs({ items, apps, launch, opening, brandId }) {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => setExpanded(false), [brandId])
  return (
    <aside className="handoffs" aria-label="Handoffs">
      <h2>Handoffs</h2>
      {items.length === 0 && <p className="empty-note">Handoffs from Outreach, Studio, and Signal will appear here.</p>}
      <ol>
        {(expanded ? items : items.slice(0, 5)).map(item => {
          const target = apps.find(app => app.id === item.target)
          const status = item.status === 'draft-ready' ? 'Draft ready' : 'Ready to open'
          return (
            <li key={item.id}>
              <div className="handoff-route"><span>{appNames[item.source] || 'IV'} → {appNames[item.target]}</span><span>{status}</span></div>
              <h3>{item.title}</h3>
              {!brandId && item.brandName && <p className="handoff-brand">{item.brandName}</p>}
              <button type="button" className="handoff-open" disabled={!target?.connected || opening}
                onClick={() => launch(item.target, item.id)}>
                {target?.connected ? `Open in ${appNames[item.target]}` : target?.installed ? `Connect ${appNames[item.target]} first` : `${appNames[item.target]} unavailable`}
                {target?.connected && <span aria-hidden="true"> ↗</span>}
              </button>
            </li>
          )
        })}
      </ol>
      {items.length > 5 && <button type="button" className="quiet" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show recent handoffs' : `Show all ${items.length}`}</button>}
    </aside>
  )
}

function Chat({ brandId, available, apps, launch, opening, goHome }) {
  const [engine, setEngine] = useState(available.find(item => item.available)?.id || 'claude')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const end = useRef(null)
  const composer = useRef(null)
  const revision = useRef(0)
  const ready = available.some(item => item.id === engine && item.available)

  useEffect(() => {
    let live = true
    setLoading(true)
    setMessages([])
    setProblem('')
    const sync = data => {
      setMessages(data.messages)
      setBusy(data.busy)
      setProblem(data.problem || '')
      setLoading(false)
    }
    const unsubscribe = api.onChat(data => {
      if (data.brandId === brandId && data.engine === engine) {
        revision.current++
        sync(data)
      }
    })
    const at = revision.current
    api.messages(brandId, engine).then(data => {
      if (live && revision.current === at) sync(data)
    }).catch(error => {
      if (live) { setProblem(error.message); setLoading(false) }
    })
    return () => { live = false; unsubscribe() }
  }, [brandId, engine])

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, busy])
  useEffect(() => { if (!loading && ready && !busy) composer.current?.focus() }, [loading, ready, busy])

  async function send(event) {
    event.preventDefault()
    if (!draft.trim() || busy || loading || !ready) return
    setBusy(true)
    setProblem('')
    const at = revision.current
    try {
      const state = await api.send({ brandId, engine, message: draft })
      if (revision.current === at) { setMessages(state.messages); setBusy(state.busy) }
      setDraft('')
    } catch (error) {
      setProblem(error.message)
      setBusy(false)
    }
  }

  return (
    <section className="chat" aria-label="Hivemind chat">
      <div className="chat-bar">
        <button type="button" className="quiet" onClick={goHome}>‹ App wheel</button>
        <label className="agent-select"><span>Agent</span><select value={engine} disabled={busy} onChange={event => setEngine(event.target.value)}>
          {Object.entries(engines).map(([id, name]) => <option key={id} value={id}>{name}{available.some(item => item.id === id && item.available) ? '' : ' · unavailable'}</option>)}
        </select></label>
      </div>
      <div className="chat-apps" aria-label="Open an IV app">{apps.map(app => <AppNode key={app.id} app={app} launch={launch} opening={opening} compact />)}</div>
      <div className="conversation" role="log" aria-label="Conversation">
        {!loading && !messages.length && <div className="chat-welcome">
          <span className="eye-image"><img src={logo} alt="" /></span>
          <h2>What are you working on?</h2>
          <p>Plan work across the IV apps or draft copy using your selected business.</p>
          <div className="examples">
            {['Summarize my recent handoffs', 'Draft a LinkedIn post', 'Plan a campaign'].map(prompt => <button type="button" key={prompt} disabled={!ready || busy} onClick={() => { setDraft(prompt); composer.current?.focus() }}>{prompt}</button>)}
          </div>
        </div>}
        {messages.map((message, index) => <article className={`message ${message.role}`} key={index}><strong>{message.role === 'user' ? 'You' : 'Hivemind'}</strong><p>{message.text}</p></article>)}
        {busy && <p className="chat-status" role="status">{engines[engine]} is working…</p>}
        <div ref={end} />
      </div>
      {!ready && !loading && <p className="chat-status">Install and sign in to {engines[engine]} to chat here.</p>}
      {problem && <p role="alert" className="error">{problem}</p>}
      <form className="composer" onSubmit={send}>
        <textarea ref={composer} aria-label="Message Hivemind" rows="2" maxLength="8000" placeholder="Message Hivemind…" value={draft} disabled={!ready || busy || loading} onChange={event => setDraft(event.target.value)} />
        {busy ? <button type="button" className="primary" onClick={() => api.stop()}>Stop</button> : <button className="primary" disabled={!ready || loading || !draft.trim()}>Send</button>}
      </form>
    </section>
  )
}

function App() {
  const [data, setData] = useState(empty)
  const [brandId, setBrandId] = useState(null)
  const [view, setView] = useState('home')
  const [opening, setOpening] = useState(false)
  const [problem, setProblem] = useState('')
  const [refreshing, setRefreshing] = useState(true)
  const heading = useRef(null)
  const eye = useRef(false)

  async function refresh() {
    setRefreshing(true)
    try {
      const snapshot = await api.snapshot()
      setData(snapshot)
      setBrandId(previous => previous !== null && (!previous || snapshot.brands.some(brand => brand.id === previous)) ? previous : snapshot.brands[0]?.id || '')
      setProblem(snapshot.problem || '')
    } catch (error) { setProblem(error.message) }
    finally { setRefreshing(false) }
  }

  useEffect(() => { refresh() }, [])
  useEffect(() => {
    if (!eye.current) return
    if (view === 'home') document.querySelector('.agent-eye')?.focus()
    else heading.current?.focus()
  }, [view])

  async function launch(id, handoffId) {
    setOpening(true)
    setProblem('')
    try { await api.openApp(id, handoffId) }
    catch (error) { setProblem(error.message) }
    finally { setOpening(false) }
  }

  const items = brandId ? data.handoffs.filter(item => item.brandId === brandId) : data.handoffs
  return (
    <div className="app">
      <header className="titlebar">
        <img src={logo} alt="" />
        <span>Hivemind</span>
      </header>
      <main className="workspace">
        <div className="workspace-head">
          <h1 ref={heading} tabIndex={-1}>{view === 'home' ? 'Hivemind' : 'Hivemind Chat'}</h1>
          <div className="workspace-controls">
            <label className="business"><span>Business</span><select value={brandId || ''} onChange={event => setBrandId(event.target.value)}>
              <option value="">All businesses</option>
              {data.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select></label>
            <button type="button" className="quiet refresh" disabled={refreshing} onClick={refresh}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </div>
        {problem && <p className="error" role="alert">{problem}</p>}
        <div className="workspace-grid">
          {view === 'home' ? <AppWheel apps={data.apps} launch={launch} opening={opening} onChat={() => { eye.current = true; setView('chat') }} /> :
            <Chat brandId={brandId || ''} available={data.engines} apps={data.apps} launch={launch} opening={opening} goHome={() => setView('home')} />}
          <Handoffs items={items} apps={data.apps} launch={launch} opening={opening} brandId={brandId} />
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
