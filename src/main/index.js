import { workspaceHost } from '../service/iv-workspace-host.js'
import { app, BrowserWindow, ipcMain, shell, clipboard, dialog, safeStorage, nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { join, dirname } from 'node:path'
import { existsSync, writeFileSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import * as fs from '../core/index.js'
import { findHarnesses, codexWindow } from '../service/harness.js'
import { findHermes } from '../service/hermesacp.js'
import { AGENT_INFO, runInstall, openSignIn, signedIn } from '../service/agentinstall.js'
import { AGENT_NAMES } from '../service/agentrun.js'
import {
  startChatTurn, newChat, applyChatEvent, applyUsage, saveChat, loadChat, listChats, pruneChats,
  attachmentOf, withAttachments, MAX_ATTACH, ATTACH_EXTENSIONS,
} from '../service/agentchat.js'
import { skillMarkdown, pasteMessage } from '../service/agent.js'
import { PremiumClient, startPremiumBridge } from '../service/premium.js'

import { startUiBridge, UI_SNAPSHOT, MASK_SCREEN, UNMASK_SCREEN } from '../service/ui-guide.js'
import { PLACES, guidePlaces } from '../renderer/src/guides.js'
import { importBrandImage, brandImage } from '../service/brand-assets.js'
import { tx } from '../core/db.js'
import { onboardingStatus, saveOnboarding, finishOnboarding } from '../service/onboarding.js'
import updaterPackage from 'electron-updater'
import { AppUpdates } from '../service/updates.js'
import { createLeadPreview, webDestination } from '../service/lead-preview.js'
import * as growth from '../core/opportunities.js'
import {runOpportunityAudit,stopOpportunityAudit,auditBrowser} from '../service/opportunity-audit.js'
import {MailOAuth} from '../service/mail-oauth.js'

const leadPreview = createLeadPreview(nativeImage)

const here = dirname(fileURLToPath(import.meta.url))
let db
let win
let chatWindow = null
let chatContext = { page: 'today' }
let composer = { text: '', files: [], engine: null, tab: 'chat' }
const chatWindowState = () => ({ detached: !!chatWindow && !chatWindow.isDestroyed(), context: chatContext })
let openOutreachSelection = null
let premiumBridgeServer = null
let uiBridgeServer = null
let inspectingUi = false
let appUpdates = null
let updateTimer = null
let updateStartup = null
const updatesStatus = () => ({ ...(appUpdates?.status() || { version: app.getVersion(), phase: 'idle', message: 'Starting update service…' }), automaticChecks: readSettings().automaticUpdateChecks !== false })
const guideRequests = new Map()
async function inspectUi({screenshot=true}={}) {
  if(readSettings().visualGuidanceEnabled===false)throw new Error('Visual guidance is disabled in Settings > Your agent.')
  if(!win||win.isDestroyed())throw new Error('Open the Outreach workspace first.')
  if(inspectingUi)throw new Error('A visual inspection is already running; try again in a moment.')
  inspectingUi=true
  try {
    const snapshot=await win.webContents.executeJavaScript(UI_SNAPSHOT)
    const result={context:chatContext,...snapshot}
    if(screenshot){
      await win.webContents.executeJavaScript(MASK_SCREEN)
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      result.image=(await win.webContents.capturePage()).resize({width:1280}).toPNG().toString('base64')
      result.imageNote='Current IV Outreach window only. Input fields, chat and code blocks are covered. No other apps are captured.'
    }
    return result
  }finally{try{if(win&&!win.isDestroyed())await win.webContents.executeJavaScript(UNMASK_SCREEN)}finally{inspectingUi=false}}
}
async function showUi({place,say}) {
  if(!Object.hasOwn(PLACES,place))throw new Error('Choose a place from fitscout_list_places.')
  if(say!==undefined&&(typeof say!=='string'||say.length>600))throw new Error('Keep the explanation under 600 characters.')
  if(!win||win.isDestroyed())throw new Error('Open the Outreach workspace first.')
  if(guideRequests.size)throw new Error('A guide is already opening; try again in a moment.')
  const requestId=randomUUID()
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{guideRequests.delete(requestId);reject(new Error('The app did not confirm the highlight. Try again when the workspace is ready.'))},6000)
    guideRequests.set(requestId,{resolve,reject,timer})
    if(win.isMinimized())win.restore();win.show();win.focus()
    win.webContents.send('ui:guide',{requestId,place,say})
  })
}

function getDb() {
  if (!db) db = fs.openDb()
  return db
}

const send = (channel, payload) => {
  for (const target of [win, chatWindow]) if (target && !target.isDestroyed()) target.webContents.send(channel, payload)
}

// How agents launch our MCP server: the app's own Electron binary runs it in Node mode, so nobody needs Node.js.
function mcpCommand({ visual = false } = {}) {
  const script = app.isPackaged
    ? join(process.resourcesPath, 'app.asar', 'out', 'main', 'mcp.js')
    : join(here, 'mcp.js')
  const env = { ELECTRON_RUN_AS_NODE: '1', ...(visual&&uiBridgeServer?{FITSCOUT_UI_URL:uiBridgeServer.url,FITSCOUT_UI_TOKEN:uiBridgeServer.token}:{}) }
  if (process.env.FITSCOUT_DATA_DIR) env.FITSCOUT_DATA_DIR = process.env.FITSCOUT_DATA_DIR
  return { command: process.execPath, args: [script], env }
}

const claudeConfigPath = () => join(process.env.APPDATA || app.getPath('appData'), 'Claude', 'claude_desktop_config.json')

const isLinkedinProfile = (url) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && /(^|\.)linkedin\.com$/i.test(u.hostname) && /^\/(in|company)\//i.test(u.pathname)
  } catch {
    return false
  }
}
// Social links the app may open in the browser: profiles and DM links on the platforms IV Outreach drafts for.
const SOCIAL_HOSTS = /(^|\.)(linkedin\.com|facebook\.com|m\.me|instagram\.com|ig\.me|x\.com|twitter\.com|tiktok\.com|youtube\.com|threads\.net|pinterest\.com)$/i
const isSocialLink = (url) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && SOCIAL_HOSTS.test(u.hostname)
  } catch {
    return false
  }
}

