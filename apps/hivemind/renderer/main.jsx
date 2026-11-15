import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import logo from '../../../src/renderer/src/assets/hivemind-logo.png'
import chatIcon from './app-icons/chat.png'
import outreachIcon from './app-icons/outreach.png'
import studioIcon from './app-icons/studio.png'
import signalIcon from './app-icons/signal.png'
import voiceIcon from './app-icons/voice.png'
import keysIcon from './app-icons/keys.png'
import { RichText } from './rich-text.jsx'
import { BusinessSwitcher, Businesses } from './businesses.jsx'
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
function AppOrb({ app, launch, opening, index, onMissing, progress, working }) {
  const detail = appDetails[app.id]
  const radians = detail.angle * Math.PI / 180
  const dx = Math.round(Math.cos(radians) * orbitRadius)
  const dy = Math.round(Math.sin(radians) * orbitRadius)
  const missing = !app.installed
  const badge = missing ? (app.installable ? 'Get' : app.id === 'outreach' ? 'Private' : 'Soon') : null
  return (
    <div className={`orb-slot slot-${app.id}${app.tool ? ' tool-slot' : ''}${missing ? ' missing' : ''}${working ? ' working' : ''}`} style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, '--i': index }}>
      <button className={`app-orb node-${app.id}`} type="button" data-solid
        aria-label={missing ? `Get ${app.name}` : `Open ${app.name}`} disabled={opening && !missing}
        title={missing ? `${app.name} isn't installed. ${detail.detail}` : `${app.name}: ${detail.detail}`}
        onClick={() => missing ? onMissing(app) : launch(app.id)}>
        <img className="app-icon" src={detail.icon} alt="" draggable="false" />
        <span className="app-label"><strong>{appNames[app.id]}</strong><small>{detail.line}</small></span>
        {badge && <span className={`app-badge${app.installable ? ' get' : ''}`}>{badge}</span>}
        {progress && <span className="app-progress" aria-hidden="true"><i style={{ width: `${progress.percent || 0}%` }} /></span>}
        {working && <span className="app-working">Working</span>}
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
function RememberedCard({ item }) {
  const [forgotten, setForgotten] = useState(false)
  const [problem, setProblem] = useState('')
  async function forget() {
    try { await api.memoryRemove(item.id); setForgotten(true) }
    catch (error) { if (/no longer/.test(error.message)) setForgotten(true); else setProblem(error.message) }
  }
  return (
    <div className={`action-card remembered${forgotten ? ' forgotten' : ''}`} role="status">
      <span className="action-kind"><span className="action-dot" aria-hidden="true" />{forgotten ? 'Forgotten' : `Remembered${item.about === 'business' && item.business ? ` for ${item.business}` : ''}`}</span>
      <strong>{item.text}</strong>
      {!forgotten && <small className="action-note">Every IV app chat can use this. <button type="button" className="link" onClick={forget}>Forget it</button></small>}
      {problem && <small className="install-error">{problem}</small>}
    </div>
  )
}

// An app asked before doing something (its own rule). While the reply runs it waits for Allow or Don't allow.
function AllowCard({ card, onAnswer }) {
  const [sending, setSending] = useState(false)
  const settled = { allowed: 'Allowed', declined: 'Not allowed', expired: 'No answer, so it didn\'t run' }[card.state]
  async function reply(allow) {
    setSending(true)
    try { await onAnswer(card.key, allow) } finally { setSending(false) }
  }
  return (
    <div className={`action-card allow ${card.state}`} role={card.state === 'waiting' ? 'alertdialog' : 'status'} aria-label={`${card.appName} asks`}>
      <span className="action-kind"><span className="action-dot" aria-hidden="true" />{settled ? `${settled} in ${card.appName.replace('IV ', '')}` : `${card.appName.replace('IV ', '')} asks first`}</span>
      <strong>{card.why}</strong>
      {card.state === 'waiting' && onAnswer && <div className="allow-actions">
        <button type="button" className="primary" disabled={sending} onClick={() => reply(true)}>Allow</button>
        <button type="button" className="quiet" disabled={sending} onClick={() => reply(false)}>Don't allow</button>
      </div>}
    </div>
  )
}

