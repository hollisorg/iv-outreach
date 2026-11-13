# IV Outreach: agent context

Current name: **IV Outreach**. Version 0.3.0 uses native public-source research driven by the user's Claude Code or
Codex login. No separate provider engine/API key is required. Original IV Studio family eye artwork remains.
Installer: dist/IV-Outreach-Setup-0.3.0.exe. Preserve fitscout_ tool names, app ID, FITSCOUT_DATA_DIR and data directory.
See docs/native-engine-assessment.md and docs/iv-outreach-graphics.md. Earlier v0.2 runtime docs are historical.

Name chosen by Matthew 2026-11-12. Renamed from the working name "Leadwell" because LeadSwell, Inc. (a San Francisco
B2B lead-gen company with a US trademark filing) was too close. fitscout.com was unregistered when checked that day.
A quick web and trademark search found no conflict, but there has been no legal clearance. Owner: Matthew Hollis
(The Hollis Organization).
**Closed personal test, not for sale** (Matthew, 2026-11-12). Licensing no longer blocks tools; see Hard rules for what stays out.
Folder: C:\Users\Matthew\Desktop\IVOutreach (private remote: https://github.com/hollisorg/iv-outreach). Installer: dist\IV-Outreach-Setup-<version>.exe.
Use IVOutreach for new working paths. The former fitscout desktop path is retained for compatibility with existing Codex projects. This folder rename does not change the installed app's stable data directory, app ID, or MCP tool names.

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
- No social send automation (LinkedIn, Facebook, Instagram, X, TikTok): assisted manual-send list only. Current
  v0.3 native discovery uses public sources and the calling agent. The old provider runtime is not loaded or packaged.
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
npm.cmd ci --prefix server                      # separate Premium backend dependencies
npm.cmd test                                   # 51 tests, local servers only, no spend
npm.cmd run dist                               # builds dist\IV-Outreach-Setup-<version>.exe (needs vendor gmaps exe)
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
Not verified: a real mailbox (SMTP/IMAP against Gmail or Outlook), installing
Claude Code/Codex from the app, code signing (installer is unsigned, so SmartScreen will warn).

## Next action

### Native research, 2026-11-12 (v0.3.0)

core/research.js implements a bounded brief and structured evidence saving. The calling agent must execute the plan;
it is not a background worker and the budget is instruction-level. Save validates URLs including an own-site source,
but factual accuracy depends on the agent's research. Buying intent is always unconfirmed. Migration 5 adds
lead_research without rewriting messages, notes, approvals or previous source records. Existing CSV imports remain.

The v0.2 provider runtime, uv/Python installer, bridge and Settings are excluded from the active build. Historical
source files remain in the checkout; existing installed runtime files remain untouched and unused. No upstream
implementation or prompts were copied into the native coordinator. Do not call the work clean-room: source was inspected.

38 tests pass; live native plan/save turns passed on both Claude Code and Codex without messages. Five real prospects
were researched and saved using Claude Code for the Hollis AI-services campaign, with no paid provider keys or sends.
See docs/verification/iv-native for current checks. Agent account limits and extra-usage settings still apply.

Matthew can refine target industries/locations and review prospects. Connect a real mailbox and test a send to
himself before outreach. Nothing sends without approval. Commit/push only on his word; no remote exists.

### Optional Premium and Hydrodesk scans, 2026-11-12 (v0.4.0)

User authorized optional paid subscriptions/credits while preserving all free agent tools. server/ is a separate
Node 24 SQLite billing/provider service, excluded from the desktop package. Stripe TEST catalog was created in
The Hollis Organization Inc acct_1L9wOnADnzKPQPbv: premium price_1Ub4F7ADnzKPQPbvov3vsOZD (USD49/500 monthly credits),
topup price_1Ub4FBADnzKPQPbvhV2qIes9 (USD10/100). No live charges. Backend hosting, Supabase email OTP, runtime Stripe
test key/webhook, provider contracts and keys remain unconnected. Never embed those service secrets in Electron.
src/service/premium-endpoint.json is unset; UI accurately shows Premium unconnected. scripts/premium-demo.mjs uses
only an isolated fictional in-memory service. Supabase account creation occurs only when the user requests sign-in;
the ban on automatic third-party/social account creation remains.

Main-process premium quote/run/result bridge enforces a native dialog before each paid job; neither renderer nor
MCP caller can auto-approve it. Credits reserve/settle idempotently server-side; unknown provider requests require
operator reconciliation. Nothing auto-sends. Result application observes DNC and existing-email/bounce constraints.
Free MCP research remains independent. Bouncer verification and BetterContact known-contact email lookup are
optional server adapters, disabled by default. Monthly budget is modeled cost, not authoritative vendor billing.

core/scanners.js adapts Hydrodesk's city/category scan, saved searches and history to the existing local Maps tool.
Hydrodesk was inspected read-only from hydro-sales-8001760; no production integration, keys or residential data copied.
Scanner state uses existing settings rows; lead schema remains 5. See docs/iv-premium-setup.md for deployment,
reconciliation, test limitations, data retention and rollback; docs/hydrodesk-outreach-review.md for provenance.

### Local Premium and dedicated Scanning, 2026-11-12 (v0.5.0)

Matthew requested local data/backend. Supersedes the unconnected 0.4 status above: server/local-runner.mjs runs
TEST-only on 127.0.0.1:4319 with the approved dedicated Stripe CLI profile iv-outreach-test (Hollis account).
No Supabase project/cloud host. Private singleton identity and SQLite ledger are under APPDATA/IVOutreachPremiumTest;
this identity must never be used for live or publicly reachable billing. Stripe and webhook credentials stay server-side.
Desktop discovers only the fixed local connection and encrypts its session. Start-IV-Outreach-Test.cmd restarts the
local service/forwarding and installed app after reboot; no autorun task or service was installed.
Actual sandbox subscription and top-up webhooks credited 500 + 100. Dedicated test portal verified. Providers remain
disabled: no real supplier calls, provider accounts or contracts. Free Claude Code/Codex tools stay independent.
Scanning now has its own navigation page with Local markets, Agent research, Custom search and scan activity.
Buttons use larger bold white labels on deep red, readable disabled states, and visible focus outlines.
See docs/verification/iv-premium-local and docs/iv-premium-setup.md for current evidence and restart/rollback details.

### Studio-style scanner refinement, 2026-11-12 (v0.5.1)
Installed and opened 0.5.1 after inspecting IV Studio 1.1.9 Workflows visually and its Workflows.jsx read-only.
Scanning is now an illustrated gallery; cards open dedicated workflows. Local markets uses a compact category picker
and removable selections (max three), numbered location/category/size sections and a scan summary instead of checkboxes.
53 tests and packaged free-agent/local-Premium/UI/MCP checks pass. Five existing leads and all DB table fingerprints
remain unchanged, schema 5, zero messages. Installed asar matches packaged hash. See docs/verification/iv-premium-local.
Existing IV Academy auth/schema was inspected read-only for Matthew's shared Infinite Variance account direction.
No production migration applied. docs/iv-account-architecture.md records the real signup/access coupling and required
app-scoped migration; public shared login/ledger activation remains future work. Never grant Outreach access from
Academy role/subscription tables. Keep private local test identity separate from customer accounts.


## IV Outreach 0.6.0 visual refresh (2026-11-12)

Installed 0.6.0: illustrated Today, Leads, Approve, Social and Settings with distinct decorative animations, pause/reduced-motion support, Settings section shortcuts and Today workflow cards. Verification and rollback: docs/verification/iv-pages/RELEASE.md. 53 tests plus packaged page/premium/MCP checks passed; five real leads and all SQLite table hashes preserved. Source uncommitted; no hosted or schema changes.

Matthew's ecosystem direction: IV Outreach handles opportunities, relationships and briefs; IV Studio creates content; IV Signal is the planned social management/publishing app. Prefer shared IV account/business profile and cross-app handoffs rather than duplicating a content studio in Outreach. Those integrations are proposed, not implemented. Dictated Ivy/IVY means IV when referring to this app family.

## IV Outreach 0.7.0 chat and onboarding (2026-11-12)

Installed 0.7.0: rounded chat bubbles; resizable pop-out chat shares the main-process live turn, approvals, history, composer draft/files and current workspace context. Closing popup docks it; closing main app closes popup and stops the session. Composer state survives window moves, not full app exit. IPC streams added: chat:window and chat:composer; IPC sender checked against trusted top-level workspace/chat windows.

Onboarding.jsx supplies a six-step first-run local setup, reopenable in Settings. src/service/onboarding.js uses the existing settings table (iv_onboarding_v1); optional campaign creation is transactional/idempotent. Saved business brief is supplied to chat context. No schema change; no automatic research, billing or sending. Existing profiles with campaigns are not forced through setup. Shared IV identity and Studio/Signal handoffs remain unimplemented.

55 tests and packaged onboarding/chat/premium/MCP checks passed. A real Claude Code Allow card survived pop-out and docking; denial kept fictional sender settings unchanged. Real profile table hashes and saved chat JSON hashes preserved; five leads, zero messages. Release/rollback evidence: docs/verification/iv-onboarding/RELEASE.md. Source remains uncommitted.

## IV Outreach 0.8.0 businesses and indexed Settings (2026-11-12)

Businesses now own campaigns. Schema 6 adds businesses and campaigns.business_id, assigns existing campaigns to legacy-business, and preserves campaign/lead/message IDs. New profiles start with no business until onboarding or creation; legacy single-business agent calls remain compatible, but creating campaigns with multiple businesses requires business_id. Business profile and campaign ownership edits are local; sender identity, mailbox, sending caps, suppression, personal agent connections and Premium account remain shared across businesses on this PC.

Sidebar has Business > Campaign selectors and add actions. Settings uses IV Studio's sticky numbered topic index and numbered cards; business profiles can be edited, campaigns renamed or moved with their existing leads/history. Overview, Social queue and chat context follow selected business. Selection persists in app-settings.json. useData prevents stale responses from briefly exposing a different business after switching. Agent context takes the selected business brief instead of the global onboarding brief. No hosted identity, billing-account or privilege changes.

59 tests and packaged business/settings, onboarding/pop-out and MCP checks passed. Migration verification compares every pre-existing database column and saved chat JSON; all nine real leads, zero messages and original records preserved. Existing business labeled Hollis Organization Inc. with the user-provided website and offer. See docs/verification/iv-businesses/RELEASE.md. Rollback across schema 6 requires the pre-upgrade profile backup, with the app closed and any new work preserved first; reinstalling 0.7 alone is insufficient. Source remains uncommitted.

## IV Outreach 0.9.0 branded setup and visual guidance (2026-11-12)

Business/campaign dropdowns are replaced by a top-of-workspace identity bar opening a visual brand gallery and outreach-plan cards. New business setup is a four-step wizard; campaign setup explains a campaign as one focused outreach plan and walks through goal, audience and review. A business can upload a local logo/cover (PNG/JPEG/WebP, 8 MB maximum), choose a built-in cover and accent, and edit its look later. Normalized images are copied under APPDATA/Fitscout/brand-assets using content-hash names; safe references are in business profile_json. No schema change from version6.

How this works opens guided spotlights for every main page, including an app-wide tour from Today. Stable place IDs in renderer/src/guides.js power fitscout_list_places and fitscout_show_in_app. fitscout_inspect_app returns the current app's visible controls and an actual PNG screenshot, covering input fields, chat, editable content and code blocks. A separate authenticated loopback bridge is passed only to in-app chat MCP processes, not public connection snippets. It cannot accept arbitrary selectors/scripts/clicks or capture other apps. Visual inspection can be disabled in Settings > Your agent. Highlights wait for renderer acknowledgement and refuse while setup dialogs are open. No send/spend approval rules change.

See docs/verification/iv-brand-guide for final release evidence and install status. Shared sender/mailbox/Premium account and hosted IV identity limitations remain as in 0.8.0. Source remains uncommitted.

## IV Outreach 0.9.1 workspace-bar emphasis (2026-11-12)

Workspace bar now uses a brighter burgundy panel, pink lower edge and separate business/plan cards. How this works is a prominent cream button with dark text, larger question-mark icon, hover and keyboard focus treatments. Compact windows wrap the plan below the business/help row; reduced motion is respected. Visual checks at 1360 and 1040 px passed and the tour opened without renderer errors. No schema, backend, permission or provider changes. Release/install evidence: docs/verification/iv-topbar.

## 0.9.2 help placement
How this works now sits beneath the left navigation, retaining its cream high-contrast style and page-aware guide. The top workspace bar contains only business and campaign controls. No data or backend changes.

## GitHub and app updates (2026-11-12)
Private source/release repo: hollisorg/iv-outreach. Main pushes run CI; matching version tags publish tested Windows installers and update metadata. Settings > App updates uses existing GitHub CLI credentials in main-process memory only. No bundled tokens, automatic downloads, silent restarts or install-on-quit. Docs: docs/releases.md. Local data and docs/verification stay out of git. Current installer unsigned. Public distribution needs a separate public installer feed or IV-authenticated download service.

## Hivemind 0.2.0 chat reopens existing work (2026-11-12, branch codex/iv-handoff)
Standalone app in apps/hivemind (see docs/hivemind-control-center.md and docs/iv-workspace.md). Its chat can now reopen an existing Studio project or Signal draft for the selected business through two tools (hivemind_find_handoffs, hivemind_reopen) from a dependency-free stdio MCP server (apps/hivemind/mcp/server.js -> out/main/mcp.js) behind a token-protected loopback bridge. The business comes from Hivemind's turn, never the agent. One clear match opens; several open nothing and show choice buttons; a button only opens a handoff Hivemind offered. Opening reuses the existing handoff ID and the receiving app's receipt rules, so no handoff, post or production is created. Approvals, generation, spending, scheduling and publishing stay in the receiving app.
Checks: test/hivemind-actions.test.mjs (in npm test) and docs/verification/hivemind/chat-reopen-check.mjs [claude|codex] against the real workspace, Signal and Studio. Studio stays private. Pushing Outreach source or creating a release tag needs Matthew's explicit approval.
