// Ranking: who to call first.
//
// fit_score (0-100) comes from Claude judging the lead against the campaign ICP.
// engagement_score (0-100) comes from real replies: how fast they answered and what
// they said. We do not track opens (pixels are unreliable and privacy-hostile).
//
// rank = fit only, until someone replies; then engagement dominates, because a fast,
// interested reply beats a perfect-looking profile that never answers.

const INTENT_POINTS = {
  meeting: 50, interested: 40, question: 25, none: 10, not_now: 5, not_interested: -40, unsubscribe: -100,
}
const SENTIMENT_POINTS = { positive: 15, neutral: 0, negative: -15 }

export function latencyPoints(hours) {
  if (hours == null || !Number.isFinite(hours)) return 0
  if (hours <= 1) return 35
  if (hours <= 6) return 30
  if (hours <= 24) return 22
  if (hours <= 72) return 14
  return 8
}

export function engagementFrom({ firstSentAt, replies }) {
  if (!replies.length) return 0
  const first = replies[0]
  const hours = firstSentAt ? (Date.parse(first.received_at) - Date.parse(firstSentAt)) / 36e5 : null
  // The strongest signal across the thread wins (a "no" then "actually, call me" is a yes).
  const best = replies.reduce((acc, r) => Math.max(acc, INTENT_POINTS[r.intent] ?? 0), -Infinity)
  const last = replies[replies.length - 1]
  const finalIntent = INTENT_POINTS[last.intent] ?? 0
  const intent = finalIntent <= -40 ? finalIntent : best
  const score = latencyPoints(hours) + intent + (SENTIMENT_POINTS[last.sentiment] ?? 0) + Math.min(replies.length - 1, 3) * 3
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function rankFrom({ fit, engagement, replied }) {
  const f = fit ?? 50
  return replied ? Math.round((0.3 * f + 0.7 * engagement) * 10) / 10 : Math.round(0.6 * f * 10) / 10
}

const STATUS_FROM_INTENT = {
  meeting: 'meeting', interested: 'interested', question: 'replied', none: 'replied',
  not_now: 'replied', not_interested: 'not_interested',
}

export function recomputeLead(db, leadId) {
  const lead = db.prepare('select id, fit_score, status from leads where id = ?').get(leadId)
  if (!lead) return null
  const firstSent = db.prepare(`select min(sent_at) as at from messages where lead_id = ? and status = 'sent'`).get(leadId)
  const replies = db.prepare('select received_at, sentiment, intent from replies where lead_id = ? order by received_at').all(leadId)
  const engagement = engagementFrom({ firstSentAt: firstSent?.at, replies })
  const rank = lead.status === 'suppressed' ? 0 : rankFrom({ fit: lead.fit_score, engagement, replied: replies.length > 0 })
  db.prepare('update leads set engagement_score = ?, rank_score = ? where id = ?').run(engagement, rank, leadId)
  return { engagement, rank }
}

export { STATUS_FROM_INTENT }
