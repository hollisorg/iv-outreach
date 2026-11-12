import signal from '../assets/outreach-hero-v1.png'
import discovery from '../assets/outreach-discovery-v1.png'
import connection from '../assets/outreach-conversation-v1.png'
import approval from '../assets/outreach-approval-v1.png'
export const BRAND_COVERS = { signal, discovery, connection, approval }
export const brandCover = business => business?.art?.cover || BRAND_COVERS[business?.profile?.cover_preset] || signal
export function BrandMark({ business, large=false }) {
  return <span className={`brand-mark ${large?'large':''}`} style={{'--brand-color':business?.profile?.accent || '#f19dac'}}>{business?.art?.logo?<img src={business.art.logo} alt=""/>:<span>{(business?.name || 'Your business').split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()}</span>}</span>
}
export function BrandPreview({ business }) {
  return <div className="brand-preview" style={{backgroundImage:`linear-gradient(0deg,#100c0ef5,transparent),url("${brandCover(business)}")`}}><BrandMark business={business} large/><div><span className="eyebrow">Your business</span><h3>{business?.name || 'Your brand, right here.'}</h3><p>{business?.profile?.offer || 'A familiar home for every new connection.'}</p></div></div>
}
