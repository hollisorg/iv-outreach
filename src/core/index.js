export { listBusinesses, getBusiness, createBusiness, updateBusiness } from './businesses.js'
// Single entry point for the desktop app and the MCP server.
export { openDb, defaultDataDir, getSetting, setSetting } from './db.js'
export { createCampaign, updateCampaign, getCampaign, listCampaigns } from './campaigns.js'
export { addLeads, importCsv, importOpenOutreachCsv, importOpenOutreachRecords, getLead, listLeads, setFitScores, updateLead, exportCsv } from './leads.js'
export { previewOpenOutreachCsv } from './openoutreach.js'
export { researchPlan, saveResearch } from './research.js'
export { scannerState,saveScan,removeScan,runScan } from './scanners.js'
export { enrichLeads, fetchWebsiteText } from './enrich.js'
export { suppress, isSuppressed, listSuppression } from './suppression.js'
export {
  getSender, saveSender, senderGaps, saveDrafts, editMessage, approveMessages, cancelMessages, listMessages,
  dueMessages, linkedinQueue, socialQueue, socialTarget, SOCIAL_CHANNELS, CHANNEL_NAMES, composeEmail, markSent,
  markFailed, logReply, sentToday,
} from './outreach.js'
export { recomputeLead } from './scoring.js'
export { searchGoogleMaps, scraperPath, geocode } from './gmaps.js'
export { findSocials, useSocial, lookupUsername, candidateHandles } from './usernames.js'
export {
  PRESETS as MAIL_PRESETS, getMailbox, saveMailbox, mailboxReady, makeTransport, makeImap, testMailbox, sendNext,
  checkReplies, handleIncoming, classifyReply, mailStatus,
} from './mailer.js'

import { listCampaigns } from './campaigns.js'
import { getSender, senderGaps, sentToday, SOCIAL_CHANNELS } from './outreach.js'

export function overview(db, { business_id } = {}) {
  const sender = getSender(db)
  const campaigns = listCampaigns(db, {business_id})
  const hot = db.prepare(`select l.id, l.name, l.company, l.status, l.rank_score, l.first_reply_at, c.name as campaign
    from leads l join campaigns c on c.id = l.campaign_id
    where l.status in ('interested','meeting','replied') ${business_id ? 'and c.business_id = ?' : ''} order by l.rank_score desc limit 10`).all(...(business_id ? [business_id] : []))
  const count = condition => db.prepare(`select count(*) n from messages m join campaigns c on c.id=m.campaign_id where ${condition} ${business_id ? 'and c.business_id = ?' : ''}`).get(...(business_id ? [business_id] : [])).n
  return {
    business_id: business_id || null,
    sender_ready: senderGaps(sender).length === 0,
    sender_missing: senderGaps(sender),
    today: {
      emails_sent: sentToday(db, 'email'),
      email_cap: sender.daily_email_cap,
      linkedin_sent: sentToday(db, 'linkedin'),
      linkedin_cap: sender.daily_linkedin_cap,
      social_sent: SOCIAL_CHANNELS.filter((c) => c !== 'linkedin').reduce((n, c) => n + sentToday(db, c), 0),
      social_cap_each: sender.daily_social_cap,
    },
    social_waiting: count("m.status = 'approved' and m.channel != 'email'"),
    drafts_waiting_approval: count("m.status = 'draft'"),
    approved_waiting_to_send: count("m.status = 'approved'"),
    campaigns: campaigns.map((c) => ({
      id: c.id, business_id: c.business_id, name: c.name, status: c.status, leads: c.lead_count, contacted: c.contacted_count,
      replied: c.replied_count, drafts_waiting: c.drafts_waiting,
    })),
    hottest_leads: hot,
  }
}
