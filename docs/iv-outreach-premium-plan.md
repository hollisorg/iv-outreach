# IV Outreach Free + Premium proposal

Prepared 2026-11-12 for Matthew. Proposal only: no live prices, checkout, subscriptions, vendor accounts or paid calls
were activated. Current installed version remains 0.3.0. User direction: release a useful free app, keep Claude Code
and Codex as the user's own reasoning engine, and sell optional paid data capabilities through one IV subscription.

## Product split

Free: local campaigns, leads, CSV, public research, source evidence, scoring, drafts, approval, mailbox connection and
manual social workflows. Use the user's installed agent/login; explain that their agent account limits still apply.
Do not meter ordinary local operations with IV credits. Keep this path usable without an IV paid subscription.

Premium: one IV account, subscription, credit balance and invoice. Managed data providers run behind IV's backend.
Sell capabilities (find business contacts, verify emails, expand business research), not a requirement to configure
several vendor accounts. Retain data-source and confidence information in results; list service processors in the
appropriate privacy information. Provider branding depends on the negotiated contract.

Free research runs first. When paid data would help, show the capability, expected benefit and maximum IV credits.
Example UI copy, not a live quote: "Find business emails for these 20 prospects — up to 100 credits."
The user can authorize one job or enable a capped automatic paid-data budget. No silent paid fallback from Free.
Stop at the cap; show completed, unavailable and uncertain results. Research approval does not approve outreach.

## Provider shortlist and evidence

All prices are public list-price observations in USD, not negotiated reseller quotes. Check again before contracting.

| Candidate | Capability | Pricing evidence | Commercial route / outstanding check |
|---|---|---|---|
| BetterContact | Business-contact discovery and multi-provider email/phone enrichment | Public pricing advertises $49 for 1,000 credits; valid email normally 1 credit, mobile 10 | Tech partner page explicitly offers white-label APIs for contract-led partnerships with wholesale commitments. Obtain the actual IV SaaS contract, data/export rights and quote. |
| Bouncer | Email verification | PAYG $8/1,000 checks; $60/10,000 | Agency reseller program advertises 40% credit discount and bundling. Confirm automated SaaS end-user access is covered; do not assume approval or discount stacking. |
| Apify | Selected hosted business-data collection tools | Starter $19/month including $19 usage, then additional usage; tool/compute pricing varies | Review each Actor and platform contract. Standard Actor Contract grants internal-business use and excludes reselling access. Use our own permitted Actors or negotiate appropriate terms; no blanket resale assumption. |
| Firecrawl | Hosted website reading, extraction and search | Hobby $19/month for 5,000 credits; standard scraping generally 1 credit/page, advanced operations differ | Candidate for scale; embedded-customer and retention rights need verification. Existing own-site reader stays free. |
| Hunter | Alternative email/domain discovery and verification | Separate API Data Platform with configurable search/verification credits | Candidate for coverage comparison or fallback; obtain embedded/reseller permission and quote before bundling. Avoid paying for overlapping data without measured benefit. |
| DataForSEO | Search-derived research and business visibility analysis | Endpoint-specific usage pricing; not costed in this proposal | Official FAQ permits processed analytics/reports/scores for paying users, but raw data/API redistribution needs a separate agreement. Confirm our lead export and chat/MCP results fit the contract. |

Primary sources:

