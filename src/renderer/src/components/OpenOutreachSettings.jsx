import { useEffect, useState } from 'react'
import { call, useData } from '../api'

export default function OpenOutreachSettings({ notify }) {
  const [setup, reload, error] = useData('openOutreachSetup')
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (setup && !form) setForm({ model: setup.model, country: setup.country || 'US', betterContactKey: '', llmKey: '' })
  }, [setup])
  const act = async (method, args) => {
    setBusy(true)
    try {
      await call(method, args)
      if (method === 'saveOpenOutreachSetup') {
        setForm({ ...form, betterContactKey: '', llmKey: '' })
        notify('OpenOutreach settings saved. API keys are encrypted on this PC.', 'ok')
      }
      reload()
    } catch (e) { notify(e.message) } finally { setBusy(false) }
  }
  return (
    <section className="panel set" aria-label="OpenOutreach engine setup">
      <div className="set-head"><h2>OpenOutreach</h2><p className="small dim">Find qualified leads directly from chat. Set this up once, then ask for the people or businesses you want to reach.</p></div>
      {error && <p role="alert">{error}</p>}
      {setup && form ? <>
        <div className="form-row">
          <span className="chip">{setup.installed ? `Engine ${setup.version} installed` : 'Engine not installed'}</span>
          <button className="btn" disabled={busy || setup.install.status === 'running'} onClick={() => act('installOpenOutreach')}>{setup.install.status === 'running' ? 'Installing…' : setup.installed ? 'Repair engine' : 'Install OpenOutreach engine'}</button>
        </div>
        {setup.install.message && <p className="small" role="status">{setup.install.message}</p>}
        <p className="small dim">The first installation downloads Python and OpenOutreach. Lead discovery uses a BetterContact key and a separate model-provider API key. Your chat subscription does not cover that API usage.</p>
        <form onSubmit={(e) => { e.preventDefault(); act('saveOpenOutreachSetup', form) }}>
          <div className="form-grid two">
            <label><span>BetterContact API key {setup.hasBetterContactKey ? '(saved)' : ''}</span><input type="password" autoComplete="off" value={form.betterContactKey} placeholder={setup.hasBetterContactKey ? 'Leave blank to keep saved key' : 'Paste your BetterContact API key'} onChange={(e) => setForm({ ...form, betterContactKey: e.target.value })} /></label>
            <label><span>Model-provider API key {setup.hasLlmKey ? '(saved)' : ''}</span><input type="password" autoComplete="off" value={form.llmKey} placeholder={setup.hasLlmKey ? 'Leave blank to keep saved key' : 'Paste your model-provider API key'} onChange={(e) => setForm({ ...form, llmKey: e.target.value })} /></label>
            <label><span>Provider and model</span><input required value={form.model} placeholder="anthropic:claude-sonnet-4-5-20250929" onChange={(e) => setForm({ ...form, model: e.target.value })} /><span className="small dim">Use a model available in your provider account, in provider:model format.</span></label>
            <label><span>Your country code</span><input required maxLength={2} value={form.country} placeholder="US" onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} /></label>
          </div>
          <div className="form-row"><button className="btn btn-primary" disabled={busy}>Save connection</button><button type="button" className="btn" disabled={busy || (!setup.hasLlmKey && !setup.hasBetterContactKey)} onClick={() => act('clearOpenOutreachKeys')}>Remove saved keys</button></div>
        </form>
        <p className="small dim">Searches show an Allow card with the requested size and email-lookup credits. Nothing sends without your normal outreach approval. OpenOutreach’s contact sharing, registration and newsletter calls are disabled.</p>
        <p className="small" role="status">{setup.ready ? 'Ready. Ask the chat: “Use OpenOutreach to find 10 leads for this campaign.”' : `Still needed: ${setup.missing.join(', ')}.`}</p>
        {setup.jobs.length > 0 && <div><h3>Recent searches</h3>{setup.jobs.slice(0, 5).map((job) => <div key={job.id} className="msg-mini"><strong>{job.campaign_name}</strong><p className="small">{job.status} · {job.imported} new leads · {job.message}</p>{job.status === 'running' && <button className="btn" onClick={() => act('cancelOpenOutreach', { job_id: job.id })}>Stop search</button>}</div>)}</div>}
      </> : <p className="dim">Checking the engine…</p>}
    </section>
  )
}
