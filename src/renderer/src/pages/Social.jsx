import PageStage from '../components/PageStage'
import { useEffect, useState } from 'react'
import { call, useData } from '../api'
import emptyArt from '../assets/outreach-conversation-v1.png'

const NAMES = { linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', x: 'X', tiktok: 'TikTok' }

export default function Social({ notify, business }) {
  const [q, reload] = useData('socialQueue', {business_id: business?.id || '__none__'})
  const [filter, setFilter] = useState('all')
  const [current, setCurrent] = useState(0)
  const [opened, setOpened] = useState({})
  useEffect(() => { setCurrent(0); setFilter('all'); setOpened({}) }, [business?.id])
  const items = (q?.items || []).filter((i) => filter === 'all' || i.channel === filter)
  const it = items[Math.min(current, Math.max(0, items.length - 1))]

  const open = async (item = it) => {
    if (!item) return
    try {
      await call('copyAndOpenSocial', { url: item.open_url, note: item.note })
      setOpened((o) => ({ ...o, [item.message_id]: true }))
      notify(`Note copied. Paste it into ${item.channel_name} and send.`, 'ok')
    } catch (e) {
      notify(e.message)
    }
  }
  const sent = async (item = it) => {
    if (!item) return
    try {
      await call('markSocialSent', { id: item.message_id })
      reload()
    } catch (e) {
      notify(e.message)
    }
  }
  // fast mode keys: O open, S sent, J/K next/previous
  useEffect(() => {
    const onKey = (e) => {
      if (/input|textarea|select/i.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'o') open()
      else if (k === 's' && it && opened[it.message_id]) sent()
      else if (k === 'j') setCurrent((c) => Math.min(c + 1, items.length - 1))
      else if (k === 'k') setCurrent((c) => Math.max(c - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [it?.message_id, opened, items.length])

  const counts = Object.fromEntries(Object.keys(NAMES).map((ch) => [ch, (q?.items || []).filter((i) => i.channel === ch).length]))
  return (
    <div className="page social">
      <PageStage kind="social" title="Social" kicker="Infinite Variance / Human connections" subtitle="A real conversation starts with you." />
      <div className="social-guide" aria-label="How social sending works">
        <div><b>01</b><strong>Open a profile</strong><span>Copy your approved note.</span></div>
        <div><b>02</b><strong>Make the connection</strong><span>Paste and send it yourself.</span></div>
        <div><b>03</b><strong>Keep your place</strong><span>Mark it sent when you're done.</span></div>
      </div>
      <p className="social-keyboard small dim"><kbd>O</kbd> open · <kbd>S</kbd> mark sent · <kbd>J</kbd> / <kbd>K</kbd> move through notes</p>

      {q && (
        <div className="seg-row">
          <div className="segmented" role="radiogroup" aria-label="Platform">
            <button role="radio" aria-checked={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => (setFilter('all'), setCurrent(0))}>All {q.items.length || ''}</button>
            {Object.entries(NAMES).map(([ch, label]) => (
              <button key={ch} role="radio" aria-checked={filter === ch} className={filter === ch ? 'on' : ''} disabled={!counts[ch]} onClick={() => (setFilter(ch), setCurrent(0))}>
                {label} {counts[ch] || ''}
              </button>
            ))}
          </div>
          <span className="mono small dim">
            {Object.entries(q.channels).map(([ch, c]) => `${NAMES[ch]} ${c.sent_today}/${c.daily_cap}`).join(' · ')}
          </span>
        </div>
      )}

      {!q ? (
        <p className="dim">Loading…</p>
      ) : !items.length ? (
        <div className="empty art">
          <img src={emptyArt} alt="" width="200" height="200" />
          <div>
            <p className="empty-title">Nothing to send right now.</p>
            <p className="dim">Approved social notes land here. Ask the chat to write some for leads with a profile.</p>
          </div>
        </div>
      ) : (
        <ol className="li-list">
          {items.map((item, i) => (
            <li key={item.message_id} className={`li-item ${i === current ? 'current' : ''} ${opened[item.message_id] ? 'opened' : ''}`} onClick={() => setCurrent(i)}>
              <div className="li-who">
                <span className={`chan ${item.channel}`}>{item.channel_name}</span>
                <strong>{item.name || item.company}</strong>
                <span className="small dim">{item.name ? item.company : ''} · {item.kind}{item.step > 1 ? ` · follow-up ${item.step - 1}` : ''}</span>
              </div>
              <blockquote className="li-note">{item.note}</blockquote>
              <div className="li-act">
                <button className="btn btn-primary" onClick={(e) => (e.stopPropagation(), open(item))}>Copy note & open {item.channel === 'linkedin' || item.channel === 'x' || item.channel === 'tiktok' ? 'profile' : 'DM'}</button>
                <button className="btn" disabled={!opened[item.message_id]} title={opened[item.message_id] ? '' : 'Open it first'} onClick={(e) => (e.stopPropagation(), sent(item))}>I sent it</button>
                <span className="mono small dim to">{item.profile_url?.replace(/^https:\/\/(www\.)?/, '')}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
