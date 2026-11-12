# OpenOutreach integration — 2026-11-12

Historical v0.1.1 CSV adapter notes. IV Outreach v0.2.0 additionally runs discovery directly from chat; see
[the runtime integration](openoutreach-runtime.md). The CSV behavior described below remains available.

FitScout 0.1.1 connects through OpenOutreach's documented CSV contract. This is an import integration, not an embedded
OpenOutreach install or a live discovery connector. No API keys are needed to import existing exports. OpenOutreach's
own setup, provider keys and discovery remain separate; its sender is never called by FitScout.

## Use

1. In a configured OpenOutreach terminal, export existing leads: `openoutreach find 0 > leads.csv`.
2. In FitScout choose a campaign, then Leads → OpenOutreach → Choose OpenOutreach CSV.
3. Review the first five rows and click Import into the campaign.
4. Open a lead to see the OpenOutreach fit explanation and source identity. Ask the chat to research and draft outreach;
   approve messages through the normal FitScout flow.

Generic CSV imports auto-detect the same format. Agents can call `fitscout_import_openoutreach` with `campaign_id`, an
absolute `path`, and optional `preview_only: true`. The result reports rows, added, duplicates, updated, suppressed,
invalid and conflicts. Updated is a subset of duplicates (contacts already in the campaign). An unchanged repeat import
reports zero updates. Conflicts are skipped, not merged. Preview row counts are file counts, not promised new contacts.

Required headers: `email,first_name,last_name,company,title,website,linkedin_url,reason,lead_id,qualified_at`.
Email and profile can be blank; source ID cannot. UTF-8 and BOM-marked UTF-16LE exports work, including Windows PowerShell
redirected output. Limits: 10 MB and 10,000 rows. Reasons retain up to 10,000 characters. The CSV must come from the
same OpenOutreach store when repeating source IDs within a campaign.

## Data behavior

- Migration 4 adds only `lead_sources`, with campaign/provider/source-ID identity and a reference to an existing lead.
- Normalized emails and LinkedIn profiles match contacts already imported through other sources.
- Repeat imports fill missing contact fields and refresh provider explanations; they preserve manual edits, notes,
  scores, bounced addresses, reply history, statuses and message approvals. Conflicting nonempty email/profile fields
  are skipped for manual resolution.
- The global do-not-contact list applies to new and refreshed contacts. Discovering a blocked address cancels pending
  drafts/approvals for that lead. No draft, approval, send, provider lookup, or network call is triggered by an import.
- Source explanations are separate from FitScout fit scores and never automatically copied into outreach.
- Imports use a transaction. Invalid source IDs or truncated quoted fields fail before writes; later errors roll back
  the batch. Preview does not write to the database.

## Upstream review

Reviewed the current [repository README](https://github.com/eracle/OpenOutreach),
[CSV/CLI contract](https://github.com/eracle/OpenOutreach/blob/main/skills/find-leads/SKILL.md), and
[package metadata](https://github.com/eracle/OpenOutreach/blob/main/pyproject.toml) on 2026-11-12.
They describe browserless discovery and GPL-3.0-or-later licensing. This integration is independently written against
the public data format: no upstream Python, GPL code, installer, or dependency was added to FitScout.

## Verification

- `npm.cmd test`: 29/29 passed, including the existing approval-card, migration, mailbox and suppression checks.
- New tests cover quoting/newlines, PowerShell encoding, source-ID dedupe without contact handles, later email enrichment,
  preserving manual corrections and bounced addresses, suppression across campaigns, identity conflicts and rollback.
- MCP round trip: dedicated preview/import and generic re-import passed against a temporary database.
- `npm.cmd run build`: passed.
- `node scripts/openoutreach-ui-check.mjs docs/verification/openoutreach`: passed in the built Electron app: preview
  wrote nothing, two fictional leads imported, repeat import added zero, explanations rendered, no messages, no page errors.
- Screenshots: `docs/verification/openoutreach/`. Compact 1100×800 and desktop 1440×900 layouts inspected.
- Windows installer built: `dist/Fitscout-Setup-0.1.1.exe`. The original 0.1.0 installer remains available.
- `node scripts/openoutreach-ui-check.mjs docs/verification/openoutreach-packaged --packaged`: passed the same import,
  preview, repeat-import and explanation checks against the packaged executable; zero messages and page errors.
- `node scripts/packaged-check.mjs docs/verification/openoutreach-packaged`: packaged MCP server exposes 29 tools;
  packaged window opens without page errors. The NSIS installation process itself was not run.

The sandbox blocked Electron launch and a temporary IPC file rename in the pre-existing approval-card test. Both passed
when rerun with the required local process access. No real campaigns, mailbox, provider credentials, searches or sends
were used. Real upstream discovery and real CSV from the user's account remain untested.

## Rollback and ownership

Source changes are uncommitted; no remote or deployment was created. The production/user data folder was not opened by
verification. Migration 4 runs on the next launch against whichever database the user chooses. It is additive; do not
delete user lead data to roll back. The previous 0.1.0 app can ignore the new table; retain a database backup before any
manual rollback. Keep the previous installer. Matthew owns provider setup and the first real import/mailbox test.
