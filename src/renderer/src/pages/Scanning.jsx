import {useEffect,useState} from 'react'
import {useData,when} from '../api'
import BusinessScanner from '../components/BusinessScanner'
import Discovery from '../components/Discovery'
import MapsSearch from '../components/MapsSearch'
import discoveryArt from '../assets/outreach-discovery-v1.png'
import conversationArt from '../assets/outreach-conversation-v1.png'
import heroArt from '../assets/outreach-hero-v1.png'
const MODES=[
 {id:'local',tag:'A city. A market. New possibilities.',title:'Local markets',about:'Explore a place by business type. Bring back public listings to review with your agent.',needs:'A location + business types',art:discoveryArt},
 {id:'agent',tag:'Start with who you want to reach.',title:'Agent research',about:'Let Claude Code or Codex research businesses, check their websites and explain the fit.',needs:'Your campaign + your agent',art:conversationArt},
 {id:'custom',tag:'Follow something specific.',title:'Custom search',about:'Have a niche in mind? Go straight to Maps with your own business search and location.',needs:'A search phrase + a place',art:heroArt},
]
export default function Scanning({campaign,go,notify,openChat}){
 const [mode,setMode]=useState(null),selected=MODES.find(m=>m.id===mode)
 useEffect(()=>{document.querySelector('main')?.scrollTo({top:0})},[mode])
 return <div className={`page scanning-page ${mode?'scan-tool-page':'scan-gallery-page'}`}>
  {!selected?<>
   <header className="scan-stage" style={{'--scan-art':`url("${discoveryArt}")`}}><div className="scan-stage-orbit" aria-hidden="true"/><div><p className="eyebrow">Infinite Variance / Discovery</p><h1>Scanning</h1><p>Find your next conversation.</p></div></header>
   <div className="scan-intro"><h2>Choose where to look.</h2><p>Three ways to discover real businesses. Your leads stay on this PC.</p></div>
   <div className="scan-workflow-cards">{MODES.map(m=><button key={m.id} className="scan-workflow-card" aria-label={m.title} onClick={()=>setMode(m.id)} style={{'--scan-art':`url("${m.art}")`}}><span className="scan-card-art" aria-hidden="true"/><span className="eyebrow">{m.tag}</span><strong>{m.title}</strong><span className="scan-card-about">{m.about}</span><span className="scan-card-needs"><b>Needs</b> {m.needs}</span><span className="scan-card-footer">Free discovery <i aria-hidden="true">↗</i></span></button>)}</div>
  </>:<header className="scan-tool-head"><button className="btn btn-quiet" onClick={()=>setMode(null)}>← All scans</button><div><p className="eyebrow">Free discovery / {selected.tag}</p><h1>{selected.title}</h1><p>{selected.about}</p></div></header>}
  {!campaign?<div className="scan-empty"><h2>Every search starts with a brief.</h2><p>Create a campaign with your agent, then choose where to look.</p><button className="btn btn-primary" onClick={openChat}>Open my agent</button></div>:<ScanWorkspace key={campaign.id} {...{campaign,go,notify,openChat,mode}}/>}
 </div>
}
function ScanWorkspace({campaign,go,notify,openChat,mode}){
 const [state,reload]=useData('scannerState',{campaign_id:campaign.id})
 const history=state?.history||[],running=state?.running
 return <>
  {mode&&<><div className="scan-context"><div><span className="eyebrow">Campaign</span><strong>{campaign.name}</strong></div><button className="btn btn-quiet" onClick={()=>go('leads')}>View leads ↗</button></div>
   <div className={`scan-workspace ${running?'is-scanning':''}`}>
    {mode==='local'&&<BusinessScanner {...{campaign,notify,openChat,go}} onDone={reload}/>}
    {mode==='agent'&&<Discovery campaign={campaign} openChat={openChat}/>}
    {mode==='custom'&&<section className="discovery-panel"><p className="eyebrow">Your own search</p><h2>Follow a specific lead.</h2><MapsSearch campaign={campaign} notify={notify} onDone={reload} initiallyOpen/><p className="small dim">Public Maps listings. No IV credits used. Results go to Leads for review.</p></section>}
   </div></>}
  {running&&<div className="scan-live" role="status"><span className="scan-live-line"/><strong>Exploring {running.area||'your market'}</strong><p className="small dim">{state?.categories?.[running.current]||'Starting'} · {running.completed||0} of {running.categories?.length||1} categories checked</p></div>}
  {!mode&&<section className="scan-log" aria-label="Discovery activity"><div className="scan-log-head"><p className="eyebrow">Your discovery trail</p><button className="btn btn-quiet" onClick={()=>go('leads')}>View leads ↗</button></div>
   {!history.length?<p className="scan-log-empty">No scans yet. Choose a workflow above to start exploring.</p>:history.slice(0,5).map(h=><div className="scan-log-row" key={h.id}><span className={`scan-run-dot ${h.state}`}/><div><strong>{h.area}</strong><small>{h.categories.map(c=>state.categories[c]).join(' · ')}</small>{h.error&&<small role="alert">{h.error}</small>}</div><span className="mono">{h.results.reduce((n,r)=>n+r.added,0)} added</span><span className="scan-run-state">{h.state} · {when(h.at)}</span></div>)}
  </section>}
 </>
}
