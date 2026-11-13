# Hivemind control center direction

Hivemind is a standalone Windows app for opening IV Outreach, IV Studio, and IV Signal. The white IV eye opens a shared chat. The business picker filters saved handoffs, and each handoff opens in its receiving app. The chat uses an installed Claude Code or Codex session for planning and drafting with the selected workspace context.

## Interaction

- The wheel opens each app from its standard per-user Windows install location. An unavailable app is labeled in the wheel.
- The eye opens chat while keeping the three app buttons within reach. Keyboard activation and reduced motion are supported.
- The handoff list reads the shared workspace. Opening a handoff invokes its receiving app, where the existing receipt rules resolve the project or draft.
- Chat saves conversations locally by business and agent. Each request includes the selected business context, recent handoff summaries, and a bounded conversation history. Use the app buttons and handoff links to act on the agent’s suggestions.

## Existing foundation and gaps

The local handoff store carries versioned business context, selected media, and repeat-safe native draft receipts. The launcher reads that store without a migration. Chat currently supports planning and drafting. Direct app actions will require an explicit tool catalog, progress events, and the receiving apps' existing approval rules.

Keep account credentials in their owning app. Share the selected business and task context; avoid mixing brands' conversations or approvals. Store durable task state locally first. Keep the existing Hivemind data/IDs compatible.

## T3 Code assessment

Primary sources reviewed November 12, 2026:
- [Repository](https://github.com/pingdotgg/t3code)
- [FAQ](https://github.com/pingdotgg/t3code/blob/main/docs/user/faq.md)
- [MIT license](https://github.com/pingdotgg/t3code/blob/main/LICENSE)

T3 Code describes itself as a control surface using existing agent harnesses, including Claude Code and Codex. It supports bringing an existing provider setup. Its root license permits modification/distribution while retaining the copyright and permission notice. This is evidence that a derivative is feasible, not a completed dependency/security review.

The first desktop build reuses IV Outreach's agent discovery and stream parsing. The UI can support a different agent adapter later if the project needs one.

## Supplied identity and motion

The supplied white IV eye is the central chat button. It uses the same red accent as the companion apps, a subtle pulse, and a static reduced-motion mode. The engraved background is a new built-in ImageGen asset at `apps/hivemind/renderer/engraved-background.webp`.

## Build and install

Run `npm run hivemind:build` from the repository root to compile the standalone app, or `npm run hivemind:dist` to create the Windows installer in `apps/hivemind/dist`. The app has its own Windows shortcut and keeps chat history under `%APPDATA%\Hivemind\chat`.
