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

export const MIGRATIONS = [
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
  // 2: social channels (assisted send lists) and Google Business Profile details on leads
  `
  create table messages_v2 (
    id text primary key,
    lead_id text not null references leads(id) on delete cascade,
    campaign_id text not null references campaigns(id) on delete cascade,
    channel text not null check (channel in ('email','linkedin','facebook','instagram','x','tiktok')),
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
  insert into messages_v2 (id, lead_id, campaign_id, channel, step, subject, body, status, issues_json, approved_at,
    sent_at, error, external_id, created_at, updated_at)
    select id, lead_id, campaign_id, channel, step, subject, body, status, issues_json, approved_at,
    sent_at, error, external_id, created_at, updated_at from messages;
  drop table messages;
  alter table messages_v2 rename to messages;
  create index messages_status on messages(campaign_id, status);
  create index messages_lead on messages(lead_id);

  create table replies_v2 (
    id text primary key,
    lead_id text not null references leads(id) on delete cascade,
    message_id text references messages(id) on delete set null,
    channel text not null check (channel in ('email','linkedin','facebook','instagram','x','tiktok','phone','other')),
    received_at text not null,
    text text,
    sentiment text not null default 'neutral' check (sentiment in ('positive','neutral','negative')),
    intent text not null default 'none' check (intent in ('none','question','interested','meeting','not_now','not_interested','unsubscribe')),
    created_at text not null
  );
  insert into replies_v2 (id, lead_id, message_id, channel, received_at, text, sentiment, intent, created_at)
    select id, lead_id, message_id, channel, received_at, text, sentiment, intent, created_at from replies;
  drop table replies;
  alter table replies_v2 rename to replies;
  create index replies_lead on replies(lead_id);

  alter table leads add column category text;
  alter table leads add column rating real;
  alter table leads add column review_count integer;
  alter table leads add column address text;
  alter table leads add column socials_scanned_at text;
  `,
  // 3: which mailbox messages the reply checker has already looked at
  `
  create table mail_seen (
    mailbox text not null,
    uid integer not null,
    primary key (mailbox, uid)
  );
  `,
  // 4: stable source identities and explanations for repeat OpenOutreach imports.
  `
  create table lead_sources (
    campaign_id text not null references campaigns(id) on delete cascade,
    provider text not null,
    external_id text not null,
    lead_id text not null references leads(id) on delete cascade,
    reason text,
    qualified_at text,
    primary key (campaign_id, provider, external_id)
  );
  create index lead_sources_lead on lead_sources(lead_id);
  `,
  // 5: native agent research, separate observations from proposed opportunities and unknowns.
  `
  create table lead_research (
    lead_id text primary key references leads(id) on delete cascade,
    research_json text not null
  );
  `,
  // 6: businesses own campaigns; existing campaign and lead IDs remain unchanged.
  `
  create table businesses (
    id text primary key, name text not null, profile_json text not null default '{}',
    created_at text not null, updated_at text not null
  );
  insert into businesses(id,name,profile_json,created_at,updated_at)
    select 'legacy-business', coalesce(nullif((select json_extract(value,'$.profile.company') from settings where key='iv_onboarding_v1'),''),'My business'),
    coalesce((select json_extract(value,'$.profile') from settings where key='iv_onboarding_v1'),'{}'),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
    where exists(select 1 from campaigns);
  alter table campaigns add column business_id text references businesses(id);
  update campaigns set business_id='legacy-business';
  create index campaigns_business on campaigns(business_id);
  create trigger campaigns_business_insert before insert on campaigns when new.business_id is null
    begin select raise(abort,'A campaign needs a business'); end;
  create trigger campaigns_business_update before update of business_id on campaigns when new.business_id is null
    begin select raise(abort,'A campaign needs a business'); end;
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
  if (version < MIGRATIONS.length) {
    // table rebuilds need foreign keys off (it can't change inside a transaction)
    db.exec('pragma foreign_keys = off')
    while (version < MIGRATIONS.length) {
      tx(db, () => {
        db.exec(MIGRATIONS[version])
        version += 1
        db.prepare('update schema_version set version = ?').run(version)
      })
    }
    db.exec('pragma foreign_keys = on')
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
