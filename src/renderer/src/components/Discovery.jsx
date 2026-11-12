import { useState } from 'react'
import { askAgent, useData } from '../api'

export default function Discovery({ campaign, openChat }) {
  const [count, setCount] = useState(5)
  const [depth, setDepth] = useState('standard')
  const [plan, , error] = useData('researchPlan', { campaign_id: campaign.id, count, depth }, [campaign.id, count, depth])
  const start = () => {
    openChat()
    askAgent({ send: true, text: `Research ${count} new prospects for campaign ${campaign.id} using ${depth} research. Start with fitscout_research_plan and execute its public-source plan using your own web search and IV Outreach Maps/website tools. Verify each business on its own website, avoid existing leads and exclusions, add matches, and use fitscout_save_research for sourced observations, potential opportunity, unknowns and fit. Stop at the plan budget and report any shortfall. Use my existing agent only, no paid data providers or API keys. Do not draft, approve or send anything.` })
  }
  return <section className="discovery-panel" aria-label="Find leads with your agent">
    <p className="eyebrow">Your agent. Your research.</p>
    <h2>Find your next conversation</h2>
    <p>Claude Code or Codex searches public sources, checks each business’s website and saves the reasons it fits <strong>{campaign.name}</strong>.</p>
    <div className="form-grid two">
      <label><span>New prospects</span><select aria-label="New prospects" value={count} onChange={e => setCount(Number(e.target.value))}>{[5,10,25].map(n=><option key={n} value={n}>{n} prospects</option>)}</select></label>
      <label><span>Research depth</span><select aria-label="Research depth" value={depth} onChange={e=>setDepth(e.target.value)}><option value="quick">Quick · first pass</option><option value="standard">Standard · verify fit</option><option value="deep">Deep · more context</option></select></label>
    </div>
    {plan?.queries?.length > 0 && <p className="small dim">Starting searches: {plan.queries.slice(0,3).join(' · ')}</p>}
    <p className="small dim">No additional API key or data subscription. Uses your agent plan and its usage limits. Public information may not include a named contact or email; unknowns stay marked.</p>
    {error && <p role="alert">{error} Ask your agent to finish the campaign brief.</p>}
    <button className="btn btn-primary" disabled={!plan || !!error} onClick={start}>Research with my agent</button>
    <p className="small dim">Results appear here as your agent works. Stop the chat to stop research. Nothing is sent.</p>
  </section>
}
