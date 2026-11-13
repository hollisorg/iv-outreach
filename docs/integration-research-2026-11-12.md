# IV Outreach: API and open-source expansion shortlist

Research snapshot: November 12, 2026. Recommendations, not installed integrations. Prices are USD public list prices checked during research; taxes, infrastructure, minimum commitments and negotiated terms can change the actual cost. Provider free allowances belong to the provider account, not automatically to each IV customer.

## Recommendation

Build around three jobs: **find suitable businesses, explain a useful reason to contact them, and help the user follow through**. Keep local research and personal Claude Code/Codex access in the free app. Charge credits for optional external data, not for every local action.

The strongest next feature is a **Business Opportunity Scan** combining a website audit, sourced business summary, visible improvement opportunities and an editable outreach draft. Then add watchlists and easier mailbox connections. Route approved content briefs to IV Studio and publishing to IV Signal.

Current source already contains free Maps discovery, website research, lead records, personal-agent chat and approved email workflows. `server/providers.mjs` and the paid-research UI already contain Bouncer and BetterContact adapters. These need configuration and end-to-end validation, rather than another replacement integration. No paid provider was activated for this research.

## Open-source projects worth adding

| Project | Proposed IV feature | License reviewed | Recommendation / implementation fit |
| --- | --- | --- | --- |
| [Lighthouse](https://github.com/GoogleChrome/lighthouse) | Website performance, SEO and accessibility opportunity cards, with supporting audit evidence | Apache-2.0 | **First priority.** Run locally in a bounded browser job. Explain findings in plain language; an automated audit is not proof of buying intent, lost revenue or complete accessibility compliance. |
| [Crawlee](https://github.com/apify/crawlee) | More dependable public business-site research across about, services, locations and contact pages | Apache-2.0 | **First priority where the existing fetcher falls short.** Fits Node/JavaScript. Start with a small same-site page limit; retain robots handling and private-network protections. Use ordinary public fetching, without evasion features. |
| [Mozilla Readability](https://github.com/mozilla/readability) | Cleaner company news and article text for summaries and personalized drafts | Apache-2.0 | **Small, useful addition.** Article extraction complements crawling. Keep a fallback for homepages and directories; pass extracted text to the agent rather than rendering untrusted HTML. |
| [rss-parser](https://github.com/rbren/rss-parser) | Industry news, local news and company-feed suggestions for content and follow-ups | [MIT](https://raw.githubusercontent.com/rbren/rss-parser/master/LICENSE) | **Good early addition.** Low footprint in the existing stack. Feed availability and rights to reuse articles are separate from the parser license. |
| [changedetection.io](https://github.com/dgtlmoon/changedetection.io) | “Something changed” watchlists: new services, hiring pages, new locations or updated offers | Apache-2.0 | **Second phase.** Useful API-driven companion service, but adds a Python/service dependency. Local monitoring requires the computer to be running; continuous monitoring needs an always-on service. |
| [Activepieces](https://github.com/activepieces/activepieces) | Optional handoffs to spreadsheets, CRMs and other business workflows | Community Edition MIT; enterprise features commercially licensed | **Later connector.** Connect to a separate instance before considering bundling a workflow platform. Verify the exact edition and components; the entire repository is not uniformly MIT. |

These projects can avoid per-request vendor fees when run locally, but still consume computing resources and maintenance time. Preserve applicable license notices, pin versions and inspect dependencies before distribution.

## Paid APIs worth evaluating

| Service | Proposed use | Published price snapshot | Priority / limitation |
| --- | --- | --- | --- |
| [DataForSEO Business Listings](https://dataforseo.com/pricing/business-data/business-listings-api) | Larger structured business searches and filtering | $0.012/task plus $0.00036/returned business; up to 1,000 items/request | **Top discovery candidate.** A full 1,000-item request calculates to $0.372 in provider usage. These are listings, not verified contacts or qualified leads. Benchmark freshness, duplicates and regional coverage. |
| [Exa](https://exa.ai/pricing) | Natural-language company discovery and source-backed research | Search starts at $4/1,000 requests; content retrieval $1/1,000 pages per content type. Starter advertises $10 monthly credits plus a $10 onboarding bonus | **Top research candidate.** Helpful for criteria that categories alone cannot express. Endpoint, result count and content choices affect the quote. |
| [Apify](https://apify.com/pricing) | Selected directory, review and specialist research jobs | Free account: $5 monthly usage. Starter: $19/month including $19 usage, then pay as you go | **Curated additions.** Each Actor can have its own per-event, compute and other charges. Approve a small set of tested jobs and cap each run; a platform subscription does not make all Actors unlimited. |
| [Bouncer](https://www.usebouncer.com/pricing/) | Check addresses already supplied or collected appropriately before outreach | $8/1,000 verifications at the entry PAYG tier; 1,000 minimum purchase; larger tiers cheaper | **Finish existing adapter.** Verification reduces uncertainty; it does not guarantee inbox delivery or permission to contact someone. |
| [BetterContact](https://bettercontact.rocks/pricing/) | Find a work email for an already identified business contact | Starter $15/month for 200 credits; Pro $49/month for 1,000. One valid email uses one provider credit | **Finish existing adapter.** Its pricing page says found emails are verified with Bouncer. Avoid immediately purchasing a redundant second verification; use freshness rules. IV credits and provider credits are different units. |
| [Google Places API](https://developers.google.com/maps/billing-and-pricing/pricing) | Live business details, photos and richer lead profiles | First paid tier: Text Search Pro $32/1,000 after 5,000 free monthly events; photos $7/1,000 after 1,000 free monthly events | **Optional profile enhancement.** Requested fields determine billing. [Storage and attribution rules](https://developers.google.com/maps/documentation/places/web-service/policies) constrain caching and reuse; do not treat this as an unrestricted permanent lead/export database. |
| [Hunter](https://hunter.io/pricing) | Alternative domain/contact lookup and verification | Free plan advertises 50 credits/month; paid and Data Platform API bundles vary | **Backup candidate.** Compare against BetterContact before paying for overlapping capabilities. |
| [Ayrshare](https://www.ayrshare.com/pricing/) | Connected-account publishing, scheduling and analytics inside IV Signal | Premium $149/month for one profile; Launch $299/month up to 10; Business $599/month includes 30 | **Signal roadmap, not the first Outreach purchase.** Recurring brand/profile costs fit a social add-on better than occasional lead-search credits. |

These are capability and pricing candidates, not confirmation that every retail plan permits IV's proposed resale, storage and multi-customer use. Confirm those contractual rights for the actual plan before a public premium launch. No vendor was contacted during research.

## Connections that improve everyday usability

**Gmail and Microsoft accounts:** native [Gmail API](https://developers.google.com/workspace/gmail/api/guides) and [Microsoft Graph mail APIs](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview?view=graph-rest-1.0) would let people connect their mailbox and track relevant replies more naturally. Preserve approval before sending. Gmail scopes may require [OAuth verification](https://developers.google.com/workspace/gmail/api/auth/scopes), with additional requirements for restricted-data handling. Scope this as an onboarding and account-integration project, not a one-day API-key switch.

**YouTube research:** the [YouTube Data API](https://developers.google.com/youtube/data/getting-started) could support public channel/video discovery and topic research for creators and local businesses. Quotas are project-level. Use metadata and links for research, not assumptions that videos can be downloaded or republished.

**IV ecosystem:** give each lead a “Create content brief” action containing audience, offer, evidence, brand and suggested angle. IV Studio creates the assets; IV Signal handles the user's connected publishing accounts. These are proposed product handoffs, not integrations verified in this research.

## Candidates to hold back

- **Brave Search API:** its [published terms](https://api-dashboard.search.brave.com/app/documentation/general/terms-of-service) expressly list multi-level marketing among prohibited uses and also restrict certain redistribution/storage. Because network marketers are part of the intended audience, obtain clarification before selecting it as the default search provider.
- **Postiz:** the [repository](https://github.com/gitroomhq/postiz-app) uses AGPL-3.0. It is relevant to IV Signal research, but incorporating it into a closed product requires a specific licensing/compliance plan. Self-hosting also does not eliminate social-platform account and approval requirements.
- **webanalyze:** the [engine is MIT](https://raw.githubusercontent.com/rverton/webanalyze/master/LICENSE), but its [technology-definition source](https://github.com/rverton/webanalyze) is separate. The definition dataset's license and current coverage were not verified here. Evaluate before bundling it for CMS/technology detection.
- Additional crawling and automation platforms should wait until a tested gap justifies their footprint. A long list of integrations is less valuable than reliable, understandable workflows.

## Suggested rollout

1. **Free Opportunity Scan:** reuse existing site research, add Lighthouse and cleaner extraction, show evidence and confidence, and let the personal agent produce an editable recommendation. Technical audit scores should remain distinct from sales-fit judgments.
2. **Usable premium pilot:** finish the two existing contact adapters; compare DataForSEO and Exa on a small, approved business sample. Measure useful unique businesses, field accuracy, latency, failures and actual cost. Do not label raw listings “qualified leads.”
3. **Relationships and timing:** mailbox onboarding, saved watchlists and news feeds. Offer reviewed follow-up suggestions instead of automatic messages.
4. **Content and ecosystem handoffs:** briefs to IV Studio, publishing through IV Signal, and optional workflow/CRM connectors.

Suggested templates include AI/design opportunities for Hollis, local referral partners for realtors, business networking for insurance professionals, and opt-in relationship follow-up plus content planning for network marketers. These are product proposals, not claims of proven conversion results.

## Free/premium economics and architecture

Keep local scans, lead management, drafting with the user's existing Claude Code/Codex access, and manual workflow actions usable without an IV-paid API. A user's agent subscription still has its own terms and usage limits.

Before a premium job, show a maximum credit quote and reserve that amount. Settle against a documented result policy, refund unused reservations, and reconcile uncertain provider outcomes before retrying. Avoid unlimited paid discovery. Retain source, retrieval time and provider-specific expiry/attribution requirements with each result.

For example, BetterContact Pro's fully consumed 1,000-email allowance implies $0.049 per valid email, but the subscription still costs $49 even if only a few are found. Model unused allowances, retries, infrastructure and billing fees before setting IV's retail margin. Provider consumption cost is not the same as cash outlay or profit.

A public shared-credit product needs a trusted premium service holding provider credentials and the authoritative credit ledger. Shipping a shared secret in Electron cannot keep it private from customers. The free app and business records can remain local, with only the minimum paid-job payload sent to that service. The existing local test backend does not by itself establish a production service.

## Research limits

Reviewed official repositories, documentation and public pricing pages; inspected existing provider integration code. No packages installed, provider benchmarks executed, paid requests made, accounts created, emails sent, database changes made or production services deployed. Exact dependency versions, commercial redistribution terms, account eligibility and real-world data quality remain implementation-stage checks.
