# OpenOutreach outbound audit — IV Outreach

Audited 2026-11-12 using the user-invoked `reverse-engineer-anything` skill's source-analysis route. The Python wheel
contains its implementation, so no binary decompilation or REA client changes were needed. The parent session owns
coordination for this work. No live provider search, billing event, mailbox operation, or account registration was made.

## Scope and identity

Installed packages inspected under `.runtime/openoutreach/Lib/site-packages/`:

- OpenOutreach 0.1.93, OpenOutFind 0.1.78, OpenOutSend 0.1.72, OpenOutLearn 0.1.8.
- Searched the Python source of those four packages for HTTP destinations, request clients, registration, sharing,
  newsletter, telemetry, analytics and instrumentation calls. Followed the identified calls from the find command
  through readiness, discovery, enrichment and status.
- Inspected Hugging Face Hub's telemetry switch and ONNX Runtime's exposed telemetry-disable function. This was not
  a full source review of all 124 transitive packages or their native binaries.

SHA-256 of the installed sources central to this review:

| File under site-packages | SHA-256 |
|---|---|
| `openoutfind/contacts/service.py` | `fdbee1318e08ab4c485b51bcfa529b660ef51cfe828c0689fb70aa94dc6ad00e` |
| `openoutreach/wizard.py` | `ed0cbf34edb1a63a879f638eea47745998d3e6870ba48dcadd268a15f6ff802d` |
| `openoutfind/core/readiness.py` | `dc948365bccd80c1ec0ecc0a455106d810f545c3b9813f8c4c119acf269618a3` |
| `openoutfind/core/management/commands/find.py` | `c8a1b5b6bd4e5df1e678a12ed332c6c70297341a909246bc41663e4252aa5a26` |

## Findings and behavior in IV Outreach

| Upstream behavior observed in source | Evidence in installed package | Integration behavior |
|---|---|---|
| Automatically registers an operator with the upstream hub when an email is supplied | `core/readiness.py:139–160`; `contacts/service.py:262–306` | Launcher clears the operator email and makes registration/token functions inert. |
| Shares discovery profiles, employer records and vectors with `hub.openoutreach.app` | `core/pipeline/discover.py:40–59`; `contacts/service.py:161–198` | Profile/company sharing functions return without a request. |
| Queries a shared contact cache and contributes paid resolved addresses | `enrichment/lookup.py:69,213`; `contacts/service.py:74–158` | Cache resolution and contributions return without a request. Paid work-email resolution uses the configured provider directly. |
| Queries hub credits and attaches version/build metadata to hub requests | `core/status.py:189`; `contacts/service.py:308–420` | Hub balance reports disabled; low-level hub request, registration and token functions are also inert. |
| Has newsletter defaults in the onboarding wizard | `openoutreach/wizard.py:106,256–267`; `config/models.py:39,98` | Wizard is never invoked, newsletter environment is forced false, and no sender/init command is accepted. |
| Displays an upstream affiliate redirect as the email-provider sign-up link | `enrichment/bettercontact.py:37` | Runtime link is replaced with the direct BetterContact home page. |
| Calls BetterContact to discover people, inspect credits, and optionally resolve work addresses | `discovery.py:22`; `enrichment/bettercontact.py:54–55,349–413` | Preserved because these calls implement the requested search. Work-email purchasing requires the caller to select the bounded `emails` mode. |
| Calls the operator-selected model provider to verify credentials and qualify leads | `core/readiness.py:104–120`; `core/llm.py` | Preserved. Model calls may incur the operator's provider charges. |
| Downloads and caches an embedding model through FastEmbed/Hugging Face | `openoutlearn/embeddings.py:28–40`; `core/conf.py:150` | Preserved. Cache stays under the app-provided cache directory; Hugging Face telemetry is disabled and ONNX Runtime telemetry events are disabled. |

## Launcher boundary

`vendor/openoutreach/runner.py` exposes only:

- `probe`: verifies audited package versions and imports, reports capabilities, never creates a schema or connects to a provider.
- `--db <absolute-path> find <0..25> [emails] --json`: searches or exports a single app-owned campaign store.

The launcher rejects `send`, `run`, `init`, arbitrary Django commands, browser-opening flags and arbitrary argument
passthrough. It does not call the orchestrator entry point or read its saved wizard configuration. It receives only the
finder configuration supplied by IV Outreach; sender environment variables are removed. Positive counts call the actual
OpenOutFind Django command in OpenOutreach's registry. Count zero uses the real package's bootstrap and export functions
directly, because upstream `find 0` still checks credentials and queries provider balances. Probe and zero-count export
explicitly forbid network access in the guarded process.

Before pipeline imports, the launcher disables all identified hub entry points, forces telemetry opt-out environment
settings, and adds URL and DNS/socket destination checks for `openoutreach.app` and `openoutreach.com` plus common
telemetry destinations (`logfire.dev`, `pydantic.dev`, `sentry.io`, `posthog.com`). URL checks cover requests, urllib and
HTTPX sync/async clients, including redirects and HTTP proxy use. Custom model URLs pointing to those domains are rejected.
The package versions must match the reviewed versions or the launcher refuses to run.

These checks apply only when IV Outreach launches the engine through this wrapper. Running an upstream CLI directly
does not use these protections. They are an application guard, not a machine-wide firewall. They do not prove that an
unknown native dependency, hard-coded IP, new destination, or future package implementation cannot make a connection.
The reviewed source and tested call paths support the narrower conclusion: the identified upstream hub and newsletter
paths are disabled, while intentional discovery/model/model-download connections remain possible.

## Verification and limits

` .runtime/openoutreach/Scripts/python.exe test/openoutreach-privacy.py ` passed 8 local tests:

1. Every identified hub entry point is inert with HTTP calls set to fail if reached.
2. Upstream DNS, requests and urllib requests are rejected before transport.
3. HTTPX provider transport is permitted, but a redirect to the hub is blocked before the second transport call.
4. Async HTTPX upstream requests are blocked before transport.
5. Custom upstream model URLs are rejected and telemetry/newsletter switches are off.
6. Sending, onboarding, arbitrary flags, and counts above 25 are rejected before database creation.
7. A real empty upstream schema is migrated and exported without keys or network access.
8. A real positive-count command without configuration returns `onboarding_incomplete` without provider calls.

The sandbox prevented Python's asyncio implementation from creating its internal loopback socket pair. The same suite
passed with local process access outside that sandbox; HTTP transports remained mocked and upstream destinations blocked.

This was not a live packet capture of a paid, credentialed search. Actual discovery success, provider account permissions,
model-download availability, result quality and all possible transitive/native traffic remain unverified until a real
configured run is tested. Never characterize these offline checks as proof of a successful live search.
