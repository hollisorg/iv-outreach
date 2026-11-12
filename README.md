# IV Outreach

Find and research real businesses from chat using your own **Claude Code or Codex** login. Version 0.10.0 includes
native public-source discovery: no separate engine installation, BetterContact account or model API key required.
Your agent account's usage limits and any extra-usage settings still apply.

IV Outreach has an illustrated **Scanning** workflow gallery with a free Business scanner adapted from Hydrodesk's category searches, saved searches and scan
history. It also adds an optional Premium credit backend, Stripe test subscription/topup catalog, account screens,
paid research quotes and native spend approval. The Hollis Stripe TEST backend is connected locally on Matthew's PC; no cloud host is provisioned. Public customer accounts are a future step. Free tools remain
available without signing in to Premium. See [Premium setup and demo](docs/iv-premium-setup.md) and
[Hydrodesk review](docs/hydrodesk-outreach-review.md).

After a reboot, double-click `Start-IV-Outreach-Test.cmd` to start local test billing and open the installed app. See Settings â†’ Premium for the test balance.

## Try it

1. Open IV Outreach and connect Claude Code or Codex in Settings.
2. Tell the chat what you sell, who you want to reach, and where. You can supply your business website.
3. In Scanning, choose **Agent research**, the batch size and research depth, then **Research with my agent**.
4. Review saved prospects, source observations, fit reasons, potential opportunities and unknowns.
5. Ask for drafts when ready. Sending requires approval and a connected mailbox; social sending remains manual.

Public research can find websites, published contacts and relevant business facts. It cannot promise private direct
emails, verified deliverability, purchase intent or the coverage of paid commercial databases. Unknowns stay marked.
The research budget is a bounded instruction to the calling agent, not a metered background-job quota.

## Architecture

- Local SQLite campaigns, leads, research evidence, drafts, approvals, replies and opt-outs.
- Electron app styled as part of the IV Studio family, with original outreach eye graphics.
- In-app chat runs the user's installed agent. The same MCP tools work with external agents.
- Native research plan tool prepares a bounded brief; the calling agent performs web/Maps/site research.
- Native save research tool stores observations, fit, opportunities and unknowns separately. It validates
  source URLs and requires an own-site source; it does not independently fact-check the agent's assertions.
- Additive migration 5 stores research without changing existing notes, messages or approvals.
- Google Maps scraper and business social lookup retain third-party notices under vendor.
- Existing CSV formats and legacy import tool remain compatible. The old provider runtime and
  setup screens are not loaded or packaged in v0.3.0. Historical source/audit files remain for reference.

App ID, fitscout_ tool prefix, FITSCOUT_DATA_DIR and the Fitscout app-data folder remain stable for upgrades.

## Development

Run npm install, npm ci --prefix server, npm test and npm run build. scripts/native-ui-check.mjs verifies the built UI on fictional data;
add --packaged to check dist/win-unpacked. scripts/native-chat-smoke.mjs claude (or codex) exercises the signed-in
agent on fictional fixtures. npm run dist builds the Windows installer. scripts/packaged-check.mjs checks packaged MCP
and the window; --live additionally invokes the real Maps scraper.

Unit tests use local services only. Live chat checks use the signed-in agent account. The installer is unsigned.
Real SMTP/IMAP mailbox validation remains pending. Source is maintained in the private [hollisorg/iv-outreach](https://github.com/hollisorg/iv-outreach) repository.

See [native engine assessment](docs/native-engine-assessment.md), [graphics provenance](docs/iv-outreach-graphics.md),
and the historical [v0.2 outbound audit](docs/openoutreach-network-audit.md).

## App updates

Settings → App updates checks private releases using your existing GitHub CLI login. You choose when to download and restart. Main-branch pushes run CI; version tags build and publish tested Windows releases. See [release and update setup](docs/releases.md).
