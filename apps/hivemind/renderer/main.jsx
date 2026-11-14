import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import logo from '../../../src/renderer/src/assets/hivemind-logo.png'
import chatIcon from './app-icons/chat.png'
import outreachIcon from './app-icons/outreach.png'
import studioIcon from './app-icons/studio.png'
import signalIcon from './app-icons/signal.png'
import voiceIcon from './app-icons/voice.png'
import keysIcon from './app-icons/keys.png'
import './styles.css'

// Hivemind floats on the desktop: a transparent, borderless overlay. Everything the person can see or click carries
// data-solid; the main process lets the mouse through everywhere else.
const api = window.hivemind
const appNames = { outreach: 'Outreach', studio: 'Studio', signal: 'Signal', chat: 'Chat', voice: 'Voice', keys: 'Keys' }
// The menu fans out above the eye: the three workspace apps in the middle, the other IV apps on the ends.
const appDetails = {
  chat: { icon: chatIcon, angle: -170, line: 'All your messages', detail: 'WhatsApp, Messenger, Instagram, LinkedIn and Telegram in one window, with AI drafting replies you send.' },
  outreach: { icon: outreachIcon, angle: -138, line: 'Find new customers', detail: 'Finds businesses that fit your offer, researches them and drafts outreach you approve before anything goes out.' },
  studio: { icon: studioIcon, angle: -106, line: 'Make AI video', detail: 'Make shots, short films, pictures, voices and music with AI on your own PC.' },
  signal: { icon: signalIcon, angle: -74, line: 'Plan social posts', detail: 'Write a post once with a version for each network, approve it and schedule it.' },
  voice: { icon: voiceIcon, angle: -42, line: 'Talk to type', detail: 'Dictate into any app, with Whisper running on your own graphics card.' },
  keys: { icon: keysIcon, angle: -10, line: 'Keyboard & family', detail: 'An on-screen keyboard and a family control center for this PC.' },
}
const menuOrder = ['chat', 'outreach', 'studio', 'signal', 'voice', 'keys']
const engines = { claude: 'Claude Code', codex: 'Codex' }
const empty = { apps: [], tools: [], engines: [], brands: [], handoffs: [] }
const dockKey = 'hivemind.dock'
const orbitRadius = 240
const panelGap = 320

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

const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high))

function useViewport() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return size
}

// Tells the main process whether the pointer is over something visible, so empty space clicks through.
function useClickThrough(holding) {
  useEffect(() => {
    let solid = null
    const set = value => {
      if (value === solid) return
      solid = value
      api.setSolid(value)
    }
    const check = (x, y) => set(holding.current || Boolean(document.elementFromPoint(x, y)?.closest('[data-solid]')))
    const move = event => check(event.clientX, event.clientY)
    const leave = () => { if (!holding.current) set(false) }
    window.addEventListener('mousemove', move, { passive: true })
    window.addEventListener('pointerdown', move, { passive: true })
    document.documentElement.addEventListener('mouseleave', leave)
    set(false)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('pointerdown', move)
      document.documentElement.removeEventListener('mouseleave', leave)
    }
  }, [holding])
}

// A menu tile. Installed apps open; a missing app shows greyed out and offers to install it.
function AppOrb({ app, launch, opening, index, onMissing, progress }) {
  const detail = appDetails[app.id]
  const radians = detail.angle * Math.PI / 180
  const dx = Math.round(Math.cos(radians) * orbitRadius)
  const dy = Math.round(Math.sin(radians) * orbitRadius)
  const missing = !app.installed
  const badge = missing ? (app.installable ? 'Get' : app.id === 'outreach' ? 'Private' : 'Soon') : null
  return (
    <div className={`orb-slot slot-${app.id}${app.tool ? ' tool-slot' : ''}${missing ? ' missing' : ''}`} style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, '--i': index }}>
      <button className={`app-orb node-${app.id}`} type="button" data-solid
        aria-label={missing ? `Get ${app.name}` : `Open ${app.name}`} disabled={opening && !missing}
        title={missing ? `${app.name} isn't installed. ${detail.detail}` : `${app.name}: ${detail.detail}`}
        onClick={() => missing ? onMissing(app) : launch(app.id)}>
        <img className="app-icon" src={detail.icon} alt="" draggable="false" />
        <span className="app-label"><strong>{appNames[app.id]}</strong><small>{detail.line}</small></span>
        {badge && <span className={`app-badge${app.installable ? ' get' : ''}`}>{badge}</span>}
        {progress && <span className="app-progress" aria-hidden="true"><i style={{ width: `${progress.percent || 0}%` }} /></span>}
      </button>
    </div>
  )
}

