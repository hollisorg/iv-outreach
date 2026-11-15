// The chat's memory tools. The agent can save a short fact about the person or the selected business and look up
// what IV memory already holds. Like the handoff tools, the business always comes from Hivemind's turn.
export function memoryActions({ memory }) {
  return {
    remember(turn, { text, about = 'you' } = {}) {
      const scope = about === 'business' ? turn.brandId : 'you'
      if (about === 'business' && !scope) throw new Error('No business is selected in Hivemind, so save it about the person or ask them to pick a business.')
      const item = memory().add({ scope, text, source: 'Hivemind chat', by: 'hivemind' })
      turn.actions.push({ type: 'remembered', item: { id: item.id, text: item.text, about: scope === 'you' ? 'you' : 'business', business: scope === 'you' ? '' : turn.businessName } })
      return { status: item.existed ? 'already-known' : 'saved', text: item.text, note: 'Saved to IV memory, which every IV app chat reads. The person sees it in Hivemind and can edit or forget it.' }
    },
    recall(turn, { query = '' } = {}) {
      const scopes = ['you', turn.brandId].filter(Boolean)
      const found = memory().search(query, scopes)
      return { count: found.length, memories: found.map(item => ({ text: item.text, about: item.scope === 'you' ? 'the person' : turn.businessName || 'this business', savedFrom: item.source })) }
    },
  }
}
