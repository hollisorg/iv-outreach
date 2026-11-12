# IV Outreach native discovery assessment — 2026-11-12

## Implemented in v0.3.0

The independent `src/core/research.js` now coordinates IV Outreach's existing public research tools and the user's
Claude Code/Codex harness. No upstream implementation, prompts or model code was copied. The provider engine,
Python installer, runtime bridge and provider Settings are removed from the active build and resource package.
Historical v0.2 source remains in the checkout and installed runtime files are left untouched but unused.

The native plan is executed by the calling agent, not a background worker. The plan's count/depth limits are agent
instructions; a user can stop research in chat. Research saves require a business-own-site source and distinguish
observations from inferred opportunities and unknowns. Saving validates shape and URLs, not factual truth.
There is no claim of identical coverage, private contacts, deliverability or GP exploration to the upstream engine.

Both live Claude Code and Codex fixture tests passed with the native plan and save tools and zero messages created.
38 unit/integration tests passed. The first actual campaign produced five prospects using public research with the
existing Claude Code login. No paid provider account or API key was needed, and nothing was drafted or sent.
Current agent plan limits and any configured extra usage still apply. Earlier cost figures below describe optional
services considered during the assessment, not required v0.3 dependencies.

Matthew requested first-run setup, current costs and a route to remove the separate OpenOutreach product/install.
The installed app's engine setup completed: Settings reports OpenOutreach 0.1.93 installed. Provider keys and model are
still missing; Matthew has no API key. No provider account, paid subscription or key was created.

## Ownership and packaging

The inspected package includes Python source; decompilation is unnecessary. Its metadata is GPL-3.0-or-later.
Private modification and use are permitted. A redistributed fork must retain applicable notices, license and source
availability obligations. Rebranding or translating copied code does not remove those obligations. A bundled runtime
can eliminate the separate install step, but remains an OpenOutreach-derived component.

For an independent product, implement a new discovery coordinator from IV Outreach's requirements and public provider
API documentation. Do not copy upstream implementation, prompts or learned-model code. Do not describe this as a
clean-room effort: source was already inspected. Maintain provenance for the independent implementation.

The existing IV code already supplies campaigns, public business Maps discovery, website research, dedupe, fit scores,
draft review, opt-outs, chat agents and mail handling. A first native version can use those pieces with the user's
existing chat agent, without Python or a second model key. Optional direct BetterContact search/enrichment can later
use its documented API, with explicit limits, cancellation, usage reporting and paid enrichment approval.
This would not initially reproduce the upstream Gaussian-process/embedding exploration pipeline or promise identical
result quality. Provider data remains a separate service and may cost money.

Suggested user-facing flow: Describe customer → review search criteria and source/cost → find → see sourced fit reasons
→ select prospects → draft → approve. Main labels become Find leads and Data connections. Keep third-party notices
for any retained dependencies. Preserve existing campaign data and CSV import compatibility during replacement.

## Pricing checked

- BetterContact pricing advertises 50 trial credits; Starter $15/month for 200 valid emails, Pro comparison $49/month
  for 1,000 credits; one valid email normally uses one credit. API Lead Finder docs also show plan/free-request limits:
  do not promise unlimited free searches. Confirm actual account entitlements before paid use.
- Claude Haiku 4.5 lists $1/million input and $5/million output tokens. An illustrative 100,000 input + 10,000 output
  token batch costs $0.15, excluding other services. This is not a measured per-lead estimate.
- Current Claude documentation says eligible Max/Ultra/Team plans include claimable API credits; Max lists $100/month.
  A Console organization and API key are still needed. Prior app wording that all chat subscriptions exclude API usage
  is too absolute and should be corrected in the next release. Eligibility and claimed balance were not checked.
- The existing Maps/web + chat path needs no new provider API account; it uses the user's current agent limits.

Sources:

- https://bettercontact.rocks/pricing/
- https://doc.bettercontact.rocks/api-reference/endpoint/lead_finder_post
- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers
- https://github.com/eracle/OpenOutreach/blob/main/LICENCE.md

## First campaign

Source: https://hollisorganization.com — AI-assisted creative production, websites, portals, CRM/integrations and
business workflows. Starting hypothesis: US service businesses needing better customer acquisition and booking/follow-up
handoffs. Select five public-source prospects, record evidence and distinguish potential fit from proven buying intent.
No outreach is authorized by this research request. Region is a provisional US scope, not a user-specified city.