// The prompt that appears when a missing app is picked: what it is, where it comes from, and Install.
function InstallCard({ app, release, state, onInstall, onPage, onClose }) {
  const detail = appDetails[app.id]
  const size = release?.size ? `about ${Math.round(release.size / 1048576)} MB` : 'the installer'
  const busy = state && !state.done && !state.failed
  return (
    <div className="install-card" role="dialog" aria-label={`Get ${app.name}`} data-solid>
      <img src={detail.icon} alt="" />
      <div className="install-body">
        <strong>{state?.done ? (state.installed ? `${app.name} is installed` : `${app.name} checked`) : `Get ${app.name}`}</strong>
        <p>{detail.detail}</p>
        {app.installable && !state && <p className="install-note">Downloads {size}{release?.version ? ` (version ${release.version})` : ''} from Infinite Variance on GitHub, checks it, and installs it just for you. Nothing else changes.</p>}
        {!app.installable && <p className="install-note">{app.note}</p>}
        {busy && <div className="install-progress" role="status"><span>{state.stage}{state.stage === 'Downloading' ? ` ${state.percent}%` : '…'}</span><i style={{ width: `${state.percent || 0}%` }} /></div>}
        {state?.done && <p className="install-note">{state.installed ? `Version ${state.version}. It's opening now and is ready in the menu.` : `Version ${state.version} downloaded and checked (test mode: not installed).`}</p>}
        {state?.failed && <p className="install-error" role="alert">{state.failed}</p>}
        <div className="install-actions">
          {app.installable && !busy && !state?.done && <button type="button" className="primary" onClick={onInstall}>{state?.failed ? 'Try again' : 'Install'}</button>}
          {!app.installable && app.page && <button type="button" className="primary" onClick={onPage}>Open its page</button>}
          {!busy && <button type="button" className="quiet" onClick={onClose}>{state?.done ? 'Done' : 'Not now'}</button>}
        </div>
      </div>
    </div>
  )
}

