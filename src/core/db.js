// Local SQLite store shared by the desktop app and the MCP server.
// Both processes open the same file; WAL mode plus a busy timeout keeps
// concurrent readers and short writes safe.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export function defaultDataDir() {
  if (process.env.FITSCOUT_DATA_DIR) return process.env.FITSCOUT_DATA_DIR
  const base = process.env.APPDATA || join(homedir(), '.config')
  return join(base, 'Fitscout')
}

const MIGRATIONS = [
  `
  create table campaigns (
    id text primary key,
    name text not null,
    offer text,
    icp_json text not null default '{}',
    source_url text,
    status text not null default 'active' check (status in ('active','paused','archived')),
    created_at text not null,
    updated_at text not null
  );

  create table leads (
    id text primary key,
    campaign_id text not null references campaigns(id) on delete cascade,
    name text,
    title text,
    company text,
    website text,
    domain text,
    email text,
    email_status text not null default 'none'
      check (email_status in ('none','provided','found_on_site','bounced')),
    linkedin_url text,
    phone text,
    location text,
    source text not null default 'manual',
    source_url text,
    notes text,
    socials_json text not null default '{}',
    site_summary text,
    fit_score integer,
    fit_reason text,
    engagement_score integer not null default 0,
    rank_score real not null default 0,
    status text not null default 'new' check (status in
      ('new','enriched','drafted','contacted','replied','interested','meeting','not_interested','suppressed')),
    enriched_at text,
    last_contacted_at text,
    first_reply_at text,
    created_at text not null,
    updated_at text not null
  );
  create index leads_campaign on leads(campaign_id, rank_score desc);
  create unique index leads_campaign_email on leads(campaign_id, email) where email is not null;
  create unique index leads_campaign_linkedin on leads(campaign_id, linkedin_url) where linkedin_url is not null;

  create table messages (
    id text primary key,
    lead_id text not null references leads(id) on delete cascade,
    campaign_id text not null references campaigns(id) on delete cascade,
    channel text not null check (channel in ('email','linkedin')),
    step integer not null default 1,
    subject text,
    body text not null,
    status text not null default 'draft' check (status in
      ('draft','approved','sent','failed','skipped','cancelled')),
    issues_json text not null default '[]',
    approved_at text,
    sent_at text,
    error text,
    external_id text,
    created_at text not null,
    updated_at text not null
  );
  create index messages_status on messages(campaign_id, status);
  create index messages_lead on messages(lead_id);

  create table replies (
    id text primary key,
    lead_id text not null references leads(id) on delete cascade,
    message_id text references messages(id) on delete set null,
    channel text not null check (channel in ('email','linkedin','phone','other')),
    received_at text not null,
    text text,
    sentiment text not null default 'neutral' check (sentiment in ('positive','neutral','negative')),
    intent text not null default 'none' check (intent in ('none','question','interested','meeting','not_now','not_interested','unsubscribe')),
    created_at text not null
  );
  create index replies_lead on replies(lead_id);

  create table suppression (
    kind text not null check (kind in ('email','domain','linkedin')),
    value text not null,
    reason text,
    created_at text not null,
    primary key (kind, value)
  );

  create table settings (
    key text primary key,
    value text not null
  );

  create table events (
    id integer primary key autoincrement,
    at text not null,
    kind text not null,
    lead_id text,
    data_json text not null default '{}'
  );
  `,
]

export function openDb(file) {
  const path = file || join(defaultDataDir(), 'fitscout.db')
  if (path !== ':memory:') mkdirSync(join(path, '..'), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('pragma journal_mode = wal; pragma busy_timeout = 5000; pragma foreign_keys = on;')
  db.exec('create table if not exists schema_version (version integer not null)')
  const row = db.prepare('select version from schema_version').get()
  let version = row ? row.version : 0
  if (!row) db.prepare('insert into schema_version (version) values (0)').run()
  while (version < MIGRATIONS.length) {
    tx(db, () => {
      db.exec(MIGRATIONS[version])
      version += 1
      db.prepare('update schema_version set version = ?').run(version)
    })
  }
  return db
}

export function tx(db, fn) {
  db.exec('begin immediate')
  try {
    const result = fn()
    db.exec('commit')
    return result
  } catch (err) {
    db.exec('rollback')
    throw err
  }
}

export const now = () => new Date().toISOString()
export const newId = () => randomUUID()

export function logEvent(db, kind, leadId, data = {}) {
  db.prepare('insert into events (at, kind, lead_id, data_json) values (?, ?, ?, ?)')
    .run(now(), kind, leadId || null, JSON.stringify(data))
}

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('select value from settings where key = ?').get(key)
  if (!row) return fallback
  try { return JSON.parse(row.value) } catch { return fallback }
}

export function setSetting(db, key, value) {
  db.prepare('insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value')
    .run(key, JSON.stringify(value))
}
