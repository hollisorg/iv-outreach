# IV Outreach growth build

This documents the 0.11.0 foundation. In 0.12.0, the copy/open handoff below is superseded by the local shared business and native draft integration in [Hivemind](iv-workspace.md). Copy/export remain available as optional fallbacks.

## What is implemented

Scanning now includes Opportunity scan, Premium discovery, Watchlists & news and Content briefs alongside Local markets, Agent research and Custom search. Personal Claude Code/Codex access and the existing free discovery tools remain independent of paid data providers.

- **Opportunity scan:** reads at most three pages from a lead's own public website, respecting robots rules and redirect boundaries. Mozilla Readability with a static DOM extracts useful text; the existing guarded fetcher handles requests. HTML observations are accompanied by source text and URLs. Lighthouse runs locally in an isolated headless Chrome/Edge profile with a 90-second audit deadline. A proxy pins browser connections to checked public IPs and rejects private networks. The audit requires installed Chrome or Edge; website evidence still works without it. No sales-fit score or buying intent is inferred from a technical audit.
- **Contact data:** existing Bouncer and BetterContact flows retain native spend confirmation, credit reservations, uncertain-outcome reconciliation and explicit result application. Applied deliverable results retain provider/date provenance; the same address's deliverable verification is reused for 30 days to avoid paying again immediately.
- **Premium discovery:** DataForSEO Business Listings requests cap at 50 results, Exa company searches at 10 without a separate contents request. Local data search geocodes the selected area using the existing Maps geocoder. Quotes are 3 IV credits per local search and 2 per company search. A completed zero-result search is still charged, disclosed before approval. Candidates are reviewed and selected before import, with campaign ownership checks, suppression, deduplication and repeat-import protection. Interrupted requests enter review instead of being blindly repeated.
- **Mailbox sign-in:** Google and Microsoft authorization code/PKCE flow, loopback callback with state checking, encrypted registration/token storage, refresh, disconnect and cancellation. Gmail API and Microsoft Graph MIME sending use the existing approved-message queue, footer, unsubscribe header and pacing. Sender email must match the connected mailbox. Recent replies are matched only to previously contacted addresses and use the existing reply/suppression handling. SMTP/IMAP app-password support remains available.
- **Watchlists:** save own-site business pages or public RSS/Atom feeds. Check now creates a baseline, then reports unchanged/changed content with dated excerpts and source links. Parsing is bounded; no background schedule, external alert delivery or automatic follow-up is enabled.
- **Content briefs:** draft `iv.content-brief.v1` records include brand, offer, campaign audience, channel, goal and sourced evidence. Review/copy/export Markdown or JSON; Copy & open IV Studio/IV Signal opens the installed app with the brief on the clipboard. It requires a manual paste and does not create assets, purchase media or publish. The inspected Studio 1.1.9 and Signal 0.1.2 builds did not expose a general brief-import/deep-link route.

New MCP tools expose saved growth state, opportunity scans, watch creation/checking, draft content briefs and premium discovery quotes. The chat can explain these tools and highlight named Scanning cards. Paid jobs still require the desktop approval dialog.

## Setup later — no accounts needed for the free features

Matthew selected **build and test first; configure accounts later**. Live supplier keys, OAuth client registrations and real mailbox sending are intentionally not activated in this build.

### Premium providers

Provider secrets belong on the Premium service, never in Electron or chat. The service reads `BOUNCER_API_KEY`, `BETTERCONTACT_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` and `EXA_API_KEY`. Each capability stays disabled unless its required credentials, `IV_PROVIDER_CONTRACTS_APPROVED=true`, and a positive `IV_PROVIDER_MONTHLY_BUDGET_MICROS` are present. A million micros is one USD of modeled provider budget. This guard is conservative modeled consumption, not an authoritative supplier invoice limit.

Use an ignored `server/.env` or a private environment manager. For the local test runner, explicitly load it using `node --env-file=server/.env server/local-runner.mjs` after stopping the old local runner. Only the provider configuration is inherited; dedicated Hollis Stripe test credentials and loopback-only identity remain enforced. The ordinary local startup without that configuration keeps providers disabled. **Stripe test mode does not make supplier API calls free.** Do not enable live supplier calls solely to exercise test billing.

Before commercial rollout, confirm each provider's permitted resale, storage and multi-customer terms, benchmark actual outcomes and set a real service budget. A customer-facing shared credit service requires trusted server-side credentials and ledger; the private local identity must not be exposed publicly.

### Mailbox OAuth

Settings → Mailbox → Developer setup stores a native application registration securely on this PC. Client IDs are public application identifiers; no organization-wide provider secrets are bundled in the app.

- Google: enable Gmail API, configure the consent screen/test users and create a Desktop app OAuth client. Enter its client ID and desktop secret if supplied. Requested scopes are `gmail.send` and `gmail.readonly`. Follow Google's applicable verification requirements before wider distribution.
- Microsoft: create an application supporting the desired organization/personal accounts and configure a native/public client redirect at `http://127.0.0.1:43191/callback`. Delegated permissions: `User.Read`, `Mail.Read`, `Mail.Send` and offline access. No confidential client secret is requested. Tenant policies may require admin consent.
- Click Connect, finish browser consent, then check the sender profile. Connecting turns automatic sending off. Review and approve a self-addressed test email before real outreach. Disconnect removes local tokens; provider-side revocation is available through the provider's account permissions page.

Current reply checks cover a bounded recent window: Gmail up to 50 messages from up to 50 known contact addresses; Microsoft inspects up to 100 recent inbox headers and fetches matching messages, at most 50. This is not a complete mailbox archive or guaranteed full synchronization. Older/large-inbox coverage and broader delivery-status handling remain follow-up work.

Official implementation references: [Google native OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Gmail send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send), [Microsoft OAuth](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [Graph MIME sending](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0), [DataForSEO listings](https://docs.dataforseo.com/v3/business_data/business_listings/search/live/), [Exa search](https://exa.ai/docs/reference/search).

## Storage, testing and rollback

No new database schema migration. Scans, watchlists, content briefs, import receipts and contact verification metadata use namespaced rows in the existing local settings table. OAuth tokens/configuration are OS-encrypted in app-settings.json and excluded from renderer settings and MCP. Existing business, lead, message, account and credit data is not rewritten by installation.

Tests use disposable databases, fixture provider responses, fictional credits and local OAuth callbacks. They cover spending denial, settlement, uncertain requests, watch baselines, source restrictions, private-network blocking, PKCE/state, MIME unsubscribe headers, suppression and UI import idempotency. A real Lighthouse run against example.com also completed. These checks do not establish live supplier access or real Gmail/Microsoft delivery.

Validation commands: `npm test`, `npm run build`, `node scripts/growth-ui-check.mjs`, `node scripts/premium-ui-check.mjs`, then the same scripts with `--packaged` after `npm run dist`. Local evidence stays in ignored `docs/verification/iv-growth/`.

Rollback: close the app and install the previous package; no schema downgrade is required. Preserve the local profile before replacing any application files. The previous version will ignore growth records. Disconnect OAuth and disable automatic sending before reverting; the old version uses SMTP/IMAP and cannot read OAuth connections. No paid provider or social publishing service is automatically enabled by either version.

See [later-build-backlog.md](later-build-backlog.md) for the remaining candidates and explicit implementation triggers.
