# Private IV Studio integration snapshot

The adjacent patches preserve the local IV Studio 1.1.14 integration without publishing new source to Studio's public repository.

- Base: `hollisorg/iv-studio` commit `5777a262b00e9a1b5e2afd4ea34168dc01d24ab3` (1.1.9).
- Completed local commit: `f0d2475e5b8a049aeacfa1e2ba68a9c26a51a178` on `codex/iv-handoff`.
- Apply all six patches in numeric order to a clean checkout of that base with `git am`; then `npm ci`, `npm test`, `node test/iv-workspace-import.mjs`, `node test/tours.mjs` and `npm run dist`.
- No profile contents, credentials or generated media are included. The patch contains source, dependency lock, tests and usage documentation only.
- The local build is installed and tested. A future public Studio update may supersede this private integration until the change is merged upstream. No public release was authorized or published for this task.

Signal's matching source is in private `hollisorg/iv-signal`, commit `d520463b350f7d2293c3bf739dd232f4f38e2d81`. Outreach owns the common contract source. See [the integration guide](../../docs/iv-workspace.md).
