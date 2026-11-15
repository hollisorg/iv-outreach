# IV Outreach Premium — test setup

The desktop free tools work without this service. `server/` is a separate backend; it is not bundled into the installer. No Stripe or provider secrets belong in the desktop app. The distributed endpoint remains unset. On Matthew's PC, version 0.5 discovers the private local test connection and encrypts its session with Windows DPAPI. No cloud host or Supabase project was provisioned. This is a single-PC private test, not a public subscription service.

## Verified Stripe TEST catalog

Account: the test Stripe account named in `server/local-test.json` (git-ignored). The reconnected Test Account for Hollis was verified November 12, 2026. These prices exist in test mode:

| Item | Price | Credits | Stripe price |
| --- | --- | --- | --- |
| Premium monthly | USD 49/month | 500 per paid billing period | `STRIPE_PREMIUM_PRICE_ID` |
| Extra credits | USD 10 once | 100 | `STRIPE_TOPUP_PRICE_ID` |

One sandbox subscription and a sandbox credit top-up were completed on November 12, 2026. Real signed Stripe test webhooks credited 500 + 100 credits to the local ledger. No live charges or provider purchases were created. Prices are a test configuration, not a final public pricing commitment. Monthly credits expire at the invoice period end; purchased extra credits do not expire. Paid services require an active paid subscription. Cancellation at period end retains paid access through that end. Past-due, unpaid, expired, or billing-review accounts cannot start paid work. Free research remains available.

## Local fictional preview

```powershell
npm.cmd ci
npm.cmd ci --prefix server
npm.cmd run build
npm.cmd run premium:demo
```

Opens an isolated temporary desktop profile and an in-memory backend. Settings → Premium: `demo@iv-outreach.test`, code `123456`. All balances and contact results in this preview are fictional and visibly marked DEMO. There are no outgoing provider/payment requests. Only the local preview uses this code; the production server has no demo sign-in or credit grant routes.

## Local test backend (current setup)

Double-click `Start-IV-Outreach-Test.cmd` in the project folder after a PC restart. It starts the backend and Stripe webhook listener hidden, waits for readiness, and opens the installed app. In Settings → Premium, choose **Connect this PC** if needed. To run the backend in a terminal instead, use `npm.cmd run premium:local`.

The dedicated Stripe CLI profile is `iv-outreach-test`, verified against Hollis account above. The runner reads only its TEST credential and obtains the webhook secret in memory; neither enters the app bundle or logs. The CLI credential expires February 10, 2027 and may require earlier renewal if revoked. Renew with `stripe login --project-name iv-outreach-test`; approve only the Hollis account.

The service listens only at `127.0.0.1:4319`. Its private identity, ledger and connection files live in `%APPDATA%/IVOutreachPremiumTest`. Leads remain in `%APPDATA%/Fitscout`; payment records also live in Stripe. Keep both folders private and back them up. Do not share the connection or identity files. This device identity is intentionally unavailable in live billing mode or on a public listener. It is not suitable for distributing Premium to multiple customers.

The local backend and forwarding process must remain running for billing updates. If forwarding exits, the backend stops rather than claiming that webhook processing is healthy. Restart with the launcher. No Windows startup task or background service was installed. Stripe test portal uses a dedicated configuration; account-wide/live portal settings were unchanged.

Subscription checkout, top-up, actual signed webhooks, local sign-in and subscription portal were verified. Supplier requests remain disabled. Credit reservation, denial, settlement, unused-credit release and explicit contact application passed isolated fixtures; no real paid contact results are claimed. Real renewal clocks and failed-payment end-to-end tests remain outstanding; unit tests cover duplicate invoices, past-due status and invalid signatures.

## Future hosted multi-customer backend (not provisioned)

