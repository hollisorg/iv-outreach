import { askAgent, when, STATUS } from '../api'

export default function Today({ campaign, overview, go, openChat }) {
  if (!overview) return <div className="page"><p className="dim">Loading…</p></div>
  const c = overview.campaigns.find((x) => x.id === campaign?.id)
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const ask = (text) => (openChat(), askAgent({ text }))

  return (
    <div className="page today">
      <header className="page-head">
        <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1>{greet}.</h1>
        <p className="lede">
          {c
            ? `${c.name}: ${c.leads} lead${c.leads === 1 ? '' : 's'} found, ${c.contacted} contacted, ${c.replied} replied.`
            : 'Start by telling the chat who your best customers are, or hand it a franchise website.'}
        </p>
      </header>

      {!overview.sender_ready && (
        <div className="banner">
          <div>
            <strong>Finish your sender profile before anything sends.</strong>
            <p className="small">Missing: {overview.sender_missing.join(', ')}. Every email carries your real name, company and postal address.</p>
          </div>
          <button className="btn" onClick={() => go('settings')}>Open Settings</button>
        </div>
      )}

      {!c ? (
        <section className="start">
          <h2>Three ways to start</h2>
          <div className="start-grid">
            <button className="start-card" onClick={() => ask('Build me a campaign from this franchise website: ')}>
              <span className="num mono">01</span>
              <span className="start-title">From a website</span>
              <span className="small dim">Paste a company or franchise site. The agent reads it and drafts your ideal customer profile.</span>
            </button>
            <button className="start-card" onClick={() => ask('My best customers are ')}>
              <span className="num mono">02</span>
              <span className="start-title">Describe your customers</span>
              <span className="small dim">Industry, owner titles, cities or ZIPs, company size. Plain words are fine.</span>
            </button>
            <button className="start-card" onClick={() => ask('I have a CSV of leads to import. ')}>
              <span className="num mono">03</span>
              <span className="start-title">Bring a list</span>
              <span className="small dim">Drop a CSV from Sales Navigator, Apollo or a spreadsheet into the chat.</span>
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="tiles">
            <Tile n={c.leads} label="Leads found" onClick={() => go('leads')} />
            <Tile n={c.drafts_waiting} label="Drafts to approve" hot={c.drafts_waiting > 0} onClick={() => go('approve')} />
            <Tile n={c.contacted} label="Contacted" onClick={() => go('leads')} />
            <Tile n={c.replied} label="Replied" hot={c.replied > 0} onClick={() => go('leads')} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Call these first</h2>
              <span className="small dim">Ranked by how fast they replied and what they said</span>
            </div>
            {overview.hottest_leads.length ? (
              <ol className="hot-list">
                {overview.hottest_leads.map((l, i) => (
                  <li key={l.id}>
                    <button onClick={() => go('leads', { leadId: l.id })}>
                      <span className="rank mono">{String(i + 1).padStart(2, '0')}</span>
                      <span className="hot-who">
                        <span>{l.name || l.company}</span>
                        <span className="small dim">{l.name ? l.company : ''}</span>
                      </span>
                      <span className={`chip st-${l.status}`}>{STATUS[l.status]}</span>
                      <span className="mono small dim">{when(l.first_reply_at)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty">
                <p>No replies yet. When someone answers, they land here, fastest and keenest first.</p>
                {c.leads > 0 && c.contacted === 0 && (
                  <button className="btn" onClick={() => ask('Research my leads, score their fit and draft first emails for the best ones.')}>
                    Research, score and draft my leads
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Tile({ n, label, hot, onClick }) {
  return (
    <button className={`tile ${hot ? 'is-hot' : ''}`} onClick={onClick}>
      <span className="tile-n">{n}</span>
      <span className="tile-label">{label}</span>
    </button>
  )
}
