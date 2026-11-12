# Private releases and app updates

Source and installers live in the private repository https://github.com/hollisorg/iv-outreach.

## On this PC

Settings → App updates shows the installed version. Installed Windows builds check on startup (after 20 seconds) and every six hours. Checks can be disabled there. Updates never download or install without a click. A downloaded update does not install merely because the app quits. Restart requires confirmation and is blocked while chat or mailbox work is running. Save any open form first.

Private test updates use the person's existing `gh auth login` for github.com. That account must have read access to this repository. Credentials stay in GitHub CLI's credential storage; the updater reads a token into main-process memory for the fixed private release destination. No token is embedded in code, installers, renderer state, chat/MCP tools, or logs. If GitHub CLI is unavailable or signed out, Settings explains how to connect and retry. Do not give customers the organization's GitHub credentials.

For a future public customer release, use a separate public installer feed or an authenticated IV download service. Current private updates are intended for authorized testers with GitHub repository access. Free agent features still work without GitHub authentication.

## Release process

1. Commit reviewed changes and push `main`. CI runs tests and a production build.
2. Bump the version in package.json and package-lock.json (for example `npm version patch`).
3. Push the version commit and its matching `vX.Y.Z` tag: `git push origin main --follow-tags`.
4. Tag CI repeats tests, restores the exact SHA-256 pinned Maps executable, and builds the installer. A second job uploads installer, blockmap and latest.yml to a draft, then publishes only after all three are uploaded.
5. Installed apps find the new release at their next check, or immediately via Settings → App updates.

Do not move or overwrite published version tags or release assets. For a failed workflow, inspect it before retrying; if a draft already exists, resolve that draft deliberately. Rollbacks should normally be a new higher-version release containing the reverted source. The updater refuses downgrades. Manual reinstall is possible; back up local data before any schema rollback.

The current personal-test installer is unsigned. HTTPS, private GitHub access and updater SHA-512 checks protect delivery integrity, but do not replace publisher code signing. Add a signing identity before wider distribution. No code-signature checks have been overridden.

## Clean checkout

Node.js 24, `npm ci`, `npm ci --prefix server`, `npm run vendor:restore`, `npm test`, `npm run dist`.
Keep app data, local billing credentials, verification receipts and installer output out of git. The account backend remains local and is not deployed by this workflow.
