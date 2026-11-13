# Hivemind control center direction

Hivemind is a standalone Windows app for opening IV Outreach, IV Studio, and IV Signal. The white IV eye opens a shared chat. The business picker filters saved handoffs, and each handoff opens in its receiving app. The chat uses an installed Claude Code or Codex session for planning and drafting with the selected workspace context.

## Interaction

- The wheel opens each app from its standard per-user Windows install location. An unavailable app is labeled in the wheel.
- The eye opens chat while keeping the three app buttons within reach. Keyboard activation and reduced motion are supported.
- The handoff list reads the shared workspace. Opening a handoff invokes its receiving app, where the existing receipt rules resolve the project or draft.
- Chat saves conversations locally by business and agent. Each request includes the selected business context, recent handoff summaries, and a bounded conversation history. The agent can reopen an existing handoff (below); for anything else, use the app buttons and handoff links.

## Chat actions: reopen existing work (2026-11-12)

The first chat action reopens an existing Studio project or Signal draft for the selected business.

- The agent gets two tools from a small stdio MCP server Hivemind starts for its own chat only (`apps/hivemind/mcp/server.js`, built to `out/main/mcp.js`, run with Hivemind's own binary in Node mode): `hivemind_find_handoffs` (read only) and `hivemind_reopen`. Claude Code runs with no built-in tools and only `mcp__hivemind`; Codex keeps shell, web, plugins and apps off.
- Each call goes through a token-protected loopback bridge (`main/bridge.js`, the same pattern as Outreach's visual guidance bridge) to the main process. The business always comes from the turn Hivemind started, never from the agent, so one business's chat cannot open another's handoff.
- `main/actions.js` matches the person's words against handoff title, goal, campaign, channel and business. App words (Studio/project, Signal/draft/post) narrow the app. One clear match opens; "latest" picks the newest; several matches open nothing and return choices, which the chat shows as buttons. A button opens only a handoff Hivemind itself offered in that conversation.
- Opening reuses the existing app-owned path: the receiving app is launched with the existing handoff ID, and its receipt rules return the project or draft it already made. Hivemind never creates a handoff, so repeating a request cannot make a duplicate. At most three opens per reply; the same item opens once per reply.
- The chat shows what Hivemind actually did as cards ("Opened in Signal" or "Which one should open?"), saved with the conversation per business and agent and fed back to the agent as history. Tool progress shows while the agent works.
- Approval, generation, spending, scheduling and publishing stay in the receiving app under its own rules. The agent is told it cannot do them and must report an open only when the tool said so.

Checks: `test/hivemind-actions.test.mjs` (matching, choices, business scoping, bridge token, MCP list and call) and `docs/verification/hivemind/chat-reopen-check.mjs [claude|codex]`, which drives the built app against the real workspace, Signal and Studio and confirms no new handoff, Signal post or Studio production.

## Existing foundation and gaps

The local handoff store carries versioned business context, selected media, and repeat-safe native draft receipts. The launcher reads that store without a migration. Chat supports planning, drafting and reopening existing handoffs. Further app actions should extend the same tool catalog and bridge, with progress events and the receiving apps' existing approval rules.

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
