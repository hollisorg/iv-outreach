import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useData, call, on } from './api'
import Onboarding from './components/Onboarding'
import WorkspaceHub from './components/WorkspaceHub'
import { BrandMark } from './components/BrandIdentity'
import GuideHost from './components/GuideHost'
import { startGuide } from './guides'
import WorkspaceDialog from './components/WorkspaceDialog'
import { useAppUpdates } from './components/AppUpdates'
import ChatPanel from './components/ChatPanel'
import { Wordmark } from './components/Logo'
import Today from './pages/Today'
import Leads from './pages/Leads'
import Approve from './pages/Approve'
import Social from './pages/Social'
import Settings from './pages/Settings'
import Scanning from './pages/Scanning'

const NAV = [
  { id: 'today', label: 'Today' },
  { id: 'scanning', label: 'Scanning' },
  { id: 'leads', label: 'Leads' },
  { id: 'approve', label: 'Approve' },
  { id: 'social', label: 'Social' },
  { id: 'settings', label: 'Settings' },
]
const AGENT = { claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes' }

export default function App() {
  const [update] = useAppUpdates()
  const [page, setPage] = useState('today')
  const [chatOpen, setChatOpen] = useState(true)
  const [chatWindow, setChatWindow] = useState({detached:false})
  const [onboarding, setOnboarding] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [businessId, setBusinessId] = useState(undefined)
  const [campaignId, setCampaignId] = useState(undefined)
  const [hubOpen,setHubOpen] = useState(false)
  const [workspaceDialog, setWorkspaceDialog] = useState(null)
  const [leadId, setLeadId] = useState(null)
  const [toast, setToast] = useState(null)
  const [workspace, reloadWorkspace] = useData('workspaceState')
  const businesses = workspace?.businesses || []
  const chosenBusinessId = businessId === undefined ? workspace?.businessId : businessId
  const business = businesses.find(b => b.id === chosenBusinessId) || (businessId === undefined ? businesses[0] : null)
  const [overview] = useData('overview', { business_id: business?.id || '__none__' })
  const [chat] = useData('chatStatus')
  const [mail] = useData('mailStatus')
  const campaigns = overview?.campaigns || []
  const selectedCampaignId = campaignId === undefined ? workspace?.campaignId : campaignId
  const campaign = campaigns.find(c => c.id === selectedCampaignId) || campaigns[0] || null
  const selectWorkspace = (id, campaign = null) => {
    setBusinessId(id); setCampaignId(campaign); setLeadId(null)
    call('workspaceSelect', { businessId: id, campaignId: campaign }).catch(e => notify(e.message))
  }
  useEffect(() => {
    if (business?.id && campaign?.id) call('workspaceSelect', { businessId: business.id, campaignId: campaign.id }).catch(e => notify(e.message))
  }, [business?.id, campaign?.id])

  useEffect(() => { document.querySelector('main')?.scrollTo({top:0}) }, [page])

  const notify = (text, tone = 'error') => {
    setToast({ text, tone })
    setTimeout(() => setToast(null), 5000)
  }
  const go = (p, opts = {}) => {
    setPage(p)
    if (opts.leadId !== undefined) setLeadId(opts.leadId)
  }
  useEffect(() => {
    call('chatWindowState').then(setChatWindow)
    const off = on('chat:window', state => { setChatWindow(state); if (state.returned) setChatOpen(true) })
    call('onboardingStatus').then(state => { setOnboarding(state); setShowOnboarding(state.showOnLaunch) }).catch(e => notify(e.message))
    const handoff = e => { setChatOpen(true); call('chatHandoff',e.detail).catch(e => notify(e.message)) }
    window.addEventListener('fs:ask', handoff)
    return () => { off(); window.removeEventListener('fs:ask', handoff) }
  }, [])
  useEffect(() => { call('chatSetContext', { page, businessId: business?.id || null, businessName: business?.name || null, campaignId: campaign?.id || null, campaignName: campaign?.name || null, leadId: page === 'leads' ? leadId : null }).catch(e => notify(e.message)) }, [page, business?.id, business?.name, campaign?.id, campaign?.name, leadId])
  const docked = chatOpen && !chatWindow.detached
  const openOnboarding = async () => { try { setOnboarding(await call('onboardingStatus')); setShowOnboarding(true) } catch(e) { notify(e.message) } }
  const drafts = overview?.drafts_waiting_approval || 0
  const socialWaiting = overview?.social_waiting || 0
  const agent = chat?.chat?.engine || chat?.preferred
  const mailOk = mail?.ready && mail?.hasPassword
  // Mount the chat before callers dispatch their fs:ask event, including when it was closed.
  const shared = { business, businesses, addBusiness: () => setWorkspaceDialog('business'), editBusiness: () => setWorkspaceDialog('edit-business'), addCampaign: () => setWorkspaceDialog('campaign'), selectWorkspace, campaign, overview, go, notify, openChat: () => { flushSync(() => setChatOpen(true)); if (chatWindow.detached) call('chatFocus').catch(e => notify(e.message)) }, openOnboarding, mail }

  return (
    <div className={`app ${docked ? 'with-chat' : ''}`}>
      <header className="titlebar">
        <div className="titlebar-brand">
          <Wordmark tone="light" />
        </div>
        <div className="titlebar-mid">
          <button className="help-launch" aria-label="How this works" title="Take a guided tour of this page" onClick={()=>startGuide(page)}><b aria-hidden="true">?</b><span>How this works</span><i className="help-beacon" aria-hidden="true"/></button>
          {['available', 'ready'].includes(update?.phase) && <button className="badge as-btn update-badge" onClick={() => { go('settings'); requestAnimationFrame(() => document.getElementById('setup-updates')?.scrollIntoView({block:'start'})) }}><span className="dot ok"/><span className="mono">{update.phase === 'ready' ? 'Update ready' : 'Update available'}</span></button>}
          <span className="badge" title={agent ? `The chat runs on your ${AGENT[agent]}` : 'No agent installed yet'}>
            <span className={`dot ${agent ? 'ok' : ''}`} />
            <span className="mono">{agent ? AGENT[agent] : 'No agent'}</span>
          </span>
          <button className="badge as-btn" onClick={() => go('settings')} title={mailOk ? `Sending from ${mail.mailbox.user}` : 'Connect a mailbox to send email'}>
            <span className={`dot ${mailOk ? (mail.mailbox.auto_send ? 'ok' : 'idle') : 'warn'}`} />
            <span className="mono">{mailOk ? (mail.mailbox.auto_send ? 'Mailbox sending' : 'Mailbox paused') : 'No mailbox'}</span>
          </button>
          {(!chatOpen || chatWindow.detached) && (
            <button className="badge as-btn" onClick={shared.openChat}>
              <span className="mono">{chatWindow.detached ? 'Show chat window ↗' : 'Open chat'}</span>
            </button>
          )}
        </div>
      </header>

      <div className={`shell ${docked ? 'with-chat' : ''}`}>
        <nav className="side" aria-label="IV Outreach">
          <div className="side-purpose"><span className="eyebrow">Make your next connection.</span><p>Your people.<br/>Your possibilities.</p></div>

          <ul className="nav">
            {NAV.map((n, i) => (
              <li key={n.id}>
                <button className={page === n.id ? 'on' : ''} aria-current={page === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
                  <span className="nav-label"><span className="nav-no" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{n.label}</span>
                  {n.id === 'approve' && drafts > 0 && <span className="count">{drafts}</span>}
                  {n.id === 'social' && socialWaiting > 0 && <span className="count">{socialWaiting}</span>}
                </button>
              </li>
            ))}
          </ul>

          <div className="side-foot">
            <p className="eyebrow">All businesses / Today</p>
            {overview && (
              <>
                <Meter label="Email" n={overview.today.emails_sent} cap={overview.today.email_cap} />
                <Meter label="LinkedIn" n={overview.today.linkedin_sent} cap={overview.today.linkedin_cap} />
                <Meter label="Other socials" n={overview.today.social_sent} cap={overview.today.social_cap_each * 4} />
              </>
            )}
            <p className="side-brand mono">Infinite Variance / Outreach</p>
          </div>
        </nav>

        <main className="main">
          <div className="workspace-strip" data-guide="workspace"><button className="workspace-brand" onClick={()=>setHubOpen(true)} aria-label="Switch business or outreach plan"><BrandMark business={business}/><span><small>{business?'Business':'Start here'}</small><strong>{business?.name||'Add your business'}</strong></span><span aria-hidden="true">⌄</span></button><span className="workspace-divider" aria-hidden="true">/</span><button className="workspace-plan" onClick={()=>setHubOpen(true)}><small>Outreach plan <span className="dim">· Campaign</span></small><strong>{campaign?.name||'Create your first plan'} <span aria-hidden="true">↗</span></strong></button></div>
          {page === 'today' && <Today {...shared} />}
          {page === 'scanning' && <Scanning {...shared} />}
          {page === 'leads' && <Leads {...shared} leadId={leadId} setLeadId={setLeadId} />}
          {page === 'approve' && <Approve {...shared} />}
          {page === 'social' && <Social {...shared} />}
          {page === 'settings' && <Settings {...shared} />}
        </main>

        {docked && (
          <ChatPanel
            onClose={() => setChatOpen(false)}
            onPopOut={() => call('chatPopOut').catch(e => notify(e.message))}
            context={{ page, businessId: business?.id || null, businessName: business?.name || null, campaignId: campaign?.id || null, campaignName: campaign?.name || null, leadId: page === 'leads' ? leadId : null }}
            page={page}
            notify={notify}
            go={go}
          />
        )}
      </div>

      {showOnboarding && onboarding && <Onboarding initial={onboarding} notify={notify} onClose={() => setShowOnboarding(false)} onFinish={(state, target) => { setOnboarding(state); setShowOnboarding(false); reloadWorkspace(); if (state.businessId) selectWorkspace(state.businessId, state.campaignId || null); go(target) }} />}
      <GuideHost page={page} go={go} notify={notify} modalOpen={hubOpen||!!workspaceDialog||showOnboarding}/>
      {hubOpen&&<WorkspaceHub business={business} businesses={businesses} campaign={campaign} selectWorkspace={selectWorkspace} onClose={()=>setHubOpen(false)} onAddBusiness={()=>{setHubOpen(false);setWorkspaceDialog('business')}} onAddCampaign={id=>{selectWorkspace(id);setHubOpen(false);setWorkspaceDialog('campaign')}} onEdit={id=>{selectWorkspace(id);setHubOpen(false);setWorkspaceDialog('edit-business')}}/>}
      {workspaceDialog && <WorkspaceDialog kind={workspaceDialog} business={business} onClose={() => setWorkspaceDialog(null)} onCreated={(id, createdCampaignId) => { reloadWorkspace(); selectWorkspace(id, createdCampaignId === undefined ? (id===business?.id?campaign?.id:null) : createdCampaignId); setWorkspaceDialog(null); notify(workspaceDialog === 'edit-business' ? 'Business updated.' : workspaceDialog === 'business' ? 'Your business is ready.' : 'Your outreach plan is ready.', 'ok') }} />}
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
