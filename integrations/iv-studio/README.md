# Private IV Studio integration snapshot

The adjacent patches preserves the local IV Studio 1.1.11 integration without publishing new source to Studio's public repository.

- Base: `hollisorg/iv-studio` commit `5777a262b00e9a1b5e2afd4ea34168dc01d24ab3` (1.1.9).
- Completed local commit: `0586178cda6a6b78e750697ff50a564882eef337` on `codex/iv-handoff`.
- Apply all three patches in numeric order to a clean checkout of that base with `git am`; then `npm ci`, `npm test`, `node test/iv-workspace-import.mjs`, `node test/tours.mjs` and `npm run dist`.
- No profile contents, credentials or generated media are included. The patch contains source, dependency lock, tests and usage documentation only.
- The local build is installed and tested. A future public Studio update may supersede this private integration until the change is merged upstream. No public release was authorized or published for this task.

Signal's matching source is in private `hollisorg/iv-signal`, commit `781dcf8cf201e1cfeb3d0d38ee2fdb6f8fbe9e50`. Outreach owns the common contract source. See [the integration guide](../../docs/iv-workspace.md).
