// Stable, named places shared by the visual guide and the agent. No arbitrary selectors from agents.
export const PLACES = {
  iv_workspace:{page:'today',selector:'.ivw-launch',title:'Continue across IV apps',text:'Hivemind connects business profiles and creative handoffs locally. Prepare a brief in Outreach, create in Studio, then review an unapproved draft in Signal.'},
  opportunity:{page:'scanning',selector:'[data-guide="scan-opportunity"]',fallback:'.scanning-page',title:'Find a useful opportunity',text:'Choose Opportunity scan, pick a lead with a website, then review source evidence and Lighthouse findings. Free local scans do not spend IV credits or establish buying intent.'},
  watchlists:{page:'scanning',selector:'[data-guide="scan-watch"]',fallback:'.scanning-page',title:'Watch for a useful change',text:'Save a business page or RSS feed. Check now saves a baseline, then compares later content. It never sends a follow-up for you.'},
  content_briefs:{page:'scanning',selector:'[data-guide="scan-brief"]',fallback:'.scanning-page',title:'Create an IV content brief',text:'Combine your brand, campaign and evidence into a draft. Copy or export it for IV Studio and IV Signal, then review before creating or publishing.'},
  workspace:{page:'today',selector:'[data-guide="workspace"]',title:'Your business and outreach plan',text:'Choose your business here, then open or create an outreach plan. A campaign is simply one plan with its own goal, audience and leads.'},
  business_brand:{page:'settings',selector:'[data-guide="brand-art"]',fallback:'#setup-businesses',title:'Make your business recognizable',text:'Edit your business to add a logo, a cover graphic and a brand color. Images stay on this PC. Each business can have its own look.'},
  business_profile:{page:'settings',selector:'#setup-businesses',title:'Your business brief',text:'Describe what you offer, who you help and where you want to grow. Your agent uses the selected business when it researches and drafts.'},
  today:{page:'today',selector:'.outreach-search',title:'Start with a conversation',text:'Describe who you want to reach in plain language. Your own Claude Code or Codex helps turn that into useful research.'},
  scanning:{page:'scanning',selector:'.scan-workflow-cards',fallback:'.scanning-page',title:'Choose a way to discover',text:'Explore a local market, ask your agent to research, or search Maps directly. Public listings are starting points; your agent checks fit.'},
  leads:{page:'leads',selector:'.page-toolbar',fallback:'.leads .empty',title:'Meet your leads',text:'A lead is a person or business you might help. Open a lead to review its website, research, fit and contact details before reaching out.'},
  approve:{page:'approve',selector:'.page-toolbar',fallback:'.approve .empty',title:'You have the final say',text:'Read draft messages here. Approval lets email enter your connected mailbox’s sending queue. Social messages stay manual.'},
  social:{page:'social',selector:'.social-guide',fallback:'.social',title:'Make the connection yourself',text:'Open the profile, paste your approved note and send it yourself. Then mark it sent so your follow-up history stays useful.'},
  agent:{page:'settings',selector:'#setup-agent',title:'Bring your own agent',text:'Use your own Claude Code, Codex or Hermes account. Free discovery does not require a paid data-provider account.'},
  premium:{page:'settings',selector:'#setup-premium',title:'Optional extra reach',text:'Premium offers paid data services through credits. Review the quoted maximum before approving a paid job. Free research remains available.'},
  sender:{page:'settings',selector:'#setup-sender',title:'Who your outreach comes from',text:'Your real sender details appear on emails. Sender identity and mailbox are currently shared across businesses on this PC; review them before sending for another brand.'},
  mailbox:{page:'settings',selector:'#setup-mailbox',title:'Connect your mailbox',text:'Connect the mailbox you want to send from. You control whether approved email sends automatically. Your mailbox password is hidden from visual chat guidance.'},
  connections:{page:'settings',selector:'#setup-connections',title:'Work with your other agents',text:'Connect this local workspace to your other agent apps. Your leads and campaign records stay in the same place.'},
  boundaries:{page:'settings',selector:'#setup-boundaries',title:'Respect the no',text:'The do-not-contact list applies across all your businesses and campaigns. Any reply stops pending follow-ups.'},
}
export const GUIDES = {
  today:['iv_workspace','workspace','today','scanning','leads','approve','social','agent','sender','mailbox','premium','boundaries'],
  scanning:['workspace','scanning','opportunity','watchlists','content_briefs','leads'],leads:['workspace','leads','approve'],approve:['approve','sender','mailbox'],social:['social','boundaries'],
  settings:['business_brand','business_profile','agent','premium','sender','mailbox','connections','boundaries'],
}
export const startGuide = page => window.dispatchEvent(new CustomEvent('iv:guide',{detail:{steps:GUIDES[page]||GUIDES.today}}))
export const guidePlaces = () => Object.entries(PLACES).map(([id,{page,title,text}])=>({id,page,title,about:text}))
