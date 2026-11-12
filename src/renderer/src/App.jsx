import { useEffect, useState } from 'react'
import { useData } from './api'
import ChatPanel from './components/ChatPanel'
import { Wordmark } from './components/Logo'
import Today from './pages/Today'
import Leads from './pages/Leads'
import Approve from './pages/Approve'
import Social from './pages/Social'
import Settings from './pages/Settings'

const NAV = [
  { id: 'today', label: 'Today' },
  { id: 'leads', label: 'Leads' },
  { id: 'approve', label: 'Approve' },
  { id: 'social', label: 'Social' },
  { id: 'settings', label: 'Settings' },
]
const AGENT = { claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes' }

export default function App() {
  const [page, setPage] = useState('today')
  const [chatOpen, setChatOpen] = useState(true)
  const [campaignId, setCampaignId] = useState(null)
  const [leadId, setLeadId] = useState(null)
  const [toast, setToast] = useState(null)
  const [overview] = useData('overview')
  const [chat] = useData('chatStatus')
  const [mail] = useData('mailStatus')
  const campaigns = overview?.campaigns || []
  const campaign = campaigns.find((c) => c.id === campaignId) || campaigns[0] || null

  useEffect(() => {
    if (!campaignId && campaigns[0]) setCampaignId(campaigns[0].id)
  }, [campaigns.length])

  const notify = (text, tone = 'error') => {
    setToast({ text, tone })
    setTimeout(() => setToast(null), 5000)
  }
  const go = (p, opts = {}) => {
    setPage(p)
    if (opts.leadId !== undefined) setLeadId(opts.leadId)
  }
  const drafts = overview?.drafts_waiting_approval || 0
  const socialWaiting = overview?.social_waiting || 0
  const agent = chat?.chat?.engine || chat?.preferred
  const mailOk = mail?.ready && mail?.hasPassword
  const shared = { campaign, overview, go, notify, openChat: () => setChatOpen(true), mail }

  return (
    <div className={`app ${chatOpen ? 'with-chat' : ''}`}>
      <header className="titlebar">
        <div className="titlebar-brand">
          <Wordmark tone="light" />
        </div>
        <div className="titlebar-mid">
          <span className="badge" title={agent ? `The chat runs on your ${AGENT[agent]}` : 'No agent installed yet'}>
            <span className={`dot ${agent ? 'ok' : ''}`} />
            <span className="mono">{agent ? AGENT[agent] : 'No agent'}</span>
          </span>
          <button className="badge as-btn" onClick={() => go('settings')} title={mailOk ? `Sending from ${mail.mailbox.user}` : 'Connect a mailbox to send email'}>
            <span className={`dot ${mailOk ? (mail.mailbox.auto_send ? 'ok' : 'idle') : 'warn'}`} />
            <span className="mono">{mailOk ? (mail.mailbox.auto_send ? 'Mailbox sending' : 'Mailbox paused') : 'No mailbox'}</span>
          </button>
          {!chatOpen && (
            <button className="badge as-btn" onClick={() => setChatOpen(true)}>
              <span className="mono">Open chat</span>
            </button>
          )}
        </div>
      </header>

      <div className={`shell ${chatOpen ? 'with-chat' : ''}`}>
        <nav className="side" aria-label="Fitscout">
          <label className="camp-pick">
            <span className="eyebrow">Campaign</span>
            {campaigns.length ? (
              <select value={campaign?.id || ''} onChange={(e) => setCampaignId(e.target.value)}>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <span className="camp-none">None yet. Ask in the chat to start one.</span>
            )}
          </label>

          <ul className="nav">
            {NAV.map((n) => (
              <li key={n.id}>
                <button className={page === n.id ? 'on' : ''} aria-current={page === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
                  <span>{n.label}</span>
                  {n.id === 'approve' && drafts > 0 && <span className="count">{drafts}</span>}
                  {n.id === 'social' && socialWaiting > 0 && <span className="count">{socialWaiting}</span>}
                </button>
              </li>
            ))}
          </ul>

          <div className="side-foot">
            {overview && (
              <>
                <Meter label="Email" n={overview.today.emails_sent} cap={overview.today.email_cap} />
                <Meter label="LinkedIn" n={overview.today.linkedin_sent} cap={overview.today.linkedin_cap} />
                <Meter label="Other socials" n={overview.today.social_sent} cap={overview.today.social_cap_each * 4} />
              </>
            )}
          </div>
        </nav>

        <main className="main">
          {page === 'today' && <Today {...shared} />}
          {page === 'leads' && <Leads {...shared} leadId={leadId} setLeadId={setLeadId} />}
          {page === 'approve' && <Approve {...shared} />}
          {page === 'social' && <Social {...shared} />}
          {page === 'settings' && <Settings {...shared} />}
        </main>

        {chatOpen && (
          <ChatPanel
            onClose={() => setChatOpen(false)}
            context={{ page, campaignId: campaign?.id || null, campaignName: campaign?.name || null, leadId: page === 'leads' ? leadId : null }}
            page={page}
            notify={notify}
            go={go}
          />
        )}
      </div>

      {toast && (
        <div className={`toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          {toast.text}
        </div>
      )}
    </div>
  )
}

function Meter({ label, n, cap }) {
  const p = cap ? Math.min(100, Math.round((100 * n) / cap)) : 0
  return (
    <div className="meter">
      <div className="meter-top">
        <span className="mono">{label} today</span>
        <span className="mono">{n}/{cap}</span>
      </div>
      <div className="meter-bar" aria-hidden="true">
        <span style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}