// --- Mailbox password: encrypted with the OS (DPAPI on Windows) through safeStorage, never written in plain text ---
function mailPassword() {
  const enc = readSettings().mailPassEnc
  if (!enc || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

// --- The mail worker: while the app is open, sends one approved email at a time at a human pace (within the daily
// cap), and checks the inbox for replies every few minutes ---
let mailState = { lastSend: null, lastCheck: null, error: null, busy: false }
let transport = null
let transportKey = null
async function mailTick({ force = false } = {}) {
  if (mailState.busy) return mailState
  const mb = fs.getMailbox(getDb())
  const pw = mailPassword()
  const oauth=mailOAuth.status().connected
  if ((!oauth&&(!fs.mailboxReady(mb)||!pw)) || (!mb.auto_send && !force)) return mailState
  mailState.busy = true
  try {
    const key = JSON.stringify([mb.smtp_host, mb.smtp_port, mb.smtp_secure, mb.user])
    if (!transport || key !== transportKey) {
      transport = fs.makeTransport(mb, pw)
      transportKey = key
    }
    const r = await fs.sendNext(getDb(), oauth?mailOAuth.transport():transport, { minGapSeconds: mb.min_gap_seconds })
    mailState.lastSend = { at: new Date().toISOString(), ...r }
    mailState.error = r.error || null
    if (r.sent || r.error) send('data:changed', { tool: 'mail' })
  } catch (e) {
    mailState.error = e.message
  } finally {
    mailState.busy = false
  }
  return mailState
}
let checking = false
async function replyTick() {
  const mb = fs.getMailbox(getDb())
  const pw = mailPassword()
  const oauth=mailOAuth.status().connected
  if (checking || (!oauth&&(!fs.mailboxReady(mb)||!pw))) return null
  checking = true
  try {
    const r = oauth?await mailOAuth.checkReplies(getDb()):await fs.checkReplies(getDb(), fs.makeImap(mb, pw))
    mailState.lastCheck = { at: new Date().toISOString(), ...r }
    if (r.replies || r.bounces) send('data:changed', { tool: 'replies' })
    return r
  } catch (e) {
    mailState.lastCheck = { at: new Date().toISOString(), error: e.message }
    return mailState.lastCheck
  } finally {
    checking = false
  }
}

// --- Settings kept beside the database (chat engine, models, names) ---
const settingsFile = () => join(fs.defaultDataDir(), 'app-settings.json')
function readSettings() {
  try {
    return JSON.parse(readFileSync(settingsFile(), 'utf8'))
  } catch {
    return {}
  }
}
function writeSettings(patch) {
  const next = { ...readSettings(), ...patch }
  mkdirSync(dirname(settingsFile()), { recursive: true })
  writeFileSync(settingsFile(), JSON.stringify(next, null, 1))
  return next
}

const mailOAuth=new MailOAuth({
  read:()=>{const enc=readSettings().mailOAuthEnc;if(!enc||!safeStorage.isEncryptionAvailable())return null;try{return JSON.parse(safeStorage.decryptString(Buffer.from(enc,'base64')))}catch{return null}},
  write:value=>{if(!safeStorage.isEncryptionAvailable())throw Error('Secure storage is unavailable on this PC.');writeSettings({mailOAuthEnc:safeStorage.encryptString(JSON.stringify(value)).toString('base64')})},
  open:url=>shell.openExternal(url),
})
const premium = new PremiumClient({
  readSession: () => { const enc=readSettings().premiumSessionEnc; if(!enc||!safeStorage.isEncryptionAvailable())return null;try{return JSON.parse(safeStorage.decryptString(Buffer.from(enc,'base64')))}catch{return null} },
  writeSession: (session) => {if(session&&!safeStorage.isEncryptionAvailable())throw new Error('Secure account storage is unavailable on this PC.');writeSettings({premiumSessionEnc:session?safeStorage.encryptString(JSON.stringify(session)).toString('base64'):null})},
})
const paidFile=()=>join(fs.defaultDataDir(),'premium-jobs.json')
const paidRecords=()=>{try{return JSON.parse(readFileSync(paidFile(),'utf8'))}catch{return {quotes:{},jobs:{}}}}
const savePaidRecords=(r)=>{writeFileSync(paidFile()+'.tmp',JSON.stringify(r));renameSync(paidFile()+'.tmp',paidFile())}
function contactVerification(lead_id){const lead=fs.getLead(getDb(),lead_id),v=fs.getSetting(getDb(),`contact-verification:${lead_id}`,null);return lead&&v&&v.email===lead.email?{...v,fresh:v.status==='deliverable'&&Date.parse(v.checked_at)>Date.now()-30*864e5}:null}
function paidItems(capability,ids){
  if(!Array.isArray(ids)||ids.length<1||ids.length>25||new Set(ids).size!==ids.length)throw new Error('Choose 1–25 different leads.')
  return ids.map(id=>{const lead=fs.getLead(getDb(),id);if(!lead||lead.status==='suppressed'||fs.isSuppressed(getDb(),lead))throw new Error('A selected lead is unavailable or on do-not-contact.')
    if(capability==='email_verify'){if(!lead.email)throw new Error('Email verification needs an existing address.');if(contactVerification(id)?.fresh)throw Error('This address already has a recent deliverable verification. No extra credits are needed.');return {client_ref:id,email:lead.email}}
    if(capability!=='email_find')throw new Error('Unsupported paid capability.')
    if(lead.email)throw new Error('This lead already has an email. Verify it instead.')
    const parts=String(lead.name||'').trim().split(/\s+/);if(parts.length<2)throw new Error('Find the real contact’s first and last name with free research first.')
    let domain;try{domain=new URL(lead.website).hostname.replace(/^www\./,'')}catch{throw new Error('This lead needs a business website.')}
    return {client_ref:id,first_name:parts[0],last_name:parts.slice(1).join(' '),domain}
  })
}
const isDiscovery=cap=>['business_search','company_search'].includes(cap)
function currentPaidItems(q){
  if(!isDiscovery(q.capability))return paidItems(q.capability,q.lead_ids)
  const c=fs.getCampaign(getDb(),q.campaign_id);if(!c||c.status!=='active'||c.business_id!==q.business_id)throw Error('Campaign changed. Request a new search quote.')
  return q.items
}
async function paidQuote({capability,lead_ids=[],campaign_id,query,category,area,radius=10}){
  let items,business_id
  if(isDiscovery(capability)){
    const c=fs.getCampaign(getDb(),campaign_id);if(!c||c.status!=='active')throw Error('Choose an active campaign.');business_id=c.business_id
    if(capability==='company_search')items=[{client_ref:campaign_id,query:String(query||'').trim().slice(0,500)}]
    else{if(!String(area||'').trim())throw Error('Enter a city and region.');const geo=await fs.geocode(String(area).slice(0,160));items=[{client_ref:campaign_id,category,latitude:Number(geo.lat),longitude:Number(geo.lng),radius:Number(radius)}]}
  }else items=paidItems(capability,lead_ids)
  const quote=await premium.request('/v1/quotes',{capability,items})
  const records=paidRecords();records.quotes[quote.id]={...quote,items,lead_ids,campaign_id,business_id};savePaidRecords(records);return quote
}
async function paidRun({quote_id}){
  const records=paidRecords(),q=records.quotes[quote_id];if(!q)throw new Error('Request a new quote in this app first.')
  if(records.jobs[quote_id])return paidJob({job_id:records.jobs[quote_id]})
  if(q.expires<=Date.now())throw new Error('Quote expired. Request a new quote.')
  if(JSON.stringify(currentPaidItems(q))!==JSON.stringify(q.items))throw new Error('Lead details changed. Request a new quote.')
  const detail=isDiscovery(q.capability)?`One ${q.capability==='company_search'?'company':'local business'} search. The query/location goes to the configured data provider. A completed search uses ${q.max_credits} credits even with no matches. Candidates are reviewed before adding leads. Nothing will be sent.`:`${q.capability==='email_find'?'Find business emails':'Verify emails'} for ${q.count} selected leads. Their contact details will be sent to the configured data service. No outreach will be sent.`
  const answer=await dialog.showMessageBox(win,{type:'question',title:'Use Premium credits?',message:`Use up to ${q.max_credits} credits?`,detail,buttons:['Cancel','Use credits'],defaultId:0,cancelId:0,noLink:true})
  if(answer.response!==1)throw new Error('Paid research was not approved. No credits used.')
  // Recheck after the person answers; they may have changed or suppressed a lead while the dialog was open.
  if(JSON.stringify(currentPaidItems(q))!==JSON.stringify(q.items))throw new Error('Lead details changed. Request a new quote.')
  const job=await premium.request('/v1/jobs',{quote_id,max_credits:q.max_credits})
  const latest=paidRecords();latest.jobs[quote_id]=job.id;savePaidRecords(latest);return job
}
async function paidJob({job_id}){const r=paidRecords();if(!Object.values(r.jobs).includes(job_id))throw new Error('This job was started on another device. View it in the account history.');const job=await premium.request(`/v1/jobs/${encodeURIComponent(job_id)}`);const qid=Object.keys(r.jobs).find(id=>r.jobs[id]===job_id),q=r.quotes[qid];if(q?.capability==='email_verify'&&job.state==='complete')for(const row of job.result){const lead=fs.getLead(getDb(),row.client_ref);if(q.lead_ids.includes(row.client_ref)&&lead?.email===row.email)fs.setSetting(getDb(),`contact-verification:${lead.id}`,row)}return job}
async function paidImport({job_id,campaign_id,refs}){
  const records=paidRecords(),qid=Object.keys(records.jobs).find(q=>records.jobs[q]===job_id),quote=records.quotes[qid]
  if(!quote||!isDiscovery(quote.capability)||quote.campaign_id!==campaign_id)throw Error('Search does not belong to this campaign.')
  currentPaidItems(quote)
  if(!Array.isArray(refs)||!refs.length||refs.length>50)throw Error('Select up to 50 candidates.')
  const job=await paidJob({job_id});if(job.state!=='complete')throw Error('Wait for the search to finish.')
  return tx(getDb(),()=>{currentPaidItems(quote);const saved=fs.getSetting(getDb(),`discovery-import:${job_id}`,[]),rows=[...new Set(refs)].filter(ref=>!saved.includes(ref)).map(ref=>{const r=job.result.find(r=>r.client_ref===ref&&r.status==='candidate');if(!r)throw Error('Candidate not found.');return r})
    const result=fs.addLeads(getDb(),campaign_id,rows.map(r=>({company:r.company,website:r.website,phone:r.phone,location:r.location,source:'website',source_url:r.source_url,notes:`Candidate from ${r.provider}, retrieved ${r.checked_at}. Verify website and campaign fit. No buying intent inferred.`})))
    fs.setSetting(getDb(),`discovery-import:${job_id}`,[...new Set([...saved,...refs])]);send('data:changed',{tool:'paid-discovery'});return {...result,added:result.added.length}
  })
}
async function paidApply({job_id,lead_id}){
  const job=await paidJob({job_id}),records=paidRecords(),qid=Object.keys(records.jobs).find(q=>records.jobs[q]===job_id),quote=records.quotes[qid]
  const row=job.result.find(r=>r.client_ref===lead_id),lead=fs.getLead(getDb(),lead_id)
  if(!quote.lead_ids.includes(lead_id)||!row||row.status!=='deliverable'||!row.email||!lead)throw new Error('No deliverable email result is available for this lead.')
  if(lead.status==='suppressed'||fs.isSuppressed(getDb(),{...lead,email:row.email}))throw new Error('Do-not-contact prevents using this address.')
  if(lead.email&&lead.email!==row.email)throw new Error('The existing address will not be replaced.')
  if(lead.email_status==='bounced')throw new Error('A verification result cannot reset a bounced address.')
  const original=quote.items.find(i=>i.client_ref===lead_id)
  if(lead.email===row.email&&quote.capability==='email_find')return {lead_id,email:row.email,already_applied:true}
  const current=paidItems(quote.capability,[lead_id])[0]
  if(JSON.stringify(original)!==JSON.stringify(current))throw new Error('Contact details changed since this search. Review the result manually.')
  const value=tx(getDb(),()=>{const updated=fs.updateLead(getDb(),lead_id,{email:row.email});fs.setSetting(getDb(),`contact-verification:${lead_id}`,row);return updated});send('data:changed',{tool:'premium-result'});return {lead_id:value.id,email:value.email,source:row.provider,verification:row.status,note:'Provider result, not a delivery guarantee.'}
}
async function openBilling(kind){const r=await premium.request(kind==='portal'?'/v1/portal':'/v1/checkout',kind==='portal'?{}:{kind});const u=new URL(r.url);if(u.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(u.hostname))throw new Error('Billing returned an unexpected destination.');await shell.openExternal(u.toString());return {opened:true}}

// --- The person's own agents: find, install, sign in (ported from IV Studio) ---
const agentsFound = () => ({ ...findHarnesses(), hermes: findHermes() })
let agentInstall = null // { engine, status, lines, error, run }
const installView = () => (agentInstall ? { engine: agentInstall.engine, status: agentInstall.status, lines: agentInstall.lines.slice(-6), error: agentInstall.error } : null)
async function agentSetup() {
  const found = agentsFound()
  const one = async (engine) => ({ ...AGENT_INFO[engine], installed: !!found[engine], signedIn: found[engine] ? await signedIn(engine, found[engine]) : false })
  const [claude, codex] = await Promise.all([one('claude'), one('codex')])
  return { platform: process.platform, claude, codex, hermes: { name: 'Hermes', installed: !!found.hermes }, install: installView() }
}
const pushSetup = () => agentSetup().then((s) => send('agents:setupChanged', s), () => {})

// --- The chat ---
const chatsRoot = () => join(fs.defaultDataDir(), 'chats')
let chat = null
let chatTurn = null
const chatView = () => (chat ? { ...chat, busy: !!chatTurn } : null)
const pushChat = () => send('chat:changed', chatView())
const chatId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
function chatPreferred(found) {
  const s = readSettings()
  if (['claude', 'codex', 'hermes'].includes(s.chatEngine) && found[s.chatEngine]) return s.chatEngine
  return found.claude ? 'claude' : found.codex ? 'codex' : found.hermes ? 'hermes' : null
}
function chatEngine(engine) {
  const found = agentsFound()
  const e = engine || chatPreferred(found)
  if (!e || !AGENT_NAMES[e]) throw new Error('Install Claude Code, Codex or Hermes first: the chat uses your own.')
  if (!found[e]) throw new Error(`${AGENT_NAMES[e]} isn't installed on this PC.`)
  return e
}


const ivWorkspace = workspaceHost({ appId: 'outreach', dataDir: fs.defaultDataDir(),
  nativeBrands: () => fs.listBusinesses(getDb()),
  importBrand: (brand, linkedId, workspace) => {
    const db = getDb(), key = 'iv-workspace-brand:' + brand.id
    const id = linkedId || fs.getSetting(db, key)
    const existing = id ? fs.getBusiness(db, id) : null
    const profile = Object.fromEntries(['website','offer','audience','voice','visual','location','goal','accent'].map(k => [k, brand[k]]))
    profile.logo_id = brand.logo ? importBrandImage(fs.defaultDataDir(), workspace.assetPath(brand.logo), 'logo', nativeImage).id : ''
    const result = tx(db, () => {
      const b = existing ? fs.updateBusiness(db, existing.id, {name:brand.name,profile}) : fs.createBusiness(db, {name:brand.name,profile})
      fs.setSetting(db, key, b.id); return b
    })
    send('data:changed', {tool:'ivWorkspaceBrand'}); return result
  },

})
app.on('open-url', (event, url) => { event.preventDefault(); ivWorkspace.capture([url]) })

const METHODS = {
  ivWorkspace: ({method,args}) => { if (!Object.hasOwn(ivWorkspace.api, method)) throw Error('Unknown workspace action.'); return ivWorkspace.api[method](args || {}) },
  updatesStatus,
  updatesCheck: async () => { await appUpdates.check(); return updatesStatus() },
  updatesDownload: async () => { await appUpdates.download(); return updatesStatus() },
  updatesPreferences: ({ automaticChecks }) => {
    if (typeof automaticChecks !== 'boolean') throw new Error('Choose whether to check automatically.')
    writeSettings({ automaticUpdateChecks: automaticChecks })
    send('updates:changed', updatesStatus()); return updatesStatus()
  },
  updatesInstall: async () => {
    if (chatTurn || mailState.busy || checking) throw new Error('Wait for the current chat or mailbox task to finish before restarting.')
    if (appUpdates?.status().phase !== 'ready') throw new Error('Download the update first.')
    const { response } = await dialog.showMessageBox(win, { type: 'question', title: 'Install IV Outreach update', message: 'Restart IV Outreach to install the update?', detail: 'Save any open campaign or business form first. Your saved businesses, leads and chats will stay on this PC.', buttons: ['Not now', 'Restart and install'], defaultId: 0, cancelId: 0, noLink: true })
    if (response === 1) appUpdates.install({ busy: !!chatTurn || mailState.busy || checking })
    return updatesStatus()
  },
  onboardingStatus: () => onboardingStatus(getDb()),
  onboardingSave: (args) => saveOnboarding(getDb(), args),
  onboardingFinish: (args) => { const result = finishOnboarding(getDb(), args); send('data:changed', { tool: 'onboarding' }); return result },
  chatWindowState,
  chatPopOut: () => { createChatWindow(); return chatWindowState() },
  chatDock: () => { chatWindow?.close(); return chatWindowState() },
  chatFocus: () => { if (chatWindow) { if (chatWindow.isMinimized()) chatWindow.restore(); chatWindow.show(); chatWindow.focus() }; return true },
  chatSetContext: (context) => { chatContext = { businessId: context.businessId || null, businessName: String(context.businessName || '').slice(0,160), page: String(context.page || 'today').slice(0,40), campaignId: context.campaignId || null, campaignName: String(context.campaignName || '').slice(0,300), leadId: context.leadId || null }; send('chat:window', chatWindowState()); return chatContext },
  chatComposer: () => composer,
  chatSetComposer: (patch) => { composer = { ...composer, ...(typeof patch.text === 'string' ? { text: patch.text.slice(0,8000) } : {}), ...(Array.isArray(patch.files) ? { files: patch.files.filter(p => typeof p === 'string').slice(0,5) } : {}), ...(['claude','codex','hermes',null].includes(patch.engine) ? { engine: patch.engine } : {}), ...(['chat','history'].includes(patch.tab) ? { tab: patch.tab } : {}) }; send('chat:composer', composer); return composer },
  chatHandoff: ({text = '', send: sendNow = false}) => {
    METHODS.chatFocus()
    if (sendNow && !chatTurn) return METHODS.chatSend({ text, context: chatContext, engine: composer.engine })
    return METHODS.chatSetComposer({ text, tab: 'chat' })
  },
  premiumStatus:()=>premium.status(),
  premiumSignIn:({email})=>premium.start(email),
  premiumVerify:({email,code})=>premium.verify(email,code),
  premiumSignOut:()=>premium.signOut(),
  premiumLocalConnect:()=>premium.connectLocal(),
  premiumCheckout:({kind})=>openBilling(kind),
  premiumQuote:paidQuote,
  premiumRun:paidRun,
  premiumJob:paidJob,
  premiumCancel:({job_id})=>premium.request(`/v1/jobs/${encodeURIComponent(job_id)}/cancel`,{}),
  premiumApply:paidApply,
  premiumContactVerification:({lead_id})=>contactVerification(lead_id),
  premiumImport:paidImport,
  premiumSearchHistory:({campaign_id})=>{const r=paidRecords();return Object.values(r.quotes).filter(q=>q.campaign_id===campaign_id&&r.jobs[q.id]).reverse().slice(0,10).map(q=>({job_id:r.jobs[q.id],capability:q.capability}))},
  premiumLatest:async({lead_id})=>{const r=paidRecords();const q=Object.values(r.quotes).reverse().find(q=>q.lead_ids.includes(lead_id)&&r.jobs[q.id]);return q?paidJob({job_id:r.jobs[q.id]}):null},
  scannerState:({campaign_id})=>fs.scannerState(getDb(),campaign_id),
  growthState:({campaign_id})=>({...growth.growthState(getDb(),campaign_id),audit_available:!!auditBrowser()}),
  opportunityScan:async args=>{const value=await growth.opportunityScan(getDb(),args,{audit:runOpportunityAudit});send('data:changed',{tool:'opportunity'});return value},
  watchSave:args=>growth.saveWatch(getDb(),args),
  watchRemove:args=>growth.removeWatch(getDb(),args),
  watchCheck:async args=>{const value=await growth.checkWatch(getDb(),args);send('data:changed',{tool:'watch'});return value},
  contentBrief:args=>growth.contentBrief(getDb(),args),
  briefExport:async({campaign_id,id,format='markdown'})=>{const brief=growth.growthState(getDb(),campaign_id).briefs.find(b=>b.id===id);if(!brief)throw Error('Brief not found.');const json=format==='json';const pick=await dialog.showSaveDialog(win,{title:'Save IV content brief',defaultPath:`IV-Content-Brief-${id}.${json?'json':'md'}`,filters:[{name:json?'IV brief JSON':'Content brief',extensions:[json?'json':'md']}]});if(pick.canceled)return {saved:false};writeFileSync(pick.filePath,json?JSON.stringify(brief,null,2):growth.briefMarkdown(brief),'utf8');return {saved:true}},
  briefCopy:({campaign_id,id})=>{const brief=growth.growthState(getDb(),campaign_id).briefs.find(b=>b.id===id);if(!brief)throw Error('Brief not found.');clipboard.writeText(growth.briefMarkdown(brief));return true},
  briefHandoff:async({campaign_id,id,target})=>{const campaign=fs.getCampaign(getDb(),campaign_id);if(!campaign)throw Error('Choose a campaign.');const brief=growth.growthState(getDb(),campaign_id).briefs.find(b=>b.id===id);if(!brief)throw Error('Brief not found.');return ivWorkspace.sendBrief({nativeId:campaign.business_id,sourceKey:brief.id,target,brief:{title:brief.goal,goal:brief.goal,angle:brief.angle,channel:brief.channel,campaign:brief.campaign.name,offer:brief.campaign.offer,audience:typeof brief.campaign.audience==='string'?brief.campaign.audience:JSON.stringify(brief.campaign.audience),evidence:brief.evidence}})},
  briefOpenApp:async({campaign_id,id,target})=>{if(!['studio','signal'].includes(target))throw Error('Choose IV Studio or IV Signal.');const name=target==='studio'?'IV Studio':'IV Signal',path=join(app.getPath('appData'),'..','Local','Programs',name,`${name}.exe`);if(!existsSync(path))throw Error(`${name} is not installed in the usual location. Use Copy brief instead.`);const brief=growth.growthState(getDb(),campaign_id).briefs.find(b=>b.id===id);if(!brief)throw Error('Brief not found.');clipboard.writeText(growth.briefMarkdown(brief));const error=await shell.openPath(path);if(error)throw Error(`Could not open ${name}. The brief is copied for manual paste.`);return {opened:true,copied:true,note:'Paste the brief into the app. Nothing was submitted automatically.'}},
  scannerSave:(args)=>fs.saveScan(getDb(),args),
  scannerRemove:({campaign_id,id})=>fs.removeScan(getDb(),campaign_id,id),
  scannerRun:async(args)=>{const r=await fs.runScan(getDb(),args);send('data:changed',{tool:'business-scan'});return r},
  // data
  overview: (args) => fs.overview(getDb(), args),
  workspaceState: () => ({ businesses: fs.listBusinesses(getDb()).map(b => ({...b,art:{logo:brandImage(fs.defaultDataDir(),b.profile.logo_id),cover:brandImage(fs.defaultDataDir(),b.profile.cover_id)}})), businessId: readSettings().selectedBusinessId || null, campaignId: readSettings().selectedCampaignId || null }),
  workspaceSelect: ({businessId, campaignId = null}) => {
    if (!fs.getBusiness(getDb(),businessId)) throw new Error('Business not found.')
    if (campaignId && fs.getCampaign(getDb(),campaignId)?.business_id !== businessId) throw new Error('Campaign does not belong to this business.')
    writeSettings({selectedBusinessId:businessId,selectedCampaignId:campaignId}); ivWorkspace.picked(businessId); return true
  },
  uiGuideReady: ({requestId,error,place,found}) => { const pending=guideRequests.get(requestId);if(!pending)return false;clearTimeout(pending.timer);guideRequests.delete(requestId);if(error)pending.reject(new Error(String(error)));else pending.resolve({place,shown:!!found,note:found?'Opened the page and highlighted the named control.':'Opened the page, but the control is not visible in this workspace yet.'});return true },
  chooseBrandImage: async ({kind}) => {
    if (!['logo','cover'].includes(kind)) throw new Error('Choose a logo or cover.')
    const result=await dialog.showOpenDialog(win,{title:kind==='logo'?'Choose your business logo':'Choose a business cover',properties:['openFile'],filters:[{name:'Images (up to 8 MB)',extensions:['png','jpg','jpeg','webp']}]})
    return result.canceled?null:importBrandImage(fs.defaultDataDir(),result.filePaths[0],kind,nativeImage)
  },
  createBusinessSetup: ({name,profile,campaign}) => {
    const result=tx(getDb(),()=>{const business=fs.createBusiness(getDb(),{name,profile}); const first=campaign?fs.createCampaign(getDb(),{...campaign,business_id:business.id}):null;return {business,campaign:first}})
    send('data:changed',{tool:'business'});return result
  },
  listBusinesses: () => fs.listBusinesses(getDb()),
  createBusiness: args => { const value=fs.createBusiness(getDb(),args); send('data:changed',{tool:'business'}); return value },
  updateBusiness: ({id,...patch}) => { const value=fs.updateBusiness(getDb(),id,patch); send('data:changed',{tool:'business'}); return value },
  createCampaign: args => { const value=fs.createCampaign(getDb(),args); send('data:changed',{tool:'campaign'}); return value },
  listCampaigns: args => fs.listCampaigns(getDb(),args),
  updateCampaign: ({ id, ...patch }) => { const value=fs.updateCampaign(getDb(),id,patch); send('data:changed',{tool:'campaign'}); return value },
  listLeads: (args) => fs.listLeads(getDb(), args),
  getLead: ({ id }) => fs.getLead(getDb(), id),
  leadPreview: ({ id }) => leadPreview(fs.getLead(getDb(), id)?.website),
  openLeadLink: async ({ url }) => { await shell.openExternal(webDestination(url)); return true },
  updateLead: ({ id, ...patch }) => fs.updateLead(getDb(), id, patch),
  listMessages: (args) => fs.listMessages(getDb(), args),
  editMessage: ({ id, subject, body }) => fs.editMessage(getDb(), id, { subject, body }),
  approveMessages: ({ ids }) => fs.approveMessages(getDb(), ids),
  cancelMessages: ({ ids }) => fs.cancelMessages(getDb(), ids),
  linkedinQueue: () => fs.linkedinQueue(getDb()),
  copyAndOpenLinkedin: ({ url, note }) => {
    if (!isLinkedinProfile(url)) throw new Error('Only LinkedIn profile links can be opened from here')
    clipboard.writeText(note || '')
    shell.openExternal(url)
    return { copied: true }
  },
  markLinkedinSent: ({ id }) => {
    const m = getDb().prepare('select channel from messages where id = ?').get(id)
    if (m?.channel !== 'linkedin') throw new Error('Only LinkedIn messages are marked sent by hand')
    return fs.markSent(getDb(), id)
  },
  logReply: (args) => fs.logReply(getDb(), args),

  // socials: the send list, opening a profile or DM, finding and confirming profiles
  socialQueue: (args) => fs.socialQueue(getDb(),args),
  copyAndOpenSocial: ({ url, note }) => {
    if (!isSocialLink(url)) throw new Error('Only social profile and message links can be opened from here')
    clipboard.writeText(note || '')
    shell.openExternal(url)
    return { copied: true }
  },
  openSocial: ({ url }) => {
    if (!isSocialLink(url)) throw new Error('Only social profile links can be opened from here')
    shell.openExternal(url)
    return true
  },
  markSocialSent: ({ id }) => {
    const m = getDb().prepare('select channel from messages where id = ?').get(id)
    if (!m || m.channel === 'email') throw new Error('Only social messages are marked sent by hand')
    return fs.markSent(getDb(), id)
  },
  findSocials: ({ id, handles }) => fs.findSocials(getDb(), id, { handles }),
  useSocial: ({ id, channel, url }) => fs.useSocial(getDb(), id, { channel, url }),
  searchMaps: (args) => fs.searchGoogleMaps(getDb(), args),
  mapsAvailable: () => !!fs.scraperPath(),

  // mailbox
  mailStatus: () => ({ ...fs.mailStatus(getDb()), ...(mailOAuth.status().connected?{ready:true}:{}),oauth:mailOAuth.status(),hasPassword: !!mailPassword()||mailOAuth.status().connected, encryption: safeStorage.isEncryptionAvailable(), presets: fs.MAIL_PRESETS, worker: { lastSend: mailState.lastSend, lastCheck: mailState.lastCheck, error: mailState.error } }),
  mailOAuthConfigure:args=>mailOAuth.configure(args),
  mailOAuthConnect:async({provider})=>{if(mailState.busy||checking)throw Error('Wait for the mailbox task to finish.');const result=await mailOAuth.connect(provider);fs.saveMailbox(getDb(),{user:result.email,auto_send:false});transport=null;send('data:changed',{tool:'mailbox'});return result},
  mailOAuthCancel:()=>mailOAuth.cancel(),
  mailOAuthDisconnect:()=>{if(mailState.busy||checking)throw Error('Wait for the mailbox task to finish.');fs.saveMailbox(getDb(),{auto_send:false});return mailOAuth.disconnect()},
  saveMailbox: (patch) => fs.saveMailbox(getDb(), patch),
  setMailPassword: ({ password }) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('This PC can\'t encrypt the password, so IV Outreach won\'t store it.')
    if (!password) throw new Error('Enter the password first')
    writeSettings({ mailPassEnc: safeStorage.encryptString(String(password)).toString('base64') })
    transport = null
    return true
  },
  clearMailPassword: () => {
    writeSettings({ mailPassEnc: null })
    transport = null
    return true
  },
  testMailbox: async () => {
    if(mailOAuth.status().connected){await mailOAuth.request(mailOAuth.status().provider==='google'?'/profile':'?$select=mail');return {smtp:{ok:true},imap:{ok:true},api:true}}
    const pw = mailPassword()
    if (!pw) throw new Error('Save the mailbox password first')
    return fs.testMailbox(fs.getMailbox(getDb()), pw)
  },
  sendNextNow: () => mailTick({ force: true }),
  checkRepliesNow: () => replyTick(),
  getSender: () => {
    const sender = fs.getSender(getDb())
    return { sender, missing: fs.senderGaps(sender) }
  },
  saveSender: (patch) => {
    const sender = fs.saveSender(getDb(), patch)
    return { sender, missing: fs.senderGaps(sender) }
  },
  listSuppression: () => fs.listSuppression(getDb()),
  suppress: (args) => fs.suppress(getDb(), args),
  importCsv: async ({ campaign_id }) => {
    const pick = await dialog.showOpenDialog(win, { title: 'Import leads', filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] })
    if (pick.canceled || !pick.filePaths[0]) return null
    const r = fs.importCsv(getDb(), campaign_id, pick.filePaths[0])
    return { ...r, added: r.added.length }
  },
  previewOpenOutreach: async ({ campaign_id }) => {
    openOutreachSelection = null
    if (!fs.getCampaign(getDb(), campaign_id)) throw new Error('Choose a campaign first.')
    const pick = await dialog.showOpenDialog(win, { title: 'Choose an OpenOutreach export', filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] })
    if (pick.canceled || !pick.filePaths[0]) return null
    const path = pick.filePaths[0]
    const preview = fs.previewOpenOutreachCsv(path)
    openOutreachSelection = { path, campaign_id }
    return preview
  },
  importOpenOutreach: ({ campaign_id }) => {
    if (!openOutreachSelection || openOutreachSelection.campaign_id !== campaign_id) throw new Error('Choose the export for this campaign again.')
    const r = fs.importOpenOutreachCsv(getDb(), campaign_id, openOutreachSelection.path)
    openOutreachSelection = null
    send('data:changed', { tool: 'openoutreach-import' })
    return { ...r, added: r.added.length }
  },
  exportCsv: async ({ campaign_id }) => {
    const c = fs.getCampaign(getDb(), campaign_id)
    if (!c) throw new Error('No campaign')
    const safe = c.name.replace(/[^\w -]+/g, '').trim() || 'campaign'
    const dir = join(app.getPath('documents'), 'IV Outreach')
    mkdirSync(dir, { recursive: true })
    const pick = await dialog.showSaveDialog(win, { title: 'Export leads', defaultPath: join(dir, `${safe}.csv`), filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (pick.canceled || !pick.filePath) return null
    writeFileSync(pick.filePath, fs.exportCsv(getDb(), campaign_id), 'utf8')
    return { written: pick.filePath }
  },
  copyText: ({ text }) => {
    clipboard.writeText(String(text || ''))
    return { copied: true }
  },
  appSettings: () => { const { openOutreach, mailPassEnc, premiumSessionEnc, mailOAuthEnc, ...settings } = readSettings(); return settings },
  researchPlan: (args) => fs.researchPlan(getDb(), args),
  saveAppSettings: (patch) => {
    const clean = {}
    if (typeof patch.visualGuidanceEnabled === 'boolean') clean.visualGuidanceEnabled=patch.visualGuidanceEnabled
    if (['claude', 'codex', 'hermes', ''].includes(patch.chatEngine)) clean.chatEngine = patch.chatEngine
    for (const k of ['claudeModel', 'codexModel', 'agentName', 'userName']) if (typeof patch[k] === 'string') clean[k] = patch[k].trim().slice(0, 80)
    const { openOutreach, mailPassEnc, premiumSessionEnc, mailOAuthEnc, ...settings } = writeSettings(clean)
    return settings
  },

  // agents: install, sign in, connect (IV Studio's Settings -> Agents)
  agentSetup: () => agentSetup(),
  agentInstall: ({ engine }) => {
    if (!AGENT_INFO[engine]) throw new Error('IV Outreach can install Claude Code or Codex.')
    if (agentInstall?.status === 'running') throw new Error(`${AGENT_INFO[agentInstall.engine].name} is still installing.`)
    const state = { engine, status: 'running', lines: [], error: null, run: null }
    agentInstall = state
    state.run = runInstall(engine, {
      onLine: (line) => {
        state.lines.push(line)
        if (state.lines.length > 50) state.lines.shift()
        if (agentInstall === state) send('agents:setupChanged', { install: installView() })
      },
    })
    pushSetup()
    state.run.promise.then((r) => {
      const there = !!agentsFound()[engine]
      state.status = r.ok && there ? 'done' : 'failed'
      state.error = r.ok && !there ? `The installer finished, but IV Outreach can't find ${AGENT_INFO[engine].name} yet. Restart IV Outreach, or install it from ${AGENT_INFO[engine].site}` : r.error
      if (agentInstall === state) pushSetup()
    })
    return true
  },
  agentStopInstall: () => {
    if (agentInstall?.status === 'running') agentInstall.run.stop()
    return true
  },
  agentSignIn: ({ engine }) => {
    if (!AGENT_INFO[engine]) throw new Error('IV Outreach can sign in to Claude Code or Codex.')
    const exe = agentsFound()[engine]
    if (!exe) throw new Error(`${AGENT_INFO[engine].name} isn't installed yet.`)
    openSignIn(engine, exe)
    return true
  },
  openLink: ({ url }) => {
    const allowed = Object.values(AGENT_INFO).map((a) => a.site).concat('https://hermes-agent.nousresearch.com')
    if (!allowed.includes(url)) throw new Error('That link isn\'t one IV Outreach opens.')
    shell.openExternal(url)
    return true
  },
  agentsInfo: () => {
    const skillFile = join(homedir(), '.claude', 'skills', 'fitscout', 'SKILL.md')
    const text = skillMarkdown(mcpCommand())
    const installed = existsSync(skillFile)
    return {
      paste: pasteMessage(mcpCommand()),
      skillFile,
      skillInstalled: installed,
      skillCurrent: installed && readFileSync(skillFile, 'utf8') === text,
      desktopSnippet: JSON.stringify({ fitscout: mcpCommand() }, null, 2),
      desktopConfigPath: claudeConfigPath(),
    }
  },
  installSkill: () => {
    const skillFile = join(homedir(), '.claude', 'skills', 'fitscout', 'SKILL.md')
    mkdirSync(dirname(skillFile), { recursive: true })
    writeFileSync(skillFile, skillMarkdown(mcpCommand()))
    return skillFile
  },
  openClaudeConfigFolder: () => {
    const folder = dirname(claudeConfigPath())
    mkdirSync(folder, { recursive: true })
    shell.openPath(folder)
    return { opened: folder }
  },

  // chat
  chatStatus: () => {
    const found = agentsFound()
    const s = readSettings()
    return {
      installed: { claude: !!found.claude, codex: !!found.codex, hermes: !!found.hermes },
      preferred: chatPreferred(found),
      chat: chatView(),
      chats: listChats(chatsRoot()).slice(0, 20),
      agentName: (s.agentName || '').trim(),
      userName: (s.userName || '').trim(),
    }
  },
  chatNew: ({ engine }) => {
    if (chatTurn) throw new Error(`${chat.name} is still answering. Stop it first.`)
    chat = newChat({ id: chatId(), engine: chatEngine(engine) })
    pushChat()
    return chatView()
  },
  chatOpen: ({ id }) => {
    if (chatTurn) throw new Error(`${chat.name} is still answering. Stop it first.`)
    const c = loadChat(chatsRoot(), String(id || ''))
    if (!c) throw new Error('That chat is gone.')
    chat = c
    pushChat()
    return chatView()
  },
  chatPickFiles: async () => {
    const pick = await dialog.showOpenDialog(chatWindow || win, { title: 'Add to the chat', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Leads or notes', extensions: ATTACH_EXTENSIONS }] })
    return pick.canceled ? [] : pick.filePaths.slice(0, MAX_ATTACH)
  },
  chatSend: ({ text, context, engine, files = [] }) => {
    const attached = (Array.isArray(files) ? files : []).filter((p) => typeof p === 'string' && existsSync(p)).map(attachmentOf).filter((a) => a.kind).slice(0, MAX_ATTACH)
    const message = String(text || '').trim().slice(0, 8000) || (attached.length ? 'Here are some files.' : '')
    if (!message) throw new Error('Type a message first.')
    if (chatTurn) throw new Error(`${chat.name} is still answering. Stop it first, or wait.`)
    if (!chat) chat = newChat({ id: chatId(), engine: chatEngine(engine) })
    const exe = agentsFound()[chat.engine]
    if (!exe) throw new Error(`${chat.name} isn't installed on this PC.`)
    const turnContext = context && typeof context === 'object' ? context : chatContext
    const turnCampaign = turnContext.campaignId ? fs.getCampaign(getDb(),turnContext.campaignId) : null
    if (turnContext.campaignId && !turnCampaign) throw new Error('Campaign no longer exists. Choose a campaign again.')
    const turnBusiness = fs.getBusiness(getDb(),turnCampaign?.business_id || turnContext.businessId || '')
    if (turnContext.businessId && turnCampaign && turnCampaign.business_id !== turnContext.businessId) throw new Error('Business selection changed. Choose the campaign again.')
    METHODS.chatSetComposer({ text: '', files: [], tab: 'chat' })
    const current = chat
    const s = readSettings()
    if (current.engine === 'codex') {
      const cw = codexWindow(s.codexModel || '')
      if (cw) applyUsage(current, { window: cw.window, model: cw.model })
    }
    current.turnCalls = 0
    current.entries.push({ kind: 'you', text: message, at: new Date().toISOString(), ...(attached.length ? { files: attached.map((a) => ({ name: a.name, kind: a.kind, path: a.path })) } : {}) })
    if (!current.title) current.title = message.slice(0, 80)
    saveChat(chatsRoot(), current)
    const turn = startChatTurn({
      engine: current.engine,
      exe,
      dir: join(chatsRoot(), current.id),
      session: current.session,
      message: withAttachments(message, attached),
      context: { ...turnContext, businessId: turnBusiness?.id, businessName: turnBusiness?.name, businessBrief: turnBusiness ? { ...turnBusiness.profile, company: turnBusiness.name } : {} },
      mcp: mcpCommand({visual:true}),
      model: current.engine === 'claude' ? s.claudeModel || '' : current.engine === 'codex' ? s.codexModel || '' : '',
      names: { agentName: s.agentName, userName: s.userName || onboardingStatus(getDb()).profile.name },
      onEvent: (e) => {
        applyChatEvent(current, e)
        if (chat === current) pushChat()
        // the agent changed data: the page refreshes
        if (e.type === 'step') send('data:changed', { tool: e.tool })
      },
    })
    chatTurn = turn
    pushChat()
    turn.promise.then((r) => {
      if (r.session) current.session = r.session
      const last = current.entries[current.entries.length - 1]
      if (!r.ok && r.error && !(last?.kind === 'problem' && last.text === r.error)) current.entries.push({ kind: 'problem', text: r.error })
      current.updatedAt = new Date().toISOString()
      if (chatTurn === turn) chatTurn = null
      try {
        saveChat(chatsRoot(), current)
        pruneChats(chatsRoot())
      } catch {
        /* a full drive shouldn't take the chat down */
      }
      pushChat()
      send('data:changed', { tool: 'turn-end' })
    })
    return chatView()
  },
  chatAnswer: ({ id, allow }) => !!chatTurn?.answer(String(id || ''), !!allow),
  chatStop: () => {
    chatTurn?.stop()
    mailOAuth.cancel()
    return true
  },
}

ipcMain.handle('fitscout:call', async (_event, method, args) => {
  if (![win?.webContents, chatWindow?.webContents].includes(_event.sender) || _event.senderFrame !== _event.sender.mainFrame) throw new Error('Untrusted app window')
  if (['chatSetContext','uiGuideReady'].includes(method) && _event.sender !== win?.webContents) throw new Error('Only the workspace changes the chat context')
  const fn = Object.hasOwn(METHODS,method) ? METHODS[method] : null
  if (!fn) throw new Error(`Unknown method ${method}`)
  return fn(args || {})
})

function createChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) { METHODS.chatFocus(); return }
  const bounds = win?.getBounds()
  chatWindow = new BrowserWindow({ width: 500, height: 800, minWidth: 360, minHeight: 500,
    ...(bounds ? { x: bounds.x + Math.max(0, bounds.width - 500), y: bounds.y + 40 } : {}),
    title: 'IV Outreach — Chat', backgroundColor: '#100c0e', show: false, autoHideMenuBar: true,
    webPreferences: { preload: join(here, '../preload/index.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } })
  const target = chatWindow
  target.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  target.webContents.on('will-navigate', e => e.preventDefault())
  target.once('ready-to-show', () => target.show())
  target.on('closed', () => { chatWindow = null; send('chat:window', { ...chatWindowState(), returned: true }) })
  if (process.env.ELECTRON_RENDERER_URL) { const url = new URL(process.env.ELECTRON_RENDERER_URL); url.searchParams.set('chatWindow','1'); target.loadURL(url.toString()) }
  else target.loadFile(join(here, '../renderer/index.html'), { query: { chatWindow: '1' } })
  send('chat:window', chatWindowState())
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1040,
    minHeight: 660,
    title: 'IV Outreach',
    backgroundColor: '#100c0e',
    icon: nativeImage.createFromPath(app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(here, '../../build/icon.png')),
    show: false,
    autoHideMenuBar: true,
    // IV Studio's frameless window: the app draws its own title bar, Windows draws the buttons over it
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 13 } } : { titleBarOverlay: { color: '#100c0e', symbolColor: '#f1ede5', height: 40 } }),
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  win.on('close', () => { chatWindow?.close() })
  // Nothing in the renderer may navigate the app window or open arbitrary pages.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(here, '../renderer/index.html'))
}

// Preserve the previous install's data and single-instance identity across the visible rename.
app.setName('IV Outreach')
app.setPath('userData', fs.defaultDataDir())
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
else {
  app.on('second-instance', (_event, args) => {
    ivWorkspace.capture(args)
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })
  app.whenReady().then(async () => {
    ivWorkspace.ready()
    // Follow the business chosen in IV Hivemind (or another IV app): select this app's copy of it.
    ivWorkspace.followActive({ select: ({ localId }) => {
      if (!localId || readSettings().selectedBusinessId === localId) return
      writeSettings({ selectedBusinessId: localId, selectedCampaignId: null })
      send('workspace:active', { businessId: localId })
    } })
    createWindow()
    appUpdates = new AppUpdates({ updater: updaterPackage.autoUpdater, version: app.getVersion(), supported: app.isPackaged && process.platform === 'win32', onChange: () => send('updates:changed', updatesStatus()) })
    const checkUpdates = () => { if (readSettings().automaticUpdateChecks !== false) appUpdates.check().catch(() => {}) }
    if (app.isPackaged) {
      updateStartup = setTimeout(checkUpdates, 20000)
      updateTimer = setInterval(checkUpdates, 6 * 60 * 60 * 1000)
    }
    try { uiBridgeServer=await startUiBridge({places:()=>guidePlaces(),inspect:inspectUi,show:showUi}) } catch { /* Ordinary chat remains available. */ }
    try { premiumBridgeServer=await startPremiumBridge(fs.defaultDataDir(),{status:()=>premium.status(),quote:paidQuote,run:paidRun,job:paidJob,cancel:({job_id})=>premium.request(`/v1/jobs/${encodeURIComponent(job_id)}/cancel`,{})}) } catch { /* Free research remains available if the optional Premium bridge cannot start. */ }
    // the mail worker: a send attempt every 30 s (each send still waits the mailbox's minimum gap), replies every 5 min
    setInterval(() => mailTick().catch(() => {}), 30000)
    setInterval(() => replyTick().catch(() => {}), 5 * 60000)
    setTimeout(() => replyTick().catch(() => {}), 15000)
  })
  let cleanedUp = false
  app.on('before-quit', event => {
    if (cleanedUp) return
    event.preventDefault()
    cleanedUp = true
    clearTimeout(updateStartup)
    clearInterval(updateTimer)
    chatTurn?.stop()
    premiumBridgeServer?.close()
    uiBridgeServer?.close()
    for(const pending of guideRequests.values()){clearTimeout(pending.timer);pending.reject(new Error('The app is closing.'))}
    guideRequests.clear()
    stopOpportunityAudit().finally(()=>app.quit())
  })
  app.on('window-all-closed', () => app.quit())
}
