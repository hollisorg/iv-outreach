# IV Outreach: embedded OpenOutreach, v0.2.0

## Setup and use

1. Open Settings → OpenOutreach and select Install engine. This downloads managed Python 3.12 and 124 pinned packages.
2. Enter a BetterContact API key, model-provider API key, supported provider:model ID and optional two-letter country.
   Keys are encrypted with Windows DPAPI through Electron safeStorage. Blank fields preserve existing keys; Remove saved
   keys deletes them. Keys are never returned to the renderer or chat after saving.
3. Create or select a campaign with its offer and ideal customer criteria. Ask chat to find leads using OpenOutreach.
4. Approve the search Allow card. Searches accept 1–25 leads. Model API usage is separate from the chat subscription;
   optional work-email enrichment can consume BetterContact credits. Email enrichment defaults off.
5. Results appear in the campaign as they arrive, with source explanations. Chat can poll or cancel the search.
   Cancellation keeps imported results and may not undo provider charges already incurred.

No outreach is sent by discovery. Existing message approvals, do-not-contact rules and manual social sending still apply.

## Integration

The main process owns the runtime, decrypted keys and child process. The MCP server reaches a token-authenticated
loopback bridge exposing only status, find, job and cancel. The bridge rejects browser Origin requests. Agent tools are
`fitscout_openoutreach_status`, `fitscout_find_with_openoutreach`, `fitscout_openoutreach_job` and
`fitscout_cancel_openoutreach`. The app must be open. Legacy tool names and `%APPDATA%/Fitscout` are retained for compatibility
and existing user data; the visible product and installer are IV Outreach.

Only a fixed launcher can run. There is no arbitrary command, init wizard or sender route. Separate campaign/configuration
stores prevent mixing discovery state. JSON results use the validated, transactional CSV adapter underneath, including
source-ID dedupe, suppression and identity-conflict handling. Request IDs survive restarts to prevent accidental repeat
spend. Interrupted jobs require an explicit new request. One search runs at a time, with bounded output and a 15-minute limit.

The reviewed versions are OpenOutreach 0.1.93, OpenOutFind 0.1.78 and OpenOutSend 0.1.72. Setup verifies the uv executable
hash and launcher probe; repair reinstalls pinned dependencies. Upgrades require a fresh audit. See
[outbound audit](openoutreach-network-audit.md) for disabled upstream calls, evidence and limitations.

## Verification

- JavaScript suite: 35 passing tests, including streamed imports, suppression, request-ID reuse, partial errors,
  cancellation, timeouts, secret isolation and actual MCP/loopback transport with simulated discovery output.
- Python privacy suite: 8 passing tests against the installed engine, including real local schema/export.
- Managed runtime installation and repair completed on this Windows machine.
- Desktop settings check verified encrypted storage, no keys in generic settings, removal, runtime readiness and clean
  bridge shutdown. A real Claude Code chat turn called the status tool and correctly reported missing provider keys.
- No credentialed live discovery or paid enrichment was performed. Real provider search requires the user's keys.
  SMTP/IMAP testing with a real mailbox and installing the NSIS installer remain unverified.

The final installer and packaged checks are recorded in [v0.2.0 verification](verification/iv-outreach-v0.2.0.md).

Developer checks:

```powershell
npm.cmd test
node scripts/setup-openoutreach.mjs .runtime/managed-test
.runtime/managed-test/openoutreach/runtime/Scripts/python.exe test/openoutreach-privacy.py
node scripts/openoutreach-runtime-check.mjs
node scripts/openoutreach-runtime-check.mjs --packaged
```
