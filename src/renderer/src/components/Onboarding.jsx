import { useEffect, useRef, useState } from 'react'
import { newsletterApi, call } from '../api'
import { AgentRows, useAgentSetup } from './AgentSetup'
import PageStage from './PageStage'
import NewsletterBox from './NewsletterBox'

const STEPS = ['Welcome', 'Your business', 'Your agent', 'Your workflow', 'Your control', 'Ready']
const TITLES = ['Make your next connection.', 'Who do you help?', 'Meet your research partner.', 'Choose your first move.', 'Your name. Your say.', 'A clear place to start.']
const ART = ['today', 'leads', 'settings', 'leads', 'approve', 'social']
const TYPES = ['Service business', 'Real estate', 'Insurance', 'Network marketing', 'Agency / consultant', 'Something else']
const GOALS = [['prospects', 'Find business prospects', 'Discover public listings and research why they might fit.'], ['partners', 'Build referral partnerships', 'Find complementary businesses and start useful conversations.'], ['relationships', 'Follow up with my contacts', 'Work with people you know, referrals and people who opted in.']]

export default function Onboarding({ initial, notify, onClose, onFinish }) {
  const [step, setStep] = useState(initial.completedAt ? 0 : initial.step || 0)
  const [profile, setProfile] = useState({ kind: 'Service business', goal: 'prospects', ...initial.profile })
  const [engine, setEngine] = useState('')
  const [create, setCreate] = useState(!initial.existingCampaigns)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checks, setChecks] = useState(null)
  const setup = useAgentSetup()
  const dialog = useRef(null), scroll = useRef(null), heading = useRef(null)
  const change = (key, value) => setProfile(p => ({ ...p, [key]: value }))
  const valid = profile.company?.trim() && profile.offer?.trim() && profile.audience?.trim()
  useEffect(() => {
    dialog.current.showModal()
    call('appSettings').then(s => setEngine(s.chatEngine || ''), e => setError(e.message))
    Promise.all([call('mapsAvailable'), call('getSender'), call('mailStatus')]).then(([maps, sender, mail]) => setChecks({ maps, sender: !sender.missing.length, mailbox: mail.ready && mail.hasPassword }), e => setError(e.message))
  }, [])
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }, [step])
  const run = async fn => { if (busy) return; setBusy(true); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const save = (next, dismiss = false) => call('onboardingSave', { profile, step: next, dismiss })
  const move = next => run(async () => { await save(next); if (step === 2) await call('saveAppSettings', { chatEngine: engine }); setStep(next) })
  const skip = () => run(async () => { await save(step, true); onClose() })
  const finish = target => run(async () => { await call('saveAppSettings', { chatEngine: engine }); const result = await call('onboardingFinish', { profile, createFirstCampaign: create }); onFinish(result, target) })
  return <dialog ref={dialog} className="onboarding" aria-label="Welcome to IV Outreach" onCancel={e => { e.preventDefault(); skip() }}>
    <div className="onboarding-top"><span className="eyebrow">Infinite Variance / Guided setup</span><button className="btn btn-quiet" disabled={busy} onClick={skip}>Save & close ×</button></div>
    <div className="onboarding-scroll" ref={scroll}>
      <div className="onboarding-art"><PageStage key={step} kind={ART[step]} title={step === 0 ? 'Welcome to IV Outreach' : STEPS[step]} kicker={`Step ${step + 1} / ${STEPS.length}`} subtitle={TITLES[step]} /></div>
      <ol className="onboarding-steps" aria-label="Setup progress">{STEPS.map((label, i) => <li key={label} className={i === step ? 'on' : ''}><button disabled={busy || i > step} aria-current={i === step ? 'step' : undefined} onClick={() => move(i)}><b>{i < step ? '✓' : i + 1}</b><span>{label}</span></button></li>)}</ol>
      <section className="onboarding-body" key={step}>
        <h2 ref={heading} tabIndex={-1}>{TITLES[step]}</h2>
        {step === 0 && <><p className="onboarding-lede">A little about your business. Your own AI agent. Then a clear path to your next conversation.</p><div className="onboarding-pillars"><article><b>01 / Discover</b><h3>Find the fit.</h3><p>Research businesses and referral partners using public sources.</p></article><article><b>02 / Connect</b><h3>Make it personal.</h3><p>Turn useful research into drafts you review before sending.</p></article><article><b>03 / Grow</b><h3>Keep it going.</h3><p>Track replies, respect opt-outs and know who to follow up with.</p></article></div><p className="onboarding-note">Your leads stay on this PC. Free discovery works with your own Claude Code or Codex. You can explore without creating an IV account.</p></>}
        {step === 1 && <><p className="onboarding-lede">This becomes your local business brief. You can refine it with your agent later.</p><div className="onboarding-types" role="group" aria-label="Business type">{TYPES.map(type => <button className={profile.kind === type ? 'on' : ''} aria-pressed={profile.kind === type} key={type} onClick={() => change('kind',type)}>{type}</button>)}</div><div className="form-grid two">
          <label><span>Your first name (optional)</span><input value={profile.name || ''} onChange={e => change('name',e.target.value)} maxLength={80} autoComplete="given-name" /></label>
          <label><span>Business name</span><input value={profile.company || ''} onChange={e => change('company',e.target.value)} maxLength={150} autoComplete="organization" required /></label>
          <label className="wide"><span>What do you offer?</span><textarea rows={2} value={profile.offer || ''} onChange={e => change('offer',e.target.value)} placeholder="AI-designed websites and booking systems for local businesses" maxLength={1200} required /></label>
          <label className="wide"><span>Who do you want to help?</span><textarea rows={2} value={profile.audience || ''} onChange={e => change('audience',e.target.value)} placeholder="Owner-operated service businesses that need an easier way to handle enquiries" maxLength={1200} required /></label>
          <label><span>City or region (optional)</span><input value={profile.location || ''} onChange={e => change('location',e.target.value)} placeholder="Columbus, Ohio" maxLength={200} /></label>
          <label><span>Business website (optional)</span><input value={profile.website || ''} onChange={e => change('website',e.target.value)} placeholder="yourbusiness.com" maxLength={300} /></label>
        </div></>}
        {step === 2 && <><p className="onboarding-lede">Use an agent you already have, or install one with its official installer. Sign-in happens with the provider.</p><AgentRows setup={setup} notify={message => { setError(message); notify?.(message) }} /><label className="onboarding-agent-choice"><span>Preferred chat agent</span><select value={engine} onChange={e => setEngine(e.target.value)}><option value="">Use an installed agent automatically</option>{['claude','codex','hermes'].filter(id => setup?.[id]?.installed).map(id => <option key={id} value={id}>{id === 'claude' ? 'Claude Code' : id === 'codex' ? 'Codex' : 'Hermes'}</option>)}</select></label><p className="onboarding-note">No research API key is required. Your agent’s subscription limits and any enabled extra usage still apply. You can finish setup before signing in.</p></>}
        {step === 3 && <><p className="onboarding-lede">Start with one goal. Your agent can help you build from there.</p><div className="onboarding-goals">{GOALS.map(([id,title,about]) => <button key={id} aria-pressed={profile.goal === id} className={profile.goal === id ? 'on' : ''} onClick={() => change('goal',id)}><strong>{title}</strong><span>{about}</span><b aria-hidden="true">{profile.goal === id ? '✓' : '↗'}</b></button>)}</div><div className="onboarding-cost"><div><span className="eyebrow">Start free</span><h3>Your agent + public research</h3><p>Maps discovery, website research, saved leads and drafts. No IV credits.</p></div><div><span className="eyebrow">Coming soon</span><h3>Premium contact data</h3><p>Paid contact data and extra reach will come in a later version. Everything else is free now.</p></div></div></>}
        {step === 4 && <><p className="onboarding-lede">Research can move fast. Sending stays under your control.</p><div className="onboarding-rules"><article><b>Review before sending</b><p>Read and edit drafts, then approve. Social messages are sent by you from the Social list.</p></article><article><b>Use your real identity</b><p>Complete your sender profile and connect your mailbox before email outreach. Setup doesn’t enable sending.</p></article><article><b>Respect the relationship</b><p>Public profiles aren’t consent. Use existing contacts, referrals and opt-in interest for personal outreach. Opt-outs stop follow-ups across campaigns.</p></article></div><div className="onboarding-checks"><span>{checks?.maps ? '✓ Maps tool included' : 'Maps tool not available yet'}</span><span>{checks?.sender ? '✓ Sender profile complete' : 'Sender profile: finish later'}</span><span>{checks?.mailbox ? '✓ Mailbox connected' : 'Mailbox: connect when ready'}</span></div><p className="onboarding-note">Your agent receives the prompts and research you ask it to handle. Optional data providers receive selected lead details only when you approve a paid job.</p></>}
        {step === 5 && <><p className="onboarding-lede">Save your brief and choose where to begin. Nothing is researched, purchased or sent by finishing setup.</p><dl className="onboarding-summary"><div><dt>Business</dt><dd>{profile.company || 'Not added yet'}</dd></div><div><dt>Offer</dt><dd>{profile.offer || 'Not added yet'}</dd></div><div><dt>Audience</dt><dd>{profile.audience || 'Not added yet'}</dd></div><div><dt>First goal</dt><dd>{GOALS.find(g => g[0] === profile.goal)?.[1]}</dd></div></dl>{!valid && <p className="bad">Go back to Your business and add a business name, offer and audience.</p>}{!initial.campaignId && <label className="onboarding-create"><input type="checkbox" checked={create} onChange={e => setCreate(e.target.checked)} /><span>Create a campaign from this brief{initial.existingCampaigns ? ' (keeps your existing campaigns)' : ''}</span></label>}<p className="onboarding-note">You can reopen this guide from Settings → Open guided setup.</p><NewsletterBox api={newsletterApi} variant="card" /></>}
      </section>
    </div>
    {error && <p className="onboarding-error" role="alert">{error}</p>}
    <footer className="onboarding-footer"><span className="mono small">{step + 1} of {STEPS.length} · Stays on this PC</span><div>{step > 0 && <button className="btn" disabled={busy} onClick={() => move(step - 1)}>← Back</button>}{step < 5 ? <button className="btn btn-primary" disabled={busy || (step === 1 && !valid)} onClick={() => move(step + 1)}>{busy ? 'Saving…' : step === 0 ? 'Let’s get started →' : 'Continue →'}</button> : <><button className="btn" disabled={busy || !valid} onClick={() => finish('settings')}>Finish & set up sending</button><button className="btn btn-primary" disabled={busy || !valid} onClick={() => finish(create || initial.existingCampaigns ? 'scanning' : 'today')}>{busy ? 'Saving…' : 'Save & explore →'}</button></>}</div></footer>
  </dialog>
}
