# Fitscout: agent context

Name chosen by Matthew 2026-11-12. Renamed from the working name "Leadwell" because LeadSwell, Inc. (a San Francisco
B2B lead-gen company with a US trademark filing) was too close. fitscout.com was unregistered when checked that day.
A quick web and trademark search found no conflict, but there has been no legal clearance. Owner: Matthew Hollis
(The Hollis Organization).
**Closed personal test, not for sale** (Matthew, 2026-11-12). Licensing no longer blocks tools; see Hard rules for what stays out.
Folder: C:\Users\Matthew\Desktop\fitscout (local git, no remote). Installer: dist\Fitscout-Setup-<version>.exe.

## What it is

A downloadable desktop lead finder that Claude drives from chat:
ICP (from criteria, or from a company or franchise website) -> Claude researches real businesses -> website
Google Maps search -> website enrichment + social lookup -> fit score -> drafted outreach -> human approval -> email
sent by the app from the user's own mailbox (SMTP), social notes (LinkedIn, Facebook, Instagram, X, TikTok) sent by the
user from the Social send list -> replies read back from the mailbox (IMAP) or logged -> leads ranked by reply speed and intent.

## Architecture

- `src/core/`: plain ESM JavaScript, `node:sqlite` (no native modules). One DB file at
  `%APPDATA%\Fitscout\fitscout.db` (override with `FITSCOUT_DATA_DIR`). WAL mode; the app and the MCP server share it.
- `src/mcp/server.js`: stdio MCP server. All tools are prefixed `fitscout_`. Agents launch it with the app's own
  Electron binary and `ELECTRON_RUN_AS_NODE=1`, so users don't need Node installed.
- `src/main`, `src/preload`, `src/renderer`: the Electron + electron-vite + React desktop app (same stack as IV Studio).
  The renderer gets one allowlisted `call(method)` bridge plus three event streams; no Node in the window.
- `src/service/`: **ported from IV Studio** (Matthew's own MIT code), per his 2026-11-12 request to replicate IV Studio's
  chat and harness installs:
  - `harness.js` finds the person's Claude Code / Codex; `hermesacp.js` finds Hermes and speaks ACP to it.
  - `agentinstall.js` installs Claude Code or Codex with the maker's official installer, and opens a sign-in window.
  - `agentrun.js` + `agentchat.js`: the in-app chat. One headless turn per message on the person's own plan,
    resuming the agent's session. Tools: Fitscout's MCP server plus the agent's web search and page reading (Fitscout
    needs web research to find businesses; IV Studio's chat gets MCP only). No shell, no files.
  - Allow cards: in chat mode (`FITSCOUT_AGENT_RUN=chat`), the MCP server writes an ask file for approve, cancel,
    sender-profile changes, campaign status, marking LinkedIn sent and CSV export (`agentrun.js chatAsk`) and waits
    for the person's Allow/Don't allow in the app.
  - `agent.js`: the "paste into any agent" message and the Claude Code skill (Settings -> Use Fitscout from your other apps).
- Sources: `core/gmaps.js` (gosom Google Maps scraper, fast mode, coordinates via OpenStreetMap Nominatim),
  `core/usernames.js` (WhatsMyName data, ~485 business-relevant sites; NSFW/dating/political/health/gaming excluded).
  Only handles from the business's own site (or given explicitly) are "confirmed"; same-name accounts elsewhere are
  listed as unconfirmed and never used as a message target until the person clicks Use this. See `vendor/README.md`.
- Email: `core/mailer.js`. nodemailer sends one approved email at a time (min gap 60-90 s, daily cap), imapflow +
  mailparser read replies every 5 min (auto-classify; "stop" -> do-not-contact; bounces mark the address). The
  mailbox password is encrypted with Electron safeStorage (DPAPI) in `app-settings.json`, used only in the app process.
- Window: frameless with `titleBarOverlay` like IV Studio; logo drawn in code (`components/Logo.jsx`,
  `build/icon.svg`); illustrations made with Codex (sources outside the repo, webp copies in `renderer/src/assets`).
## Hard rules (agreed with Matthew 2026-11-12)

- No automatic account creation, no burner or rotated identities, no measures meant to dodge spam or platform detection.
- No social send automation (LinkedIn, Facebook, Instagram, X, TikTok): assisted manual-send list only. Matthew asked
  twice (2026-11-12) to integrate OpenOutreach, including on a dummy account; declined both times: it's LinkedIn bot
  automation with stealth plugins (detection evasion), and a dummy account adds a fake identity messaging real people.
- No automatic account creation; no Blackbird-style email enumeration via other sites' sign-up/reset endpoints.
- Nothing sends without approval. In the in-app chat that's enforced with an Allow card; from external agents,
  `fitscout_approve_messages` is only for messages the person approved in chat.
- Email includes the real sender, company, postal address, a "reply stop" opt-out and a `List-Unsubscribe` header.
  Hard caps: 75 emails/day and 25 LinkedIn notes/day.
- The do-not-contact list applies across all campaigns. Any reply stops pending follow-ups.
- Enrichment reads only a business's own public site (respecting robots.txt, with a private-network guard). Never guess
  personal emails. No cross-site username hunting (Blackbird/WhatsMyName-style) on individuals.
- Before bundling any open-source dependency, check its license: GPL/AGPL code can't ship in a closed commercial app
  without obligations.

## Validation

```powershell
npm.cmd install
npm.cmd test                                   # 22 tests, local servers only, no spend
npm.cmd run dist                               # builds dist\Fitscout-Setup-<version>.exe (needs vendor\gmaps exe)
node scripts/ui-check.mjs <dir> [--chat]       # built app on fictional demo data, screenshots; --chat = real Allow-card turn
node scripts/ui-empty.mjs <dir>                # first-run welcome screen
node scripts/packaged-check.mjs <dir> [--live] # packaged MCP server + bundled scraper + window
node scripts/chat-smoke.mjs claude|codex|hermes allow|deny ["custom message"]
```

Verified 2026-11-12: 22/22 tests (migration from v1 DB, social limits and DM links, Maps mapping, username confirmed vs
unconfirmed, SMTP send + pace + bounce against a local server, reply classification). Live: Google Maps search found 18
Dublin OH HVAC businesses in 2 s with ratings; WhatsMyName lookup checked ~400 sites in ~40 s; a real Claude Code chat
turn ran Maps + socials end to end and kept same-name accounts unconfirmed; packaged app: MCP (28 tools) + bundled
scraper (3 live results) + window with no errors. Allow cards verified earlier on Claude Code, Codex and Hermes.
Not verified: a real mailbox (SMTP/IMAP against Gmail or Outlook), installing the NSIS installer itself, installing
Claude Code/Codex from the app, code signing (installer is unsigned, so SmartScreen will warn).

## Next action

Matthew connects a real mailbox (app password) and tests a send to himself; then a first real campaign. Commit/push
only on his word; there is no remote yet.