1. Provision a Node 24+ host with persistent disk and HTTPS. This implementation uses SQLite WAL with one service/worker process. Do not deploy it on ephemeral/serverless disk or run multiple workers. Keep `premium.db`, WAL and backups on private storage.
2. Run `npm ci` in `server/`; copy `.env.example` to `.env` on that host. Set the Hollis **test** Stripe secret securely in the host, plus the account and two price IDs above. Do not paste secrets into chats, source, or the vault. The Stripe connector creates catalog objects but does not expose a runtime secret to this service.
3. Use a dedicated Supabase Auth project with email OTP enabled and an email template containing `{{ .Token }}`. Set its HTTPS URL and public anon/publishable key on the backend. Configure SMTP for account codes and its rate limits. No Supabase database migration or privileged service-role key is required. The server verifies each bearer token against Auth's `/user`; local desktop credentials are encrypted with Electron safeStorage.
4. Register the HTTPS `POST /v1/stripe/webhook` endpoint in Stripe **test mode**, with the signing secret in the host. Subscribe to `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, and `charge.dispute.created`. Configure the Stripe customer portal for subscription management. HTTPS return URL: `/billing/return`.
5. Start with `npm start` in `server/`. The startup check validates the Stripe account, mode, amounts, currency and recurring interval. The defaults refuse live keys, keep provider jobs disabled, and set a zero provider budget.
6. Set the desktop `IV_PREMIUM_API_URL` environment variable to that service origin for staging; for distribution set `src/service/premium-endpoint.json` then rebuild. The URL must be HTTPS (127.0.0.1 HTTP is allowed for local fixtures). Never place provider or Stripe keys there.
7. Complete a real Stripe test-card checkout through the desktop, verify webhook receipt and exactly one monthly grant, renew/cancel using Stripe test clocks, test failed payment and topup, and verify portal return. These hosted end-to-end checks remain outstanding until the host/auth/secrets are connected.

## Paid services and cost controls

Implemented adapters: Bouncer existing-email verification (up to 1 IV credit per address; unknown is free) and BetterContact work-email discovery for already identified people (up to 5 IV credits per deliverable email; missing results are free). No mobile number enrichment. No guesses from name patterns. A valid published contact name and business site are needed before paid discovery.

Keep `IV_PROVIDER_CONTRACTS_APPROVED=false` until commercial/resale terms are agreed. Then set the provider keys and a deliberate monthly cost ceiling. `IV_PROVIDER_MONTHLY_BUDGET_MICROS=10000000` means USD 10 of modeled maximum reservations. The current accounting assumes USD 0.01 per verification and USD 0.06 per attempted discovery; validate these assumptions against your actual contracts before enabling. This cap is based on estimates, not a vendor billing API: set the vendor's own spend caps too. Failed or ambiguous submitted work retains its modeled cost against the budget. The queue does not automatically retry an uncertain charge.

No unlimited paid search. The server limits batch size to 25, holds the full quoted maximum, and prevents more than three unfinished jobs per account. It settles actual billable results and releases unused holds. The desktop always asks for native confirmation before submitting a quoted job. Provider work already submitted may finish after a cancellation request. Provider results never automatically draft, approve, or send outreach.

Public partner information: [BetterContact technology partners](https://bettercontact.rocks/partners-tech/), [Bouncer agency program](https://www.usebouncer.com/bouncer-agency-partner-program/). These pages are not a negotiated contract. Apify, Firecrawl, Hunter, and DataForSEO are future candidates; no adapters or blanket resale rights are claimed for them.

## Operations and reconciliation

Unknown submissions move to `review`, holding their credits to prevent accidental double spend. The checkpoint is private server state. Check the provider dashboard before resolving; do not re-submit the batch merely because a response was lost.

Stop the service and create a private receipt JSON containing `charged` (integer no larger than approved maximum), `results` (provider records using original `client_ref` values), and `reason` (15–500 characters describing verified reconciliation, with no secrets). Run from `server/`:

```powershell
node --env-file-if-exists=.env reconcile.mjs JOB_ID receipt.json
```

Then restart the service. This command is operator-only and cannot be called by desktop users. Refunds/disputes freeze the paid account for manual review; they do not silently claw back already spent credits. Review the payment, grants, and jobs before unblocking. Account-block overrides, refund reconciliation, data deletion/retention and support procedures require an operator; no public admin API is exposed.

Back up the closed SQLite database (or use SQLite's online backup API), restore-test it, and restrict host access. Quotes/jobs include contact data: apply a retention/deletion policy before public launch. Do not use the in-memory per-process request limiter as the only public abuse control; add edge rate limits and Auth protections. Signed webhook tests and mocked provider contracts are covered locally; actual supplier outputs, reseller approval, paid-host costs, email OTP delivery, production tax settings, and live payment acceptance are not verified.

## Rollback

The local lead database remains schema 5. New scanner settings live in existing settings rows; local paid quotes/job associations live in `premium-jobs.json`; account tokens are encrypted in `app-settings.json`. Reinstall 0.4.0 to return to the prior desktop; keep the profile and its backup. Stop the separate backend to stop new paid work, but reconcile existing jobs and Stripe subscriptions before retiring a deployed billing service. Downgrading the desktop does not cancel a Stripe subscription.
