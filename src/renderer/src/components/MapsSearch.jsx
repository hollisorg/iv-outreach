import {useState} from 'react'
import {call} from '../api'
export default function MapsSearch({campaign,notify,onDone,initiallyOpen=false}){
 const [open,setOpen]=useState(initiallyOpen),[query,setQuery]=useState(''),[near,setNear]=useState(''),[busy,setBusy]=useState(false)
 const run=async()=>{if(!query.trim())return;setBusy(true);try{const r=await call('searchMaps',{campaign_id:campaign.id,query:near.trim()?`${query.trim()} in ${near.trim()}`:query.trim(),near:near.trim()||undefined});notify(r.found?`Google Maps: ${r.found} businesses, ${r.added} new${r.duplicates?`, ${r.duplicates} already here`:''}.`:r.note||'No listings came back.',r.found?'ok':'error');onDone();if(r.found&&!initiallyOpen)setOpen(false)}catch(e){notify(e.message)}finally{setBusy(false)}}
 if(!open)return <button className="btn btn-primary" onClick={()=>setOpen(true)}>Find on Google Maps</button>
 return <form className="maps-form" onSubmit={e=>{e.preventDefault();run()}}><input autoFocus placeholder="What, e.g. HVAC contractors" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Business type"/><input placeholder="Where, e.g. Dublin, Ohio" value={near} onChange={e=>setNear(e.target.value)} aria-label="Place"/><button className="btn btn-primary" disabled={busy||!query.trim()}>{busy?'Searching…':'Search'}</button>{!initiallyOpen&&<button type="button" className="btn btn-quiet" onClick={()=>setOpen(false)}>Cancel</button>}</form>
}
