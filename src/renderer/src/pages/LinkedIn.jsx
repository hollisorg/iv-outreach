import { useState } from 'react'
import { call, useData } from '../api'

export default function LinkedIn({ notify }) {
  const [q, reload] = useData('linkedinQueue')
  const [opened, setOpened] = useState({})
  return (
    <div className="page linkedin">
      <header className="page-head">
        <p className="eyebrow">Send list</p>
        <h1>LinkedIn</h1>
        <p className="lede">
          LinkedIn doesn’t allow automated messages, so you send these yourself. One click copies the note and opens the
          profile. Paste, send, then mark it sent here.
        </p>
      </header>
      {!q ? (
        <p className="dim">Loading…</p>
      ) : (
        <>
          <p className="mono small dim">{q.remaining_today} of {q.daily_cap} left today</p>
          {!q.items.length ? (
            <div className="empty"><p>Nothing to send right now. Approved LinkedIn notes show up here.</p></div>
          ) : (
            <ol className="li-list">
              {q.items.map((it) => (
                <li key={it.message_id} className={`li-item ${opened[it.message_id] ? 'opened' : ''}`}>
                  <div className="li-who">
                    <strong>{it.name || it.company}</strong>
                    <span className="small dim">{it.name ? it.company : ''} · {it.kind}</span>
                  </div>
                  <blockquote className="li-note">{it.note}</blockquote>
                  <div className="li-act">
                    <button className="btn btn-primary" onClick={async () => {
                      try {
                        await call('copyAndOpenLinkedin', { url: it.profile_url, note: it.note })
                        setOpened({ ...opened, [it.message_id]: true })
                        notify('Note copied. Paste it into LinkedIn and send.', 'ok')
                      } catch (e) {
                        notify(e.message)
                      }
                    }}>Copy note & open profile</button>
                    <button className="btn" disabled={!opened[it.message_id]} title={opened[it.message_id] ? '' : 'Open the profile first'} onClick={async () => {
                      try {
                        await call('markLinkedinSent', { id: it.message_id })
                        reload()
                      } catch (e) {
                        notify(e.message)
                      }
                    }}>I sent it</button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}
