# Leadwell: agent context

Working name; the product name isn't decided yet. Owner: Matthew Hollis (The Hollis Organization).
Partner-facing first demo: Monday 2026-11-16.

## What it is

A downloadable desktop lead finder that Claude drives from chat:
ICP (from criteria, or from a company or franchise website) -> Claude researches real businesses -> website
enrichment -> fit score -> drafted outreach -> human approval -> email sent by the app from the user's own
mailbox, LinkedIn notes sent by the user themselves -> replies logged -> leads ranked by reply speed and intent.

## Architecture

- `src/core/`: plain ESM JavaScript, `node:sqlite` (no native modules). One DB file at
  `%APPDATA%\Leadwell\leadwell.db` (override with `LEADWELL_DATA_DIR`). WAL mode; the app and the MCP server share it.
- `src/mcp/server.js`: stdio MCP server (same pattern as IV Studio). All tools are prefixed `leadwell_`.
- Desktop app (Electron + electron-vite + React, mirroring IV Studio): **not built yet** (Phase B).
- Email sending (SMTP) and reply checking (IMAP) live in the app process, so mailbox secrets stay in Electron
  `safeStorage` and never reach the MCP process: **not built yet** (Phase C).

## Hard rules (agreed with Matthew 2026-11-12)

- No automatic account creation, no burner or rotated identities, no measures meant to dodge spam or platform detection.
- No LinkedIn send automation. LinkedIn is an assisted manual-send list: Leadwell drafts, the person sends.
- Nothing sends without approval. `leadwell_approve_messages` is only for messages the person approved in chat.
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
npm.cmd test
```

Verified 2026-11-12: 11/11 tests pass (core flow, compliance gates, private-network guard, robots, live MCP stdio
round trip). Live read of a real franchise site returned pages, socials and summary text. Not verified: real SMTP/IMAP,
Electron UI, packaging, Claude Desktop install.

## Next action

Phase B: Electron dashboard (onboarding with sender profile + "connect Claude", campaigns, ranked leads, approval
queue, LinkedIn send list, replies). Then Phase C: SMTP send worker + IMAP reply detection, then the Windows installer.
