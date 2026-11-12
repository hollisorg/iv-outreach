# Infinite Variance accounts — inspected design, November 12, 2026

Matthew's direction: existing accounts should belong to Infinite Variance, with Academy and Outreach as applications. Reuse identity rather than asking existing members to create another login. Free Outreach research should not require an IV account. No hosted schema, access policy or account was modified during this inspection.

## Verified current structure

Supabase project `utajiwjbzrpwjtbcsnly`, currently labelled IV Academy, belongs to The Hollis Organization. The current public schema has `iv_profiles` and `iv_access`, with 21 rows each. Only schema, functions, policies and aggregate counts were inspected; no member records were exported.

`auth.users.id` is already the stable identity. `iv_profiles.id` references it, and community/course/project data references those profile IDs. This can be the IV identity foundation without recreating users or changing passwords. The existing shared project also contains IV Studio beta/usage tables; those are not signed-in user entitlements.

The current signup trigger creates an `iv_profiles` row and an `iv_access` row for every new Auth user. `iv_private.active_member()` ties access to Academy free enrollment or its subscription tables; `is_admin()` uses the Academy access row. Profile editing also requires active Academy membership, and active Academy members can read profile rows. Consequently, simply pointing another app at this Auth project would also enroll its new users into Academy and couple profile access to Academy status. Reusing its subscription table without isolating products could grant the wrong access.

## Target boundaries

| Responsibility | Owning layer |
| --- | --- |
| Login, email verification, recovery, stable user ID | Existing Supabase Auth identity, branded Infinite Variance |
| Shared account identity | Existing profile ID preserved; private self-service account API |
| Academy role, enrollment, course progress, onboarding, moderation | Academy scope; retain existing references and access behavior for current members |
| Outreach subscription, credits, reservations, refunds and jobs | Outreach scope, bound to the same verified user ID; server-owned ledger |
| Leads, research and mailbox credentials | Local desktop profile |

Recommended rollout is additive and coordinated across the website and Outreach:

1. Preserve existing IDs and backfill explicit Academy membership for existing profiles, retaining suspensions and roles. Do not promote Academy admins into global administrators.
2. Separate account creation from app enrollment. New IV accounts should not become Academy members or public creator profiles merely by signing up for Outreach. Academy signup/join must explicitly enroll the person, while preserving current free enrollment behavior.
3. Add app-scoped access records, with user-owned reads and server-owned writes. Keep legacy Academy access/functions compatible until its frontend is migrated. Account profile editing should depend on the account, not on having an Academy subscription. Audit profile visibility before adding Outreach-only users.
4. Isolate billing by app and test/live mode. Keep the existing Academy subscription rows dedicated to Academy during migration; Outreach must not write its subscriptions into that table or borrow its entitlement function. Every checkout, webhook and credit job must use the verified IV user ID and the Outreach app scope. Never transfer credits by matching a mutable email address.
5. Rebrand account UI/email templates as Infinite Variance while retaining Academy-specific enrollment copy. Implement a desktop-safe sign-in/callback flow with secure session storage; do not turn the private local test identity into public authentication.
6. Before release, exercise existing-member login, recovery, Academy access/progress, new Outreach-only signup, explicit Academy joining, suspended membership, cross-user/app isolation, duplicate webhooks, reinstall/session recovery and test/live separation. Migration and frontend activation must be coordinated against the then-current live baseline.

The current local Stripe sandbox remains independent: 600 test credits belong to a private device test identity. Those are test fixtures, not a customer wallet to merge into a real account. Public shared accounts and a trusted hosted billing ledger are not activated by the desktop 0.5.1 installer. This document records the concrete migration boundary, not a claim that the shared-account migration is complete.