function ActionCard({ action, onChoose, disabled }) {
  if (action.type === 'remembered') return <RememberedCard item={action.item} />
  if (action.type === 'asked') return <AllowCard card={{ ...action, key: '' }} />
  if (action.type === 'worked') {
    return (
      <div className="action-card worked" role="status">
        {action.items.map(entry => (
          <div className="worked-row" key={entry.app}>
            <span><span className="action-kind"><span className="action-dot" aria-hidden="true" />{entry.changed ? 'Worked in' : 'Looked in'} {entry.appName.replace('IV ', '')}</span>
              <small>{entry.tools.length} {entry.tools.length === 1 ? 'tool' : 'tools'}: {entry.tools.map(tool => tool.replace(/^(fitscout|signal)_/, '').replace(/_/g, ' ')).join(', ')}</small></span>
            <button type="button" className="quiet" onClick={() => api.openApp(entry.app).catch(() => {})}>Show {entry.appName.replace('IV ', '')}</button>
          </div>
        ))}
      </div>
    )
  }
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

const timeAgo = value => {
  const seconds = Math.max(1, (Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`
  return shortDate(value)
}

function Steps({ steps, live }) {
  if (!steps?.length) return null
  return (
    <ol className={`steps${live ? ' live' : ''}`} aria-label="What it did">
      {steps.map((step, index) => (
        <li key={index} className={`step ${step.state}`}>
          <span className="step-mark" aria-hidden="true">{step.state === 'done' ? '✓' : step.state === 'error' ? '!' : ''}</span>
          {step.label}
        </li>
      ))}
    </ol>
  )
}

// The chat tab: threads for the selected business, each with its own agent and model. A thread continues its agent
// session, replies stream in as they're written, and each step shows while it runs.
function Chat({ brandId, available, defaultEngine, opening }) {
  const [threads, setThreads] = useState([])
  const [threadId, setThreadId] = useState(null)
  const [thread, setThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [live, setLive] = useState(null)
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [models, setModels] = useState({ claude: [], codex: [] })
  const [engine, setEngine] = useState(defaultEngine)
  const [model, setModel] = useState('')
  const end = useRef(null)
  const composer = useRef(null)
  const current = useRef(null)
  current.current = threadId
  const ready = available.some(item => item.id === engine && item.available)

  const loadThreads = useCallback(async (pick) => {
    const list = await api.threads(brandId)
    setThreads(list)
    return pick === undefined ? list : list.find(item => item.id === pick)
  }, [brandId])

  const open = useCallback(async (id) => {
    setProblem('')
    if (!id) { setThreadId(null); setThread(null); setMessages([]); setLive(null); setBusy(false); return }
    const state = await api.thread(id)
    setThreadId(id)
    setThread(state.thread)
    setEngine(state.thread.engine)
    setModel(state.thread.model || '')
    setMessages(state.messages)
    setLive(state.live)
    setBusy(state.busy)
  }, [])

  useEffect(() => { api.models().then(setModels).catch(() => {}) }, [])
  useEffect(() => {
    let alive = true
    setLoading(true)
    loadThreads().then(list => alive && open(list[0]?.id || null)).catch(error => alive && setProblem(error.message)).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [brandId, loadThreads, open])
  useEffect(() => api.onChat(data => {
    if (data.threadId !== current.current) { if (!data.busy) loadThreads().catch(() => {}); return }
    setMessages(data.messages || [])
    setLive(data.live || null)
    setBusy(Boolean(data.busy))
    if (data.problem) setProblem(data.problem)
    if (!data.busy) loadThreads().then(() => api.thread(data.threadId)).then(state => setThread(state.thread)).catch(() => {})
  }), [loadThreads])

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, live, busy])
  useEffect(() => { if (!loading && ready && !busy) composer.current?.focus() }, [loading, ready, busy, threadId])

  async function newThread() {
    if (busy) return
    setDraft('')
    await open(null)
    composer.current?.focus()
  }

  async function changeEngine(next) {
    if (thread && messages.length && next !== thread.engine &&
      !confirm(`Switch this chat to ${engines[next]}? It carries on with the chat so far in a new ${engines[next]} session.`)) return
    setEngine(next)
    setModel('')
    if (thread) setThread((await api.updateThread(thread.id, { engine: next })).thread)
  }
  async function changeModel(next) {
    setModel(next)
    if (thread) setThread((await api.updateThread(thread.id, { model: next })).thread)
  }
  async function removeThread() {
    if (!thread || busy || !confirm(`Delete "${thread.title}"? This removes the chat from Hivemind.`)) return
    await api.deleteThread(thread.id)
    const list = await loadThreads()
    await open(list[0]?.id || null)
  }

  async function send(event) {
    event?.preventDefault()
    if (!draft.trim() || busy || loading || !ready) return
    setProblem('')
    setBusy(true)
    try {
      let id = threadId
      if (!id) {
        const created = await api.newThread({ brandId, engine, model })
        id = created.thread.id
        setThreadId(id)
        current.current = id
        setThread(created.thread)
      }
      const state = await api.send({ threadId: id, message: draft })
      setMessages(state.messages)
      setLive(state.live)
      setBusy(state.busy)
      setDraft('')
      loadThreads().catch(() => {})
    } catch (error) {
      setProblem(error.message)
      setBusy(false)
    }
  }

  async function answer(key, allow) {
    setProblem('')
    try { const state = await api.answer({ threadId, key, allow }); setLive(state.live) }
    catch (error) { setProblem(error.message) }
  }

  async function choose(handoffId) {
    if (busy || choosing || !threadId) return
    setChoosing(true)
    setProblem('')
    try { setMessages((await api.choose({ threadId, handoffId })).messages) }
    catch (error) { setProblem(error.message) }
    finally { setChoosing(false) }
  }

  const modelOptions = models[engine] || []
  return (
    <section className="chat" aria-label="Hivemind chat">
      <div className="chat-tools">
        <label className="thread-select"><span className="sr-only">Chat</span>
          <select aria-label="Chat" value={threadId || ''} disabled={busy} onChange={event => open(event.target.value || null)}>
            <option value="">{threadId ? 'New chat' : 'New chat (not started)'}</option>
            {threads.map(item => <option key={item.id} value={item.id}>{item.title} · {timeAgo(item.updatedAt)}</option>)}
          </select>
        </label>
        <button type="button" className="tool" aria-label="New chat" title="New chat" disabled={busy} onClick={newThread}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>
        </button>
        <button type="button" className="tool" aria-label="Delete this chat" title="Delete this chat" disabled={busy || !thread} onClick={removeThread}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5" /></svg>
        </button>
      </div>
      <div className="chat-tools agent-row">
        <label className="agent-select"><span>Agent</span>
          <select aria-label="Agent" value={engine} disabled={busy} onChange={event => changeEngine(event.target.value)}>
            {Object.entries(engines).map(([id, name]) => <option key={id} value={id}>{name}{available.some(item => item.id === id && item.available) ? '' : ' · unavailable'}</option>)}
          </select>
        </label>
        <label className="agent-select"><span>Model</span>
          <select aria-label="Model" value={model} disabled={busy} onChange={event => changeModel(event.target.value)}>
            {modelOptions.map(option => <option key={option.id || 'default'} value={option.id}>{option.name}</option>)}
          </select>
        </label>
      </div>
      <div className="conversation" role="log" aria-label="Conversation">
        {!loading && !messages.length && !live && <div className="chat-welcome">
          <span className="eye-image small"><img src={logo} alt="" /></span>
          <h2>What are you working on?</h2>
          <p>Ask for something and Hivemind does it in IV Outreach, Signal or Studio. You'll see the app work, and anything that needs your OK waits for you.</p>
          <div className="examples">
            {['Draft a LinkedIn post in Signal', 'What leads do I have in Outreach?', 'Make a short video shot in Studio'].map(prompt => <button type="button" key={prompt} disabled={!ready || busy} onClick={() => { setDraft(prompt); composer.current?.focus() }}>{prompt}</button>)}
          </div>
        </div>}
        {messages.map((message, index) => (
          <article className={`message ${message.role}`} key={index}>
            <strong>{message.role === 'user' ? 'You' : engines[message.engine] || 'Hivemind'}</strong>
            {message.role === 'assistant' && <Steps steps={message.steps} />}
            {message.text && (message.role === 'assistant' ? <RichText text={message.text} /> : <p>{message.text}</p>)}
            {(message.actions || []).map((action, at) => <ActionCard key={at} action={action} onChoose={choose} disabled={busy || choosing || opening} />)}
          </article>
        ))}
        {busy && (
          <article className="message assistant live" aria-live="polite">
            <strong>{engines[engine]}</strong>
            <Steps steps={live?.steps} live />
            {(live?.asks || []).map(card => <AllowCard key={card.key} card={card} onAnswer={answer} />)}
            {live?.text ? <RichText text={live.text} caret={<span className="caret" aria-hidden="true" />} />
              : <p className="chat-status working" role="status"><span className="pulse" aria-hidden="true" />{live?.steps?.length ? 'Working…' : 'Thinking…'}</p>}
          </article>
        )}
        {choosing && <p className="chat-status working" role="status"><span className="pulse" aria-hidden="true" />Opening…</p>}
        <div ref={end} />
      </div>
      {!ready && !loading && <p className="chat-status">Install and sign in to {engines[engine]} to chat here.</p>}
      {problem && <p role="alert" className="error">{problem}</p>}
      <form className="composer" onSubmit={send}>
        <textarea ref={composer} aria-label="Message Hivemind" rows="2" maxLength="8000" placeholder={thread?.title && messages.length ? `Continue “${thread.title}”…` : 'Message Hivemind…'} value={draft}
          disabled={!ready || busy || loading} onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} />
        {busy ? <button type="button" className="primary" onClick={() => api.stop()}>Stop</button> : <button className="primary" disabled={!ready || loading || !draft.trim()}>Send</button>}
      </form>
    </section>
  )
}

function MemoryItem({ item, scopes, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.text)
  const [problem, setProblem] = useState('')
  async function save() {
    try { await api.memoryUpdate(item.id, { text }); setEditing(false); setProblem(''); onChanged() }
    catch (error) { setProblem(error.message) }
  }
  async function move(scope) {
    try { await api.memoryUpdate(item.id, { scope }); onChanged() } catch (error) { setProblem(error.message) }
  }
  async function remove() {
    if (!confirm(`Forget this?\n\n“${item.text}”`)) return
    try { await api.memoryRemove(item.id); onChanged() } catch (error) { setProblem(error.message) }
  }
  return (
    <li className="memory-item">
      {editing
        ? <textarea aria-label="Edit memory" value={text} maxLength="600" rows="2" onChange={event => setText(event.target.value)} />
        : <p>{item.text}</p>}
      <div className="memory-meta">
        <small>{item.source}{item.by && item.by !== 'hivemind' ? ` · ${item.by}` : ''} · {shortDate(item.updatedAt)}</small>
        <span className="memory-actions">
          {editing
            ? <><button type="button" className="link" onClick={save}>Save</button><button type="button" className="link" onClick={() => { setEditing(false); setText(item.text) }}>Cancel</button></>
            : <>
              {scopes.length > 1 && <select aria-label="Who it's about" value={item.scope} onChange={event => move(event.target.value)}>
                {scopes.map(scope => <option key={scope.id} value={scope.id}>{scope.name}</option>)}
              </select>}
              <button type="button" className="link" onClick={() => setEditing(true)}>Edit</button>
              <button type="button" className="link" onClick={remove}>Forget</button>
            </>}
        </span>
      </div>
      {problem && <small className="install-error">{problem}</small>}
    </li>
  )
}

function MemorySection({ title, scope, items, scopes, onChanged }) {
  const [text, setText] = useState('')
  const [problem, setProblem] = useState('')
  async function add(event) {
    event.preventDefault()
    if (!text.trim()) return
    try { await api.memoryAdd({ scope, text }); setText(''); setProblem(''); onChanged() }
    catch (error) { setProblem(error.message) }
  }
  return (
    <section className="memory-section" aria-label={title}>
      <h3>{title} <span className="count">{items.length}</span></h3>
      {!items.length && <p className="empty-note">Nothing yet. Tell Hivemind in chat, add one here, or import from your AI.</p>}
      <ul>{items.map(item => <MemoryItem key={item.id} item={item} scopes={scopes} onChanged={onChanged} />)}</ul>
      <form className="memory-add" onSubmit={add}>
        <input aria-label={`Add a memory ${title.toLowerCase()}`} maxLength="600" placeholder="Add something to remember…" value={text} onChange={event => setText(event.target.value)} />
        <button type="submit" className="quiet" disabled={!text.trim()}>Add</button>
      </form>
      {problem && <small className="install-error">{problem}</small>}
    </section>
  )
}

const sizeLabel = bytes => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

// Import what the person's own AI knows: their agent reads the files (or a pasted answer) and suggests memories,
// which they tick, edit and file before anything is saved.
function MemoryImport({ brands, available, defaultEngine, onDone, onCancel }) {
  const [sources, setSources] = useState(null)
  const [source, setSource] = useState('claude')
  const [engine, setEngine] = useState(defaultEngine)
  const [pasted, setPasted] = useState('')
  const [copied, setCopied] = useState(false)
  const [running, setRunning] = useState(false)
  const [suggestions, setSuggestions] = useState(null)
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { api.importSources().then(found => { setSources(found); if (!found.claude.count && found.codex.count) setSource('codex'); else if (!found.claude.count) setSource('paste') }).catch(error => setProblem(error.message)) }, [])
  const scopes = [{ id: 'you', name: 'About you' }, ...brands.map(brand => ({ id: brand.id, name: brand.name }))]

  async function run() {
    setRunning(true); setProblem(''); setSuggestions(null)
    try {
      const result = await api.importRun({ source, engine, text: pasted })
      setSuggestions(result.suggestions.map(item => ({ ...item, keep: true })))
    } catch (error) { setProblem(error.message) }
    finally { setRunning(false) }
  }
  async function save() {
    setSaving(true); setProblem('')
    let saved = 0
    for (const item of suggestions.filter(entry => entry.keep)) {
      try { await api.memoryAdd({ scope: item.scope, text: item.text, source: 'import' }); saved++ }
      catch (error) { setProblem(error.message) }
    }
    setSaving(false)
    onDone(saved)
  }
  const edit = (index, change) => setSuggestions(list => list.map((item, at) => at === index ? { ...item, ...change } : item))

  if (suggestions) {
    const kept = suggestions.filter(item => item.keep).length
    return (
      <div className="memory-import">
        <h3>Suggested memories</h3>
        <p className="install-note">{suggestions.length ? 'Untick anything you don’t want, fix the wording, and file each one under you or a business. Nothing is saved until you press Save.' : 'Nothing new to add: IV memory already has everything it suggested.'}</p>
        <ul className="suggestions">
          {suggestions.map((item, index) => (
            <li key={index} className={item.keep ? '' : 'off'}>
              <input type="checkbox" aria-label="Keep this memory" checked={item.keep} onChange={event => edit(index, { keep: event.target.checked })} />
              <div>
                <textarea aria-label="Memory text" rows="2" maxLength="600" value={item.text} onChange={event => edit(index, { text: event.target.value })} />
                <select aria-label="Who it's about" value={item.scope} onChange={event => edit(index, { scope: event.target.value })}>
                  {scopes.map(scope => <option key={scope.id} value={scope.id}>{scope.name}</option>)}
                </select>
              </div>
            </li>
          ))}
        </ul>
        {problem && <p className="install-error">{problem}</p>}
        <div className="install-actions">
          {suggestions.length > 0 && <button type="button" className="primary" disabled={!kept || saving} onClick={save}>{saving ? 'Saving…' : `Save ${kept}`}</button>}
          <button type="button" className="quiet" disabled={saving} onClick={onCancel}>{suggestions.length ? 'Cancel' : 'Back'}</button>
        </div>
      </div>
    )
  }

  const describe = id => !sources ? 'checking…' : sources[id]?.count ? `${sources[id].count} file${sources[id].count === 1 ? '' : 's'}, ${sizeLabel(sources[id].bytes)}` : 'none found on this PC'
  return (
    <div className="memory-import">
      <h3>Import what your AI knows</h3>
      <p className="install-note">Your agent reads what it’s given and suggests short memories. You review every one before anything is saved.</p>
      <div className="import-sources" role="radiogroup" aria-label="Import from">
        {[['claude', 'Claude Code on this PC', `Your instructions and memory notes · ${describe('claude')}`],
          ['codex', 'Codex on this PC', `Your instructions and memory summary · ${describe('codex')}`],
          ['paste', 'The Claude or ChatGPT app', 'Ask it what it knows about you, then paste the answer here']].map(([id, name, detail]) => (
          <label key={id} className={`import-source${source === id ? ' on' : ''}${id !== 'paste' && !sources?.[id]?.count ? ' none' : ''}`}>
            <input type="radio" name="import-source" value={id} checked={source === id} disabled={id !== 'paste' && !sources?.[id]?.count} onChange={() => setSource(id)} />
            <span><strong>{name}</strong><small>{detail}</small></span>
          </label>
        ))}
      </div>
      {source === 'paste' && <div className="paste-flow">
        <p className="install-note">1. Copy this and send it in the Claude or ChatGPT app:</p>
        <blockquote>{sources?.pastePrompt}</blockquote>
        <button type="button" className="quiet" onClick={() => navigator.clipboard.writeText(sources?.pastePrompt || '').then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy'}</button>
        <p className="install-note">2. Paste its answer here:</p>
        <textarea aria-label="Paste the answer" rows="6" value={pasted} onChange={event => setPasted(event.target.value)} />
      </div>}
      <label className="agent-select import-engine"><span>Read with</span>
        <select aria-label="Read with" value={engine} onChange={event => setEngine(event.target.value)}>
          {Object.entries(engines).map(([id, name]) => <option key={id} value={id} disabled={!available.some(item => item.id === id && item.available)}>{name}</option>)}
        </select>
      </label>
      {running && <p className="chat-status working" role="status"><span className="pulse" aria-hidden="true" />{engines[engine]} is reading and suggesting memories…</p>}
      {problem && <p className="install-error">{problem}</p>}
      <div className="install-actions">
        <button type="button" className="primary" disabled={running || (source === 'paste' && pasted.trim().length < 20)} onClick={run}>Suggest memories</button>
        <button type="button" className="quiet" disabled={running} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function Memory({ brandId, brandName, brands, available, defaultEngine }) {
  const [lists, setLists] = useState({ you: [], business: [] })
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [problem, setProblem] = useState('')
  const load = useCallback(() => api.memoryList(brandId).then(setLists).catch(error => setProblem(error.message)), [brandId])
  useEffect(() => { load() }, [load])
  const scopes = [{ id: 'you', name: 'About you' }, ...brands.map(brand => ({ id: brand.id, name: brand.name }))]
  if (importing) return <MemoryImport brands={brands} available={available} defaultEngine={defaultEngine} onCancel={() => setImporting(false)} onDone={saved => { setImporting(false); setNotice(`Saved ${saved} memor${saved === 1 ? 'y' : 'ies'}.`); load() }} />
  return (
    <div className="memory">
      <div className="memory-head">
        <p className="install-note">What your IV apps know about you. Every IV chat reads this, with Claude Code or Codex.</p>
        <button type="button" className="quiet" onClick={() => { setNotice(''); setImporting(true) }}>Import from your AI</button>
      </div>
      {notice && <p className="memory-notice" role="status">{notice}</p>}
      {problem && <p className="install-error">{problem}</p>}
      <MemorySection title="About you" scope="you" items={lists.you} scopes={scopes} onChanged={load} />
      {brandId && <MemorySection title={`About ${brandName}`} scope={brandId} items={lists.business} scopes={scopes} onChanged={load} />}
    </div>
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
  const [working, setWorking] = useState(null)
  const holding = useRef(false)
  const drag = useRef(null)
  const panelRef = useRef(null)
  const [panelHeight, setPanelHeight] = useState(560)
  const { width, height } = useViewport()
  useClickThrough(holding)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const snapshot = await api.snapshot()
      setData(snapshot)
      // The business every IV app is on (chosen here or in an app).
      setBrandId(previous => previous !== null && (!previous || snapshot.brands.some(brand => brand.id === previous)) ? previous : snapshot.active || '')
      setEngine(snapshot.engines.find(item => item.available)?.id || 'claude')
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

  // Switching business here switches every IV app; a shared business picked in an app switches Hivemind too.
  const brandRef = useRef(null)
  brandRef.current = brandId
  const known = useRef([])
  known.current = data.brands
  async function pickBusiness(id) {
    setBrandId(id)
    try { await api.setActive(id) } catch (error) { setProblem(error.message) }
  }
  useEffect(() => {
    const timer = setInterval(() => {
      api.active().then(active => {
        const id = active?.brandId || ''
        if (!active?.at || id === brandRef.current) return
        if (id && !known.current.some(brand => brand.id === id)) refresh()
        setBrandId(id)
      }).catch(() => {})
    }, 4000)
    return () => clearInterval(timer)
  }, [refresh])

  // Which IV app the chat is working in right now (its tile shows it).
  useEffect(() => api.onWorking(state => setWorking(state.app || null)), [])

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
  // Dragging works in screen coordinates, so the eye can be carried onto another monitor: when it passes this
  // screen's edge, the overlay moves to the screen under it and the drag carries on there.
  function grab(event) {
    if (event.button !== 0) return
    drag.current = { sx: event.screenX, sy: event.screenY, ex: window.screenX + cx, ey: window.screenY + cy, moved: false }
    holding.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event) {
    const current = drag.current
    if (!current) return
    const dx = event.screenX - current.sx
    const dy = event.screenY - current.sy
    if (!current.moved && Math.hypot(dx, dy) < 6) return
    if (!current.moved) { current.moved = true; setDragging(true) }
    const ex = current.ex + dx
    const ey = current.ey + dy
    const left = window.screenX
    const top = window.screenY
    if (!current.switching && (ex < left || ey < top || ex >= left + window.innerWidth || ey >= top + window.innerHeight)) {
      current.switching = true
      api.moveTo({ x: ex, y: ey }).catch(() => {}).finally(() => { current.switching = false })
    }
    setDock({ x: (ex - window.screenX) / window.innerWidth, y: (ey - window.screenY) / window.innerHeight })
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
          return <AppOrb key={app.id} app={app} launch={launch} opening={opening} index={index} onMissing={pickMissing} progress={busy ? state : null} working={working === app.id} />
        })}
        <button className={`agent-eye${panel === 'chat' ? ' active' : ''}`} type="button" data-solid aria-label="Open Hivemind chat"
          aria-expanded={panel === 'chat'} title="Ask Hivemind · drag to move"
          onPointerDown={grab} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onClick={eyeClick}>
          <span className="eye-image"><img src={logo} alt="" draggable="false" /></span>
          <span className="eye-label">{working ? `Working in ${appNames[working]}` : 'Ask Hivemind'}</span>
        </button>
        <div className="dock-bar" data-solid>
          <BusinessSwitcher brands={data.brands} brandId={brandId || ''} onPick={pickBusiness} onManage={() => { setClosing(false); setPanel('businesses') }} />
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
          style={{ left: panelLeft, top: panelTop, width: panelWidth }} aria-label={panel === 'chat' ? 'Chat panel' : panel === 'memory' ? 'Memory panel' : panel === 'businesses' ? 'Businesses panel' : 'Handoffs panel'}>
          <header className="panel-head">
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={panel === 'chat'} className={panel === 'chat' ? 'on' : ''} onClick={() => setPanel('chat')}>Chat</button>
              <button type="button" role="tab" aria-selected={panel === 'memory'} className={panel === 'memory' ? 'on' : ''} onClick={() => setPanel('memory')}>Memory</button>
              <button type="button" role="tab" aria-selected={panel === 'handoffs'} className={panel === 'handoffs' ? 'on' : ''} onClick={() => setPanel('handoffs')}>Handoffs <span className="count">{items.length}</span></button>
              <button type="button" role="tab" aria-selected={panel === 'businesses'} className={panel === 'businesses' ? 'on' : ''} onClick={() => setPanel('businesses')}>Businesses</button>
            </div>
            <button type="button" className="tool" aria-label="Close panel" title="Close (Esc)" onClick={closePanel}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </header>
          {panel === 'memory' && <Memory brandId={brandId || ''} brandName={brandName} brands={data.brands} available={data.engines} defaultEngine={engine} key={brandId || 'all'} />}
          {panel === 'businesses' && <Businesses activeId={brandId || ''} onPick={pickBusiness} onChanged={refresh} />}
          {panel === 'memory' || panel === 'businesses' ? null : panel === 'chat'
            ? <Chat brandId={brandId || ''} available={data.engines} defaultEngine={engine} opening={opening} key={brandId || 'all'} />
            : <>
              <div className="panel-meta"><span className="for">{brandName}</span></div>
              <Handoffs items={items} apps={data.apps} launch={launch} opening={opening} brandId={brandId} refresh={refresh} refreshing={refreshing} />
            </>}
        </aside>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
