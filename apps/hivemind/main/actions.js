// Chat actions for Hivemind. The agent can look through saved handoffs and reopen one in its receiving app.
// The business comes from the turn Hivemind started, never from the agent. Reopening only launches the receiving
// app with an existing handoff ID; that app's own receipt rules return its existing project or draft, so nothing
// new is created, approved, spent, scheduled or published here.
import { APPS } from '../../../src/service/iv-workspace.js'

const appNames = { outreach: 'IV Outreach', studio: 'IV Studio', signal: 'IV Signal' }
const filler = new Set(('a an and any app apps at back be bring can could continue do for from get go handoff handoffs i ' +
  'in is it its item items left me my of off on one open our pick please pull re reopen resume show that the thing this ' +
  'to up want was where which with work working would you again existing iv').split(' '))
const appWords = { studio: ['studio', 'project', 'projects'], signal: ['signal', 'post', 'posts', 'draft', 'drafts'] }
const recentWords = ['latest', 'newest', 'recent', 'last']
const maxChoices = 6

const words = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter(Boolean)
const when = item => item.updatedAt || item.createdAt || ''

export function summarize(item) {
  return {
    id: item.id, app: item.target, appName: appNames[item.target], from: appNames[item.source] || 'IV',
    title: item.brief?.title || 'Creative brief', goal: item.brief?.goal || '', channel: item.brief?.channel || '',
    campaign: item.brief?.campaign || '', business: item.brandSnapshot?.name || '',
    status: item.status === 'draft-ready' ? 'Draft or project already made' : 'Not opened yet',
    createdAt: item.createdAt, updatedAt: item.updatedAt || item.createdAt,
  }
}

// Finds the handoffs that match what the person asked for, within the turn's business.
export function findHandoffs(handoffs, { brandId = '', search = '', app = '' } = {}) {
  const all = words(search)
  let target = Object.hasOwn(APPS, app) ? app : ''
  if (!target) {
    const hinted = Object.keys(appWords).filter(id => all.some(word => appWords[id].includes(word)))
    if (hinted.length === 1) target = hinted[0]
  }
  const recent = all.some(word => recentWords.includes(word))
  const terms = [...new Set(all.filter(word => !filler.has(word) && !recentWords.includes(word) && word !== 'most'
    && !Object.values(appWords).flat().includes(word)))]
  const scope = handoffs
    .filter(item => item.schema === 'iv.handoff.v1' && Object.hasOwn(APPS, item.target))
    .filter(item => !brandId || item.brandId === brandId)
    .filter(item => !target || item.target === target)
  const scored = scope.map(item => {
    const haystack = words([item.brief?.title, item.brief?.goal, item.brief?.campaign, item.brief?.channel,
      item.brief?.angle, item.brandSnapshot?.name, appNames[item.target]].join(' '))
    return { item, score: terms.filter(term => haystack.some(word => word === term || (term.length > 2 && word.startsWith(term)))).length }
  })
  const best = Math.max(0, ...scored.map(entry => entry.score))
  const matches = (terms.length ? scored.filter(entry => best > 0 && entry.score === best) : scored)
    .map(entry => entry.item)
    .sort((a, b) => when(b).localeCompare(when(a)))
  return { matches, app: target, recent, terms, inScope: scope.length }
}

// One clear match opens. "Latest" picks the newest match. Several matches become a choice for the person.
export function decideReopen(handoffs, request) {
  const found = findHandoffs(handoffs, request)
  if (found.matches.length === 1 || (found.recent && found.matches.length > 1)) return { kind: 'open', item: found.matches[0] }
  if (found.matches.length > 1) return { kind: 'choose', items: found.matches.slice(0, maxChoices) }
  return { kind: 'none', app: found.app, inScope: found.inScope }
}

// The operations behind the chat tools. readWorkspace/openApp/appStatus are injected so tests use fakes.
export function chatActions({ readWorkspace, openApp, appStatus, programs }) {
  const current = () => readWorkspace()
  const scoped = (turn) => current().handoffs.filter(item => !turn.brandId || item.brandId === turn.brandId)

  async function open(turn, item, registrations) {
    const summary = summarize(item)
    if (turn.opened.has(item.id)) return { status: 'already-opened', item: summary, note: 'Already opened in this reply.' }
    if (turn.opened.size >= 3) throw new Error('Hivemind opens at most three handoffs per reply.')
    const status = appStatus(item.target, programs, registrations)
    if (!status.installed) throw new Error(`${status.name} is not installed in the standard folder.`)
    if (!status.connected) throw new Error(`Open ${status.name} once to connect it, then ask again.`)
    await openApp({ id: item.target, handoffId: item.id, programs })
    turn.opened.add(item.id)
    turn.actions.push({ type: 'opened', item: summary })
    return {
      status: 'opened', item: summary,
      note: `${status.name} opened this handoff. It returns to its existing ${item.status === 'draft-ready' ? 'item' : 'import screen'} instead of making a copy. Nothing was approved, generated, scheduled or published.`,
    }
  }

  return {
    find(turn, { search = '', app = '' } = {}) {
      const found = findHandoffs(current().handoffs, { brandId: turn.brandId, search, app })
      const list = search || app ? found.matches : scoped(turn).sort((a, b) => when(b).localeCompare(when(a)))
      return { business: turn.businessName || 'All businesses', count: list.length, handoffs: list.slice(0, 20).map(summarize) }
    },
    async reopen(turn, { search = '', app = '', handoffId = '' } = {}) {
      const { handoffs, registrations } = current()
      if (handoffId) {
        const item = handoffs.find(entry => entry.id === handoffId && (!turn.brandId || entry.brandId === turn.brandId))
        if (!item) throw new Error('That handoff is not in the selected business. Look it up again.')
        return open(turn, item, registrations)
      }
      const decision = decideReopen(handoffs, { brandId: turn.brandId, search, app })
      if (decision.kind === 'open') return open(turn, decision.item, registrations)
      if (decision.kind === 'choose') {
        const items = decision.items.map(summarize)
        turn.actions.push({ type: 'choose', items })
        return { status: 'needs-choice', choices: items, note: 'Several handoffs match. Nothing was opened. Ask the person which one; Hivemind shows them as buttons.' }
      }
      return { status: 'not-found', note: decision.inScope ? 'No handoff in this business matches those words.' : 'This business has no handoffs for that app yet.', available: scoped(turn).slice(0, 10).map(summarize) }
    },
    // A choice button in the chat: only a handoff offered as a choice in this conversation can be opened this way.
    async choose(turn, handoffId, offered) {
      if (!offered.includes(handoffId)) throw new Error('Choose one of the handoffs Hivemind offered.')
      const { handoffs, registrations } = current()
      const item = handoffs.find(entry => entry.id === handoffId && (!turn.brandId || entry.brandId === turn.brandId))
      if (!item) throw new Error('That handoff is no longer available. Refresh Hivemind.')
      return open(turn, item, registrations)
    },
  }
}
