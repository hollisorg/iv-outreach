import PageStage from '../components/PageStage'
import BusinessSettings from '../components/BusinessSettings'
import { useEffect, useState } from 'react'
import { call, useData } from '../api'
import { AgentRows, useAgentSetup } from '../components/AgentSetup'
import ResearchSettings from '../components/ResearchSettings'
import PremiumSettings from '../components/PremiumSettings'
import AppUpdates from '../components/AppUpdates'
import MailboxConnect from '../components/MailboxConnect'

const FIELDS = [
  ['name', 'Your name'],
  ['title', 'Your title'],
  ['company', 'Company'],
  ['reply_email', 'Reply-to email'],
  ['postal_address', 'Postal address (required on every email)'],
  ['signature', 'Signature (optional)'],
]

const TOPICS = [
  ['updates', 'App updates', 'New versions, ready when you are.'],
  ['businesses', 'Businesses', 'Brands, audiences and campaigns.'],
  ['agent', 'Your agent', 'Your personal agent connection, shared across businesses.'],
  ['research', 'Research', 'Choose how you discover and understand opportunities.'],
  ['premium', 'Premium & credits', 'Your Premium account and credits are shared across this workspace.'],
  ['sender', 'Sender profile', 'Shared across all businesses. Check the sender before approving outreach for a different brand.'],
  ['mailbox', 'Mailbox', 'One connected mailbox on this PC, shared across businesses.'],
  ['connections', 'Other apps', 'Use this workspace with your other agents.'],
  ['boundaries', 'Do not contact', 'One suppression list protects contacts across every business.'],
]
export default function Settings({ notify, openOnboarding, ...workspace }) {
  const [active, setActive] = useState('businesses')
  useEffect(() => {
    const main = document.querySelector('main')
    const sync = () => {
      const line = main.getBoundingClientRect().top + Math.min(220, main.clientHeight * .3)
      let current = TOPICS[0][0]
      for (const [id] of TOPICS) if (document.getElementById(`setup-${id}`)?.getBoundingClientRect().top <= line) current = id
      if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4) current = TOPICS.at(-1)[0]
      setActive(current)
    }
    main.addEventListener('scroll', sync, { passive: true }); sync()
    return () => main.removeEventListener('scroll', sync)
  }, [])
  const sections = {
    updates: <AppUpdates notify={notify} />,
    businesses: <BusinessSettings {...workspace} notify={notify} />,
    agent: <Agent notify={notify} />, research: <ResearchSettings />,
    premium: <PremiumSettings notify={notify} />, sender: <Sender notify={notify} />,
    mailbox: <Mailbox notify={notify} />, connections: <Connect notify={notify} />,
    boundaries: <DoNotContact notify={notify} />,
  }
  return <div className="page settings">
    <PageStage kind="settings" title="Your setup" kicker="Infinite Variance / Make it yours" subtitle="Your businesses. Your agent. Your way." />
    <div className="setup-reopen"><span className="small dim">{workspace.business?.name || 'Your workspace'} / Settings</span><button className="btn" onClick={openOnboarding}>Open guided setup ↗</button></div>
    <div className="iv-set-layout">
      <nav className="iv-set-nav" aria-label="Settings sections">{TOPICS.map(([id, title], i) => <button key={id} className={active === id ? 'on' : ''} aria-current={active === id ? 'location' : undefined} onClick={() => {
        const el = document.getElementById(`setup-${id}`)
        el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); el?.focus({ preventScroll: true }); setActive(id)
      }}><span className="mono">{String(i+1).padStart(2,'0')}</span>{title}</button>)}</nav>
      <div className="iv-set-cards">{TOPICS.map(([id,title,sub],i) => <section key={id} id={`setup-${id}`} className="iv-set-card" tabIndex={-1} aria-labelledby={`setup-title-${id}`}>
        <header className="iv-set-card-head"><span className="iv-set-number" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><div><h2 id={`setup-title-${id}`}>{title}</h2><p className="small dim">{sub}</p></div></header>
        <div className="iv-set-body">{sections[id]}</div>
      </section>)}</div>
    </div>
  </div>
}

