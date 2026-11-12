# Fitscout: agent context

Name chosen by Matthew 2026-11-12. Renamed from the working name "Leadwell" because LeadSwell, Inc. (a San Francisco
B2B lead-gen company with a US trademark filing) was too close. fitscout.com was unregistered when checked that day.
A quick web and trademark search found no conflict, but there has been no legal clearance. Owner: Matthew Hollis
(The Hollis Organization).
Partner-facing first demo: Monday 2026-11-16.

## What it is

A downloadable desktop lead finder that Claude drives from chat:
ICP (from criteria, or from a company or franchise website) -> Claude researches real businesses -> website
enrichment -> fit score -> drafted outreach -> human approval -> email sent by the app from the user's own
mailbox, LinkedIn notes sent by the user themselves -> replies logged -> leads ranked by reply speed and intent.

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
- Email sending (SMTP) and reply checking (IMAP): **not built yet** (Phase C). Approved emails wait in the queue, and the
  app and MCP text say so. Never claim an email was sent until Phase C ships.

## Hard rules (agreed with Matthew 2026-11-12)

- No automatic account creation, no burner or rotated identities, no measures meant to dodge spam or platform detection.
- No LinkedIn send automation. LinkedIn is an assisted manual-send list: Fitscout drafts, the person sends.
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
npm.cmd test                      # 17 unit/integration tests, no network, no spend
npm.cmd run build
node scripts/ui-check.mjs <dir>   # launches the built app on fictional demo data, screenshots every page
node scripts/ui-check.mjs <dir> --chat      # plus one real chat turn on your Claude Code, clicking the Allow card
node scripts/chat-smoke.mjs claude|codex|hermes allow|deny   # headless chat turn per agent
```

Verified 2026-11-12: 17/17 tests pass. Built app launched with no console errors and every page screenshotted on
fictional data. Live chat turns with Allow cards passed on Claude Code (9s), Codex (18s) and Hermes (28s); Don't
allow left the draft unapproved. A real chat turn through the window approved a draft after clicking Allow.
Not verified: installing Claude Code/Codex from the app (both were already installed here), the sign-in window, the
skill install, a real web-research lead hunt in chat, SMTP/IMAP, packaging/installer, Claude Desktop config.

## Next action

Phase C: SMTP send worker (approved emails, within caps, from the person's mailbox, secrets in Electron safeStorage) and
IMAP reply detection (auto-log replies, "stop" -> suppression). Then the Windows installer (electron-builder) and a
first-run welcome. Commit/push only on Matthew's word; there is no remote yet.