# Hivemind control center direction

Hivemind is a standalone Windows app for opening IV Outreach, IV Studio and IV Signal, plus IV Chat, IV Voice and IV Keys. The white IV eye opens a shared chat. The business picker filters saved handoffs, and each handoff opens in its receiving app. The chat uses an installed Claude Code or Codex session for planning and drafting with the selected workspace context.

## IV memory (0.5.0, 2026-11-15)

What the person's IV apps know about them and each business, whichever agent runs the chat.

- **Store:** `src/service/iv-memory.js` (shared source, like `iv-workspace.js`), an SQLite file at `%APPDATA%\IV Workspace\memory.db` beside the shared workspace; this PC only. Scope `you` or a shared business ID. Up to 600 memories of up to 600 characters; exact duplicates are skipped; anything that looks like a password, key, token or code is refused.
- **In chat:** each message carries the memories about the person and the selected business. Two more tools, `hivemind_remember` (one short fact, about "you" or the turn's business) and `hivemind_recall` (search). A green "Remembered" card shows each save with Forget it.
- **Memory tab** (Chat · Memory · Handoffs): About you and About <business>, each memory editable, movable between you and a business, and forgettable; an Add box.
- **Import from your AI:** Claude Code on this PC (`~/.claude/CLAUDE.md` and each project's `memory/MEMORY.md`), Codex on this PC (`~/.codex/AGENTS.md` and `memory_summary.md`), or the Claude/ChatGPT app (a prompt to copy, then paste its answer). The person's chosen agent reads it in one tool-free turn (up to about 70k characters) and suggests up to 40 short memories; the person ticks, edits and files them before anything is saved (`main/memory-import.js`).
- **Not yet:** IV Outreach, IV Studio and IV Signal chats don't read IV memory yet; they need the shared module and a context line each.
- Checks: `test/hivemind-memory.test.mjs`; `docs/verification/hivemind/memory-check.mjs claude|codex` (off screen, throwaway store: saved preference, recalled in a new thread, Memory tab, import of 40 suggestions from Claude Code's files and saving them).

## Chat harness (0.4.0, 2026-11-15)

Hivemind is a light harness over the person's own Claude Code or Codex (their subscription), aimed at IV work: no shell, no files, only Hivemind's tools.

- **Threads:** chats are threads per business (`main/chat.js`, saved in `%APPDATA%\Hivemind\chat\threads.json`; the older per-business `conversations.json` becomes threads on first run). Picker, New chat and Delete in the Chat tab.
- **Ongoing sessions:** each thread keeps its agent session and every message continues it (Claude Code `--resume`, Codex `exec resume`). Switching a thread's agent starts a fresh session that gets the chat so far as context; changing the model keeps the session. A session the agent can't find is dropped and the next message starts fresh with the history.
- **Live:** Claude Code replies stream token by token (`--include-partial-messages`); Codex shows each message as it completes. Tool steps show while running (pulsing) and stay on the reply (✓ or !).
- **Models:** Claude Code's current models, or the models in the person's own Codex picker (`models_cache.json`), each led by "your default" (`main/models.js`).
- Checks: `test/hivemind-chat.test.mjs`; `docs/verification/hivemind/harness-check.mjs claude|codex` (off screen: a third message recalls the first through the resumed session, a tool step shows live and is kept, replies stream).

## Desktop overlay (0.3.0) and the name IV Hivemind (0.3.1), 2026-11-14

The program is called **IV Hivemind**: installer `IV-Hivemind-Setup-<version>.exe`, folder `%LOCALAPPDATA%\Programs\IV Hivemind`, `IV Hivemind.exe`, shortcuts and window title "IV Hivemind". The app ID (`org.hollis.hivemind`) and the data folder `%APPDATA%\Hivemind` are unchanged, so installing 0.3.1 replaced the old "Hivemind" install and kept its data. Its icon is a coral brain in the IV app style (`apps/hivemind/build/icon.ico`).

Hivemind has no window frame. It is a transparent, borderless window covering the work area of the screen the mouse is on, so the eye, the app menu, the dock bar and the side panel float on the desktop.

- Click-through: the renderer marks every visible control `data-solid` and tells the main process whether the pointer is over one (`hivemind:solid`); everywhere else `setIgnoreMouseEvents(true, { forward: true })` lets the mouse through to the window behind. Checked with Windows' own `WindowFromPoint`.
- Menu tiles (0.3.2) show each app's real icon, a short line and, on hover, what it does. An app that isn't installed is greyed out with a tag: **Get** (IV Studio, IV Signal, IV Chat: public release feeds), **Soon** (IV Voice, IV Keys: draft releases only) or **Private** (IV Outreach: private repo). Clicking a Get tile shows the version and size from the feed; Install downloads the installer named in the release's `latest.yml`, checks its size and SHA-512, runs it per-user and silently into the standard folder, then opens the app once so it connects. Nothing runs if the check fails (`main/install.js`, `test/hivemind-install.test.mjs`). `HIVEMIND_PROGRAMS_DIR`, `HIVEMIND_HIDDEN=1` and `HIVEMIND_INSTALL_DRYRUN=1` are for test copies; `docs/verification/hivemind/menu-install-check.mjs` uses them off screen. Note the public IV Studio (1.1.11) predates the Hivemind handoff contract in the private 1.1.14 build, so its handoffs show "Connect first" until a release includes it.
- Menu: six tiles fan out above the eye. Outreach, Studio and Signal (the workspace apps) sit in the middle; IV Chat, IV Voice and IV Keys sit on the ends and only launch (`TOOLS` in `main/workspace.js`; they take no handoffs).
- Dock bar under the eye: business picker, Handoffs (with a count), Keep on top (remembered in `overlay.json`), Minimize and Close. Drag the eye to move the whole dock; its place is remembered.
- The eye opens a dark glass panel on the side with more room, with Chat and Handoffs tabs. Esc closes it. Enter sends; Shift+Enter adds a line.
- Motion: the eye fades in, the tiles spring out from it and drift, threads flow to them, the panel slides in from the eye's side. Reduced motion turns all of it off.
- If the screen layout changes, the window refits to its display. Launching Hivemind again moves it to the screen the mouse is on.

Check: `docs/verification/hivemind/overlay-check.mjs <win.ps1 helper> [--packaged]` drives the real desktop (it moves the mouse and takes screen captures, so run it only when nobody is using the PC, and don't keep the captures if other apps are on screen).

## Interaction

- The menu opens each app from its standard per-user Windows install location. An unavailable app is labeled.
- The eye opens chat while keeping the app tiles within reach. Keyboard activation and reduced motion are supported.
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
