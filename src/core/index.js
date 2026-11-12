// Single entry point for the desktop app and the MCP server.
export { openDb, defaultDataDir, getSetting, setSetting } from './db.js'
export { createCampaign, updateCampaign, getCampaign, listCampaigns } from './campaigns.js'
export { addLeads, importCsv, getLead, listLeads, setFitScores, updateLead, exportCsv } from './leads.js'
export { enrichLeads, fetchWebsiteText } from './enrich.js'
export { suppress, isSuppressed, listSuppression } from './suppression.js'
export {
  getSender, saveSender, senderGaps, saveDrafts, editMessage, approveMessages, cancelMessages, listMessages,
  dueMessages, linkedinQueue, composeEmail, markSent, markFailed, logReply, sentToday,
} from './outreach.js'
export { recomputeLead } from './scoring.js'

import { listCampaigns } from './campaigns.js'
import { getSender, senderGaps, sentToday } from './outreach.js'

export function overview(db) {
  const sender = getSender(db)
  const campaigns = listCampaigns(db)
  const hot = db.prepare(`select l.id, l.name, l.company, l.status, l.rank_score, l.first_reply_at, c.name as campaign
    from leads l join campaigns c on c.id = l.campaign_id
    where l.status in ('interested','meeting','replied') order by l.rank_score desc limit 10`).all()
  return {
    sender_ready: senderGaps(sender).length === 0,
    sender_missing: senderGaps(sender),
    today: {
      emails_sent: sentToday(db, 'email'),
      email_cap: sender.daily_email_cap,
      linkedin_sent: sentToday(db, 'linkedin'),
      linkedin_cap: sender.daily_linkedin_cap,
    },
    drafts_waiting_approval: db.prepare(`select count(*) as n from messages where status = 'draft'`).get().n,
    approved_waiting_to_send: db.prepare(`select count(*) as n from messages where status = 'approved'`).get().n,
    campaigns: campaigns.map((c) => ({
      id: c.id, name: c.name, status: c.status, leads: c.lead_count, contacted: c.contacted_count,
      replied: c.replied_count, drafts_waiting: c.drafts_waiting,
    })),
    hottest_leads: hot,
  }
}
