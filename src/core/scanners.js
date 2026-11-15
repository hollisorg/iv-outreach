// Category scans over IV's local Maps source: saved searches, history and deduplication.
// No paid Google Places and no made-up intent or urgency scores.
import { searchGoogleMaps } from './gmaps.js'
import { getCampaign } from './campaigns.js'
import { getSetting,setSetting,tx,now,newId } from './db.js'
export const SCAN_CATEGORIES={home_services:'Home services',cleaning:'Cleaning companies',water_treatment:'Water treatment companies',restaurants:'Restaurants',coffee:'Coffee shops',hotels:'Hotels',gyms:'Gyms',salons:'Salons',dental:'Dental practices',auto_shops:'Auto repair shops',property_management:'Property management companies',professional_services:'Professional services'}
const key=cid=>`business_scanner:${cid}`
function campaign(db,cid){const c=getCampaign(db,cid);if(!c)throw new Error('Choose a campaign.');return c}
function valid(input){
  const area=String(input.area||'').trim();if(!area||area.length>160||/[\r\n]/.test(area))throw new Error('Enter a city and state or region.')
  if(!Array.isArray(input.categories)||!input.categories.length||input.categories.length>3||input.categories.some(c=>!Object.hasOwn(SCAN_CATEGORIES,c)))throw new Error('Choose 1–3 business categories.')
  const limit=input.limit??10;if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error('Choose 1–20 listings per category.')
  return {area,categories:[...new Set(input.categories)],limit}
}
export function scannerState(db,cid){campaign(db,cid);const s={categories:SCAN_CATEGORIES,...getSetting(db,key(cid),{saved:[],history:[]})};if(s.running&&Date.now()-s.running.at>=20*60e3)delete s.running;return s}
export function saveScan(db,input){campaign(db,input.campaign_id);const spec=valid(input),name=String(input.name||`${spec.categories.map(c=>SCAN_CATEGORIES[c]).join(', ')} · ${spec.area}`).trim().slice(0,160)
  return tx(db,()=>{const s=scannerState(db,input.campaign_id);if(s.saved.length>=30)throw new Error('Remove a saved search before adding another.');const record={id:newId(),name,...spec};s.saved.push(record);delete s.categories;setSetting(db,key(input.campaign_id),s);return record})
}
export function removeScan(db,cid,id){return tx(db,()=>{const s=scannerState(db,cid);s.saved=s.saved.filter(x=>x.id!==id);delete s.categories;setSetting(db,key(cid),s);return true})}
export async function runScan(db,input,{search=searchGoogleMaps}={}){
  const c=campaign(db,input.campaign_id);if(c.status!=='active')throw new Error('Choose an active campaign.');const spec=valid(input),runId=newId()
  // Persist a lease so chat and UI cannot accidentally launch overlapping batch scans.
  tx(db,()=>{const s=scannerState(db,c.id);if(s.running)throw new Error('A business scan is already running.');s.running={id:runId,at:Date.now(),area:spec.area,categories:spec.categories,completed:0};delete s.categories;setSetting(db,key(c.id),s)})
  const record={id:runId,...spec,at:now(),results:[],state:'complete',provider_credits:0}
  try{
    for(const category of spec.categories){
      tx(db,()=>{const s=scannerState(db,c.id);if(s.running?.id===runId){s.running.current=category;s.running.completed=record.results.length;delete s.categories;setSetting(db,key(c.id),s)}})
      const latest=campaign(db,c.id);if(latest.status!=='active')throw new Error('Campaign is no longer active; scan stopped.')
      const result=await search(db,{campaign_id:c.id,query:`${SCAN_CATEGORIES[category]} in ${spec.area}`,near:spec.area,limit:spec.limit})
      record.results.push({category,found:result.found,added:result.added,duplicates:result.duplicates,suppressed:result.suppressed||0,note:result.note||null})
    }
  }catch(e){record.state=record.results.length?'partial':'failed';record.error=String(e.message).slice(0,350)}
  finally{tx(db,()=>{const s=scannerState(db,c.id);s.history=[record,...s.history].slice(0,30);if(s.running?.id===runId)delete s.running;delete s.categories;setSetting(db,key(c.id),s)})}
  return {...record,note:'Public listings are candidates. Ask your agent to check each website and campaign fit. No buying intent is inferred and nothing was sent.'}
}
