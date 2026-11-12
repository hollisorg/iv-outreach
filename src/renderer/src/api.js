import { useCallback, useEffect, useState } from 'react'

export const call = (method, args) => window.fitscout.call(method, args)
export const on = (channel, cb) => window.fitscout.on(channel, cb)

// Load something and reload it when the agent (or anything else) changes data, and every few seconds while the
// window is visible, since the MCP server in Claude Desktop writes to the same database.
export function useData(method, args, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const key = JSON.stringify(args || {})
  const load = useCallback(() => {
    call(method, args).then(
      (d) => (setData(d), setError(null)),
      (e) => setError(e.message),
    )
  }, [method, key, ...deps])
  useEffect(() => {
    load()
    const off = on('data:changed', load)
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 5000)
    return () => (off(), clearInterval(t))
  }, [load])
  return [data, load, error]
}

export const pct = (a, b) => (b ? Math.min(100, Math.round((100 * a) / b)) : 0)
export const when = (at) => {
  if (!at) return ''
  const d = new Date(at)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days} d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const STATUS = {
  new: 'New', enriched: 'Researched', drafted: 'Drafted', contacted: 'Contacted', replied: 'Replied',
  interested: 'Interested', meeting: 'Meeting', not_interested: 'Not interested', suppressed: 'Do not contact',
}

// Anywhere in the app can hand the chat a question (ChatPanel listens).
export const askAgent = ({ text = '', send = false } = {}) => window.dispatchEvent(new CustomEvent('fs:ask', { detail: { text, send } }))