const shortDate = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// What Hivemind actually did during a reply, shown from its own record rather than the agent's wording.
function ActionCard({ action, onChoose, disabled }) {
  if (action.type === 'opened') {
    const { item } = action
    return (
      <div className="action-card opened" role="status">
        <span className="action-kind"><span className="action-dot" aria-hidden="true" />Opened in {item.appName.replace('IV ', '')}</span>
        <strong>{item.title}</strong>
        <small>{[item.business, `${item.from.replace('IV ', '')} → ${item.appName.replace('IV ', '')}`, item.channel].filter(Boolean).join(' · ')}</small>
        <small className="action-note">Returned to the existing {item.app === 'signal' ? 'draft' : 'project'}. Nothing new was created or approved.</small>
      </div>
    )
  }
  return (
    <div className="action-card choose">
      <span className="action-kind">Which one should open?</span>
      <ul>
        {action.items.map(item => (
          <li key={item.id}>
            <button type="button" disabled={disabled} onClick={() => onChoose(item.id)}>
              <span><strong>{item.title}</strong><small>{[item.appName.replace('IV ', ''), `from ${item.from.replace('IV ', '')}`, item.channel, shortDate(item.updatedAt)].filter(Boolean).join(' · ')}</small></span>
              <span aria-hidden="true">↗</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Handoffs({ items, apps, launch, opening, brandId, refresh, refreshing }) {
  return (
    <div className="handoffs" aria-label="Handoffs">
      {items.length === 0 && <p className="empty-note">Handoffs from Outreach, Studio and Signal will appear here.</p>}
      <ol>
        {items.map((item, index) => {
          const target = apps.find(app => app.id === item.target)
          const status = item.status === 'draft-ready' ? 'Draft ready' : 'Ready to open'
          return (
            <li key={item.id} style={{ '--i': index }}>
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
      <button type="button" className="quiet refresh" disabled={refreshing} onClick={refresh}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
    </div>
  )
}

function Chat({ brandId, engine, available, opening }) {
  const [messages, setMessages] = useState([])
  const [steps, setSteps] = useState([])
  const [choosing, setChoosing] = useState(false)
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
      setMessages(data.messages || [])
      setSteps(data.steps || [])
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
    event?.preventDefault()
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

  async function choose(handoffId) {
    if (busy || choosing) return
    setChoosing(true)
    setProblem('')
    try {
      const state = await api.choose({ brandId, engine, handoffId })
      setMessages(state.messages)
    } catch (error) { setProblem(error.message) }
    finally { setChoosing(false) }
  }

  return (
    <section className="chat" aria-label="Hivemind chat">
      <div className="conversation" role="log" aria-label="Conversation">
        {!loading && !messages.length && <div className="chat-welcome">
          <span className="eye-image small"><img src={logo} alt="" /></span>
          <h2>What are you working on?</h2>
          <p>Plan work across the IV apps, draft copy, or reopen a draft or project.</p>
          <div className="examples">
            {['Reopen my latest Signal draft', 'Summarize my recent handoffs', 'Draft a LinkedIn post'].map(prompt => <button type="button" key={prompt} disabled={!ready || busy} onClick={() => { setDraft(prompt); composer.current?.focus() }}>{prompt}</button>)}
          </div>
        </div>}
        {messages.map((message, index) => (
          <article className={`message ${message.role}`} key={index}>
            <strong>{message.role === 'user' ? 'You' : 'Hivemind'}</strong>
            {message.text && <p>{message.text}</p>}
            {(message.actions || []).map((action, at) => <ActionCard key={at} action={action} onChoose={choose} disabled={busy || choosing || opening} />)}
          </article>
        ))}
        {busy && <p className="chat-status working" role="status"><span className="pulse" aria-hidden="true" />{steps.length ? `${steps.at(-1)}…` : `${engines[engine]} is working…`}</p>}
        {choosing && <p className="chat-status working" role="status"><span className="pulse" aria-hidden="true" />Opening…</p>}
        <div ref={end} />
      </div>
      {!ready && !loading && <p className="chat-status">Install and sign in to {engines[engine]} to chat here.</p>}
      {problem && <p role="alert" className="error">{problem}</p>}
      <form className="composer" onSubmit={send}>
        <textarea ref={composer} aria-label="Message Hivemind" rows="2" maxLength="8000" placeholder="Message Hivemind…" value={draft}
          disabled={!ready || busy || loading} onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} />
        {busy ? <button type="button" className="primary" onClick={() => api.stop()}>Stop</button> : <button className="primary" disabled={!ready || loading || !draft.trim()}>Send</button>}
      </form>
    </section>
  )
}

function readDock() {
  try {
    const saved = JSON.parse(localStorage.getItem(dockKey))
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) return saved
  } catch {}
  return { x: 0.5, y: 0.52 }
}

function App() {
  const [data, setData] = useState(empty)
  const [brandId, setBrandId] = useState(null)
  const [panel, setPanel] = useState(null)
  const [closing, setClosing] = useState(false)
  const [engine, setEngine] = useState('claude')
  const [opening, setOpening] = useState(false)
  const [problem, setProblem] = useState('')
  const [refreshing, setRefreshing] = useState(true)
  const [pinned, setPinned] = useState(false)
  const [dock, setDock] = useState(readDock)
  const [dragging, setDragging] = useState(false)
  const [picked, setPicked] = useState(null)
  const [latest, setLatest] = useState(null)
  const [installs, setInstalls] = useState({})
  const holding = useRef(false)
  const drag = useRef(null)
  const engineChosen = useRef(false)
  const panelRef = useRef(null)
  const [panelHeight, setPanelHeight] = useState(560)
  const { width, height } = useViewport()
  useClickThrough(holding)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const snapshot = await api.snapshot()
      setData(snapshot)
      setBrandId(previous => previous !== null && (!previous || snapshot.brands.some(brand => brand.id === previous)) ? previous : snapshot.brands[0]?.id || '')
      if (!engineChosen.current) setEngine(snapshot.engines.find(item => item.available)?.id || 'claude')
      setProblem(snapshot.problem || '')
    } catch (error) { setProblem(error.message) }
    finally { setRefreshing(false) }
  }, [])

  useEffect(() => {
    refresh()
    api.overlay().then(state => setPinned(state.pinned)).catch(() => {})
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  const closePanel = useCallback(() => {
    if (!panel || closing) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setPanel(null); return }
    setClosing(true)
    setTimeout(() => { setPanel(null); setClosing(false) }, 170)
  }, [panel, closing])

  const openPanel = useCallback(name => {
    setClosing(false)
    setPanel(current => current === name ? null : name)
  }, [])

  useEffect(() => {
    const key = event => {
      if (event.key !== 'Escape') return
      const busy = picked && installs[picked] && !installs[picked].done && !installs[picked].failed
      if (picked && !busy) setPicked(null)
      else closePanel()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [closePanel, picked, installs])

  // Install progress from the main process; a finished install refreshes the menu so the tile lights up.
  useEffect(() => {
    const stop = api.onInstall(state => {
      setInstalls(previous => ({ ...previous, [state.id]: state }))
      if (state.done) refresh()
    })
    return stop
  }, [refresh])

  function pickMissing(app) {
    setPicked(app.id)
    setLatest(null)
    if (app.installable) api.release(app.id).then(setLatest).catch(() => {})
  }
  async function install(id) {
    setInstalls(previous => ({ ...previous, [id]: { id, stage: 'Starting', percent: 0 } }))
    try { await api.install(id) } catch {}
  }

  useEffect(() => { if (!problem) return; const timer = setTimeout(() => setProblem(''), 9000); return () => clearTimeout(timer) }, [problem])

  useLayoutEffect(() => {
    if (!panelRef.current) return
    const observer = new ResizeObserver(([entry]) => setPanelHeight(entry.contentRect.height))
    observer.observe(panelRef.current)
    return () => observer.disconnect()
  }, [panel])

  async function launch(id, handoffId) {
    setOpening(true)
    setProblem('')
    try { await api.openApp(id, handoffId) }
    catch (error) { setProblem(error.message) }
    finally { setOpening(false) }
  }

  async function windowAction(action) {
    try {
      const state = await api.windowAction(action)
      setPinned(state.pinned)
    } catch (error) { setProblem(error.message) }
  }

  // The eye moves the whole dock when dragged; a click without a drag opens chat.
  function grab(event) {
    if (event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY, cx, cy, moved: false }
    holding.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event) {
    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (!current.moved && Math.hypot(dx, dy) < 6) return
    if (!current.moved) { current.moved = true; setDragging(true) }
    setDock({ x: (current.cx + dx) / width, y: (current.cy + dy) / height })
  }
  function release() {
    const current = drag.current
    holding.current = false
    if (!current) return
    drag.current = null
    if (current.moved) {
      setDragging(false)
      setDock(next => {
        const saved = { x: clamp(next.x, 0, 1), y: clamp(next.y, 0, 1) }
        localStorage.setItem(dockKey, JSON.stringify(saved))
        return saved
      })
      current.wasDrag = true
    }
    drag.last = current
  }
  function eyeClick() {
    if (drag.last?.wasDrag) { drag.last = null; return }
    openPanel('chat')
  }

  const menu = menuOrder.map(id => data.apps.find(app => app.id === id) || data.tools?.find(tool => tool.id === id) && { ...data.tools.find(tool => tool.id === id), tool: true }).filter(Boolean)
  const pickedApp = picked ? menu.find(app => app.id === picked) : null
  const cx = clamp(dock.x * width, 330, width - 330)
  const cy = clamp(dock.y * height, 340, height - 330)
  const side = cx > width / 2 ? 'left' : 'right'
  const panelWidth = Math.min(460, Math.max(320, (side === 'left' ? cx : width - cx) - panelGap - 24))
  const panelLeft = side === 'left' ? Math.max(16, cx - panelGap - panelWidth) : Math.min(width - panelWidth - 16, cx + panelGap)
  const panelTop = clamp(cy - panelHeight / 2, 16, height - panelHeight - 16)
  const items = brandId ? data.handoffs.filter(item => item.brandId === brandId) : data.handoffs
  const brandName = data.brands.find(brand => brand.id === brandId)?.name || 'All businesses'
  const engineReady = data.engines.some(item => item.id === engine && item.available)

  return (
    <div className={`overlay${dragging ? ' is-dragging' : ''}`}>
      <h1 className="sr-only">Hivemind</h1>
      <div className="dock" style={{ left: cx, top: cy }}>
        <div className="aura" aria-hidden="true" />
        <svg className="threads" aria-hidden="true" width="560" height="340" viewBox="-280 -290 560 340">
          <defs>
            <linearGradient id="thread" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#f44859" stopOpacity=".55" />
              <stop offset="1" stopColor="#f44859" stopOpacity="0" />
            </linearGradient>
          </defs>
          {menu.map(app => {
            const radians = appDetails[app.id].angle * Math.PI / 180
            return <line key={app.id} className={`thread${app.tool ? ' faint' : ''}`} x1="0" y1="-10" x2={Math.cos(radians) * (orbitRadius - 58)} y2={Math.sin(radians) * (orbitRadius - 58) - 20} stroke="url(#thread)" />
          })}
        </svg>
        {menu.map((app, index) => {
          const state = installs[app.id]
          const busy = state && !state.done && !state.failed
          return <AppOrb key={app.id} app={app} launch={launch} opening={opening} index={index} onMissing={pickMissing} progress={busy ? state : null} />
        })}
        <button className={`agent-eye${panel === 'chat' ? ' active' : ''}`} type="button" data-solid aria-label="Open Hivemind chat"
          aria-expanded={panel === 'chat'} title="Ask Hivemind · drag to move"
          onPointerDown={grab} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onClick={eyeClick}>
          <span className="eye-image"><img src={logo} alt="" draggable="false" /></span>
          <span className="eye-label">Ask Hivemind</span>
        </button>
        <div className="dock-bar" data-solid>
          <label className="business"><span className="sr-only">Business</span>
            <select aria-label="Business" value={brandId || ''} onChange={event => setBrandId(event.target.value)}>
              <option value="">All businesses</option>
              {data.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
          </label>
          <button type="button" className={`chip${panel === 'handoffs' ? ' on' : ''}`} aria-expanded={panel === 'handoffs'} onClick={() => openPanel('handoffs')}>
            Handoffs<span className="count">{items.length}</span>
          </button>
          <span className="bar-tools">
            <button type="button" className={`tool${pinned ? ' on' : ''}`} aria-pressed={pinned} aria-label={pinned ? 'Stop keeping Hivemind on top' : 'Keep Hivemind on top'} title={pinned ? 'Kept on top' : 'Keep on top'} onClick={() => windowAction(pinned ? 'unpin' : 'pin')}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 1.8h5l-.8 4.3 2.6 2.4v1H8.6v4.7L8 15l-.6-.8V9.5H4.7v-1l2.6-2.4z" /></svg>
            </button>
            <button type="button" className="tool" aria-label="Minimize Hivemind" title="Minimize" onClick={() => windowAction('minimize')}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5h9" /></svg>
            </button>
            <button type="button" className="tool" aria-label="Close Hivemind" title="Close" onClick={() => windowAction('quit')}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </span>
        </div>
        {pickedApp && <InstallCard app={pickedApp} release={latest} state={installs[pickedApp.id]}
          onInstall={() => install(pickedApp.id)} onPage={() => api.openPage(pickedApp.id).catch(error => setProblem(error.message))}
          onClose={() => setPicked(null)} />}
        {problem && <p className={`toast${pickedApp ? ' below-card' : ''}`} role="alert" data-solid onClick={() => setProblem('')}>{problem}</p>}
      </div>

      {panel && (
        <aside ref={panelRef} className={`panel from-${side}${closing ? ' closing' : ''}`} data-solid
          style={{ left: panelLeft, top: panelTop, width: panelWidth }} aria-label={panel === 'chat' ? 'Chat panel' : 'Handoffs panel'}>
          <header className="panel-head">
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={panel === 'chat'} className={panel === 'chat' ? 'on' : ''} onClick={() => setPanel('chat')}>Chat</button>
              <button type="button" role="tab" aria-selected={panel === 'handoffs'} className={panel === 'handoffs' ? 'on' : ''} onClick={() => setPanel('handoffs')}>Handoffs <span className="count">{items.length}</span></button>
            </div>
            <button type="button" className="tool" aria-label="Close panel" title="Close (Esc)" onClick={closePanel}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </header>
          <div className="panel-meta">
            <span className="for">{brandName}</span>
            {panel === 'chat' && <label className="agent-select"><span>Agent</span>
              <select aria-label="Agent" value={engine} onChange={event => { engineChosen.current = true; setEngine(event.target.value) }}>
                {Object.entries(engines).map(([id, name]) => <option key={id} value={id}>{name}{data.engines.some(item => item.id === id && item.available) ? '' : ' · unavailable'}</option>)}
              </select>
            </label>}
          </div>
          {panel === 'chat'
            ? <Chat brandId={brandId || ''} engine={engine} available={data.engines} opening={opening} key={`${brandId}:${engine}:${engineReady}`} />
            : <Handoffs items={items} apps={data.apps} launch={launch} opening={opening} brandId={brandId} refresh={refresh} refreshing={refreshing} />}
        </aside>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