function Agent({ notify }) {
  const setup = useAgentSetup()
  const [s, setS] = useState(null)
  useEffect(() => {
    call('appSettings').then(setS, () => {})
  }, [])
  const save = async (patch) => {
    try {
      setS(await call('saveAppSettings', patch))
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <section className="panel set">
      <div className="set-head">
        <h2>Your agent</h2>
        <p className="small dim">The chat runs on your own Claude Code, Codex or Hermes, on your own plan. Your agent researches public sources and saves leads here. No separate research engine or API key is required.</p>
      </div>
      <AgentRows setup={setup} notify={notify} />
      {s&&<div className="visual-guidance-setting"><label><input type="checkbox" checked={s.visualGuidanceEnabled!==false} onChange={e=>save({visualGuidanceEnabled:e.target.checked})}/><span>Let my chat agent see the Outreach screen</span></label><p className="small dim">When you ask for help, your agent can inspect this app and highlight where to go. Screenshots cover input fields and chat. Other apps are never captured.</p></div>}
      {s && (
        <div className="form-grid two">
          <label>
            <span>Chat uses</span>
            <select value={s.chatEngine || ''} onChange={(e) => save({ chatEngine: e.target.value })}>
              <option value="">Whichever is installed (Claude Code first)</option>
              <option value="claude">Claude Code</option>
              <option value="codex">Codex</option>
              <option value="hermes">Hermes</option>
            </select>
          </label>
          <label>
            <span>Claude Code model</span>
            <select value={s.claudeModel || ''} onChange={(e) => save({ claudeModel: e.target.value })}>
              <option value="">Your Claude Code default</option>
              <option value="claude-opus-5-5">Claude Opus 5.5</option>
              <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
              <option value="claude-haiku-5-5">Claude Haiku 5.5</option>
            </select>
          </label>
          <label>
            <span>Call your agent</span>
            <input defaultValue={s.agentName || ''} placeholder="e.g. Scout" onBlur={(e) => save({ agentName: e.target.value })} />
          </label>
          <label>
            <span>Your first name</span>
            <input defaultValue={s.userName || ''} onBlur={(e) => save({ userName: e.target.value })} />
          </label>
        </div>
      )}
    </section>
  )
}

function Sender({ notify }) {
  const [data, reload] = useData('getSender')
  const [form, setForm] = useState(null)
  useEffect(() => {
    if (data && !form) setForm(data.sender)
  }, [data])
  if (!form) return null
  const save = async () => {
    try {
      const r = await call('saveSender', form)
      setForm(r.sender)
      reload()
      notify(r.missing.length ? `Saved. Still missing: ${r.missing.join(', ')}.` : 'Saved. You’re ready to send.', r.missing.length ? 'error' : 'ok')
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <section className="panel set">
      <div className="set-head">
        <h2>Who outreach comes from</h2>
        <p className="small dim">Every email carries your real name, company and postal address, with a one-reply way to opt out. That’s the law (CAN-SPAM), and it’s why people answer.</p>
      </div>
      <div className="form-grid two">
        {FIELDS.map(([k, label]) => (
          <label key={k} className={k === 'postal_address' || k === 'signature' ? 'wide' : ''}>
            <span>{label}</span>
            <input value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </label>
        ))}
        <label>
          <span>Emails per day (max 75)</span>
          <input type="number" min="0" max="75" value={form.daily_email_cap} onChange={(e) => setForm({ ...form, daily_email_cap: e.target.value })} />
        </label>
        <label>
          <span>LinkedIn notes per day (max 25)</span>
          <input type="number" min="0" max="25" value={form.daily_linkedin_cap} onChange={(e) => setForm({ ...form, daily_linkedin_cap: e.target.value })} />
        </label>
        <label>
          <span>Facebook / Instagram / X / TikTok notes per day, each (max 25)</span>
          <input type="number" min="0" max="25" value={form.daily_social_cap} onChange={(e) => setForm({ ...form, daily_social_cap: e.target.value })} />
        </label>
        <label>
          <span>Days before a follow-up</span>
          <input type="number" min="2" max="14" value={form.followup_days} onChange={(e) => setForm({ ...form, followup_days: e.target.value })} />
        </label>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" onClick={save}>Save sender profile</button>
        {data?.missing?.length > 0 && <span className="small bad">Missing: {data.missing.join(', ')}</span>}
      </div>
    </section>
  )
}

function Mailbox({ notify }) {
  const [st, reload] = useData('mailStatus')
  const [pw, setPw] = useState('')
  const [test, setTest] = useState(null)
  const [busy, setBusy] = useState(null)
  if (!st) return null
  const mb = st.mailbox
  const preset = st.presets[mb.provider] || st.presets.other
  const save = async (patch) => {
    try {
      await call('saveMailbox', patch)
      reload()
    } catch (e) {
      notify(e.message)
    }
  }
  const run = (name, fn) => async () => {
    setBusy(name)
    try {
      await fn()
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy(null)
      reload()
    }
  }
  const last = st.worker?.lastSend
  const check = st.worker?.lastCheck || st.last_check
  return (
    <section className="panel set">
      <div className="set-head">
        <h2>Your mailbox</h2>
        <p className="small dim">Email goes out from your own mailbox, one approved message at a time while IV Outreach is open. Recent replies stop follow-ups, and anyone who says “stop” goes on do-not-contact. Credentials are encrypted locally and used only to connect to your mail provider.</p>
      </div>
      {st.oauth&&<MailboxConnect status={st.oauth} {...{reload,notify}}/>}
      {!st.oauth?.connected&&<div className="form-grid two">
        <label>
          <span>Provider</span>
          <select value={mb.provider} onChange={(e) => save({ provider: e.target.value })}>
            {Object.entries(st.presets).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </label>
        <label>
          <span>Email address (sign-in)</span>
          <input defaultValue={mb.user} key={mb.user} placeholder="you@yourbusiness.com" onBlur={(e) => e.target.value !== mb.user && save({ user: e.target.value })} />
        </label>
        {mb.provider === 'other' && (
          <>
            <label><span>SMTP server</span><input defaultValue={mb.smtp_host} onBlur={(e) => save({ smtp_host: e.target.value })} /></label>
            <label><span>SMTP port</span><input type="number" defaultValue={mb.smtp_port} onBlur={(e) => save({ smtp_port: e.target.value, smtp_secure: Number(e.target.value) === 465 })} /></label>
            <label><span>IMAP server</span><input defaultValue={mb.imap_host} onBlur={(e) => save({ imap_host: e.target.value })} /></label>
            <label><span>IMAP port</span><input type="number" defaultValue={mb.imap_port} onBlur={(e) => save({ imap_port: e.target.value })} /></label>
          </>
        )}
        <label className="wide">
          <span>{st.hasPassword ? 'Password saved (encrypted). Enter a new one to replace it.' : 'App password'}</span>
          <div className="form-row tight">
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={st.hasPassword ? '••••••••' : 'App password'} autoComplete="off" />
            <button className="btn" disabled={!pw || busy} onClick={run('pw', async () => { await call('setMailPassword', { password: pw }); setPw(''); notify('Password saved, encrypted on this PC.', 'ok') })}>Save password</button>
            {st.hasPassword && <button className="btn btn-quiet" onClick={run('clear', () => call('clearMailPassword'))}>Forget</button>}
          </div>
          {preset.note && <span className="small dim">{preset.note}</span>}
        </label>
      </div>}
      <div className="form-actions">
        <button className="btn" disabled={!st.ready || !st.hasPassword || !!busy} onClick={run('test', async () => setTest(await call('testMailbox')))}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
        <label className="switch">
          <input type="checkbox" checked={!!mb.auto_send} disabled={!st.ready || !st.hasPassword} onChange={(e) => save({ auto_send: e.target.checked })} />
          <span>Send approved emails automatically</span>
        </label>
        <button className="btn btn-quiet" disabled={!st.ready || !st.hasPassword || !!busy} onClick={run('check', async () => {
          const r = await call('checkRepliesNow')
          notify(r?.error ? r.error : `Checked ${r?.checked || 0} new messages: ${r?.replies || 0} replies, ${r?.bounces || 0} bounces.`, r?.error ? 'error' : 'ok')
        })}>{busy === 'check' ? 'Checking…' : 'Check replies now'}</button>
      </div>
      {test && (
        <p className="small">
          {test.api?'Mailbox API':'Sending (SMTP)'}: {test.smtp.ok ? <span className="ok">connected</span> : <span className="bad">{test.smtp.error}</span>} · {test.api?'Reading':'Reading (IMAP)'}: {test.imap.ok ? <span className="ok">connected</span> : <span className="bad">{test.imap.error}</span>}
        </p>
      )}
      <p className="mono small dim">
        {st.approved_waiting} approved · {st.due_now} due now · {st.remaining_today} left today
        {last?.sent ? ` · last sent to ${last.to}` : last?.error ? ` · last attempt failed: ${last.error}` : ''}
        {check?.at ? ` · replies checked ${new Date(check.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
        {st.failed ? ` · ${st.failed} failed` : ''}
      </p>
    </section>
  )
}

function Connect({ notify }) {
  const [info, reload] = useData('agentsInfo')
  if (!info) return null
  const copy = async (text, what) => {
    await call('copyText', { text })
    notify(`${what} copied.`, 'ok')
  }
  return (
    <section className="panel set">
      <div className="set-head">
        <h2>Use IV Outreach from your other apps</h2>
        <p className="small dim">The same tools work in Claude Code, Codex and Claude Desktop, on this PC’s IV Outreach data.</p>
      </div>
      <div className="connect-grid">
        <div className="connect-card">
          <strong>Paste into any agent</strong>
          <p className="small dim">One message that tells Claude Code, Codex or Claude Desktop how to connect.</p>
          <button className="btn" onClick={() => copy(info.paste, 'Setup message')}>Copy setup message</button>
        </div>
        <div className="connect-card">
          <strong>Claude Code skill</strong>
          <p className="small dim">{info.skillInstalled ? (info.skillCurrent ? 'Installed and up to date.' : 'Installed, but older than this version.') : 'Teaches Claude Code how to use IV Outreach.'}</p>
          <button className="btn" disabled={info.skillCurrent} onClick={async () => {
            try {
              await call('installSkill')
              reload()
              notify('Skill installed for Claude Code.', 'ok')
            } catch (e) {
              notify(e.message)
            }
          }}>{info.skillInstalled ? (info.skillCurrent ? 'Skill installed' : 'Update skill') : 'Install skill'}</button>
        </div>
        <div className="connect-card">
          <strong>Claude Desktop</strong>
          <p className="small dim">Add this under “mcpServers” in claude_desktop_config.json, then restart Claude.</p>
          <div className="form-row">
            <button className="btn" onClick={() => copy(info.desktopSnippet, 'Config entry')}>Copy config entry</button>
            <button className="btn btn-quiet" onClick={() => call('openClaudeConfigFolder')}>Open folder</button>
          </div>
        </div>
      </div>
    </section>
  )
}

function DoNotContact({ notify }) {
  const [list, reload] = useData('listSuppression')
  const [kind, setKind] = useState('email')
  const [value, setValue] = useState('')
  return (
    <section className="panel set">
      <div className="set-head">
        <h2>Do not contact</h2>
        <p className="small dim">Never contacted again, from any campaign. People who reply “stop” are added automatically.</p>
      </div>
      <div className="form-row">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
          <option value="email">Email</option><option value="domain">Whole domain</option><option value="linkedin">LinkedIn profile</option>
        </select>
        <input value={value} placeholder={kind === 'email' ? 'name@business.com' : kind === 'domain' ? 'business.com' : 'linkedin.com/in/…'} onChange={(e) => setValue(e.target.value)} aria-label="Value" />
        <button className="btn" onClick={async () => {
          try {
            await call('suppress', { kind, value, reason: 'Added in app' })
            setValue('')
            reload()
          } catch (e) {
            notify(e.message)
          }
        }}>Add</button>
      </div>
      {list?.length > 0 && (
        <ul className="dnc">
          {list.slice(0, 50).map((s) => (
            <li key={`${s.kind}:${s.value}`} className="mono small"><span className="dim">{s.kind}</span> {s.value}{s.reason && <span className="dim"> · {s.reason}</span>}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