- [BetterContact pricing](https://bettercontact.rocks/pricing/) and [technology partnerships](https://bettercontact.rocks/partners-tech/).
- [Bouncer prices](https://www.usebouncer.com/pricing/) and [reseller program](https://www.usebouncer.com/bouncer-agency-partner-program/).
- [Apify prices](https://apify.com/pricing) and [Standard Actor Contract](https://docs.apify.com/legal/standard-actor-contract).
- [Firecrawl prices](https://www.firecrawl.dev/pricing).
- [Hunter API pricing](https://hunter.io/pricing) and [terms](https://hunter.io/terms-of-service).
- [DataForSEO commercial-use FAQ](https://dataforseo.com/help-center/quick-answers-to-frequently-asked-legal-questions).

API availability alone is not proof of redistribution permission. Affiliate referral payouts are a different model
from IV charging the customer and buying wholesale service. Prefer an explicit embedded/white-label agreement for IV.
Evaluate source licenses and upstream restrictions before commercial distribution of the currently personal-test app.

## Price and margin proposal

Start with Free and one Premium tier. Suggested test price: **$49/month**, including a measured IV credit allowance,
plus optional prepaid top-ups. Do not sell unlimited paid API consumption. Final credit allowance is not yet set.
Calls consume different credits according to total underlying cost; an email check and mobile lookup are not equivalent.

Illustrative economics, assumptions only:

| Per Premium customer/month | Amount |
|---|---:|
| Subscription revenue | $49 |
| Allocated provider cost ceiling | $12 |
| Assumed payment and hosting allocation | $3 |
| Contribution remaining | $34 (69.4%) |

This is not net profit or a forecast. It excludes support, marketing, taxes, refunds/chargebacks and any additional
provider minimum commitments or unused capacity. Small launch volumes may have materially worse economics.
At $49/1,000 BetterContact credits, 200 valid-email results alone allocate $9.80 before other costs when the pack is
fully utilized. One customer requiring a whole unused $49 pack is a different cash cost. Negotiate and model both.

Benchmark representative business searches, email-finding and verification workloads, including failures and retries.
Set IV credit rates conservatively from contracted unit costs and worst-case bounded work. Provider minimums, phone
costs and Actor compute are included. Quote a maximum, reserve that amount, then settle delivered billable work.
Do not charge twice for retries. Where a failed job still incurs vendor cost, account for it in margin rather than
automatically passing an unexpected fee to the user. Never promise one credit equals one lead.

## Implementation boundary

Desktop app/agent -> authenticated IV backend -> provider adapters -> normalized, sourced results -> local campaign.

The backend owns service keys, tenant authorization, verified billing webhooks, balances, job queues and spend limits.
Never put the shared provider key in Electron, chat prompts, logs or MCP responses. Signed-in desktop users receive
short-lived IV access tokens. A local Premium flag is not sufficient authorization.

Credit ledger: reserve/settle/release entries, idempotent request identifiers, provider job IDs, per-user concurrency
limits, per-job maximum cost, monthly caps and a global provider-spend stop. Reconcile provider completion after
timeouts or cancellation; do not blindly rerun charged work. A balance cannot go negative under concurrent requests.

Provider adapter: supported capability, license status, cost estimate and ceiling, run/poll/cancel, normalized output,
source timestamp, confidence and freshness. Pick one provider first; try another only within the authorized budget.
Cache/dedupe within permitted retention and customer boundaries. Keep suppression and deletion requests consistent.

One paid job approval shows a maximum credit debit. Existing outreach approval remains separate. Expensive options
such as mobile-number lookups should be individually clear. Enable top-ups only on an explicit purchase, with automatic
top-ups off by default. Keep exported data and sending available when Premium expires; enforce applicable retention terms.

Existing Claude Code/Codex reasoning continues on each customer's account. Premium does not resell those subscriptions
or require a shared AI login. Hosted collection jobs can continue while the app is closed; locally running agent
reasoning requires the local agent to remain available. Any future hosted reasoning has separate model costs and terms.

## Recommended first release

1. Obtain BetterContact embedded pricing/rights and Bouncer SaaS reseller scope. Benchmark overlap: BetterContact
   already bundles verification, so use Bouncer where it adds value for imported or previously stored addresses.
2. Build tenant authentication, subscription entitlements and the credit ledger in a test environment.
3. Add one contact-enrichment adapter and verification, with quote/approval/cap/result handling in chat.
4. Pilot small capped workloads; measure cost per useful result and set the actual allowance.
5. Add a vetted Apify workflow only when it fills a measured gap; expand the catalog as demand justifies it.

Before public paid launch, complete commercial-release dependency/agent integration review, supplier agreements,
privacy/data processing terms, billing tests and real mailbox validation. No provider has been contacted or approved
IV's arrangement yet. There is no deployed Premium backend or active checkout at this stage.
