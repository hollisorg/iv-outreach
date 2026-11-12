import { useEffect, useState } from 'react'
import { call, useData } from '../api'
import { AgentRows, useAgentSetup } from '../components/AgentSetup'

const FIELDS = [
  ['name', 'Your name'],
  ['title', 'Your title'],
  ['company', 'Company'],
  ['reply_email', 'Reply-to email'],
  ['postal_address', 'Postal address (required on every email)'],
  ['signature', 'Signature (optional)'],
]

export default function Settings({ notify }) {
  return (
    <div className="page settings">
      <header className="page-head">
        <p className="eyebrow">Settings</p>
        <h1>Set up Fitscout</h1>
      </header>
      <Agent notify={notify} />
      <Sender notify={notify} />
      <Connect notify={notify} />
      <DoNotContact notify={notify} />
    </div>
  )
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
        <p className="small dim">The chat runs on your own Claude Code, Codex or Hermes, on your own plan. Fitscout never needs an API key.</p>
      </div>
      <AgentRows setup={setup} notify={notify} />
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
        <h2>Use Fitscout from your other apps</h2>
        <p className="small dim">The same tools work in Claude Code, Codex and Claude Desktop, on this PC’s Fitscout data.</p>
      </div>
      <div className="connect-grid">
        <div className="connect-card">
          <strong>Paste into any agent</strong>
          <p className="small dim">One message that tells Claude Code, Codex or Claude Desktop how to connect.</p>
          <button className="btn" onClick={() => copy(info.paste, 'Setup message')}>Copy setup message</button>
        </div>
        <div className="connect-card">
          <strong>Claude Code skill</strong>
          <p className="small dim">{info.skillInstalled ? (info.skillCurrent ? 'Installed and up to date.' : 'Installed, but older than this version.') : 'Teaches Claude Code how to use Fitscout.'}</p>
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
