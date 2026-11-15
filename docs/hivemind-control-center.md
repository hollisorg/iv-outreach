# Hivemind control center direction

Hivemind is a standalone Windows app for opening IV Outreach, IV Studio and IV Signal, plus IV Chat, IV Voice and IV Downloader. The white IV eye opens a shared chat. The business picker filters saved handoffs, and each handoff opens in its receiving app. The chat uses an installed Claude Code or Codex session for planning and drafting with the selected workspace context.

## One business across the IV apps (0.7.0, 2026-11-15)

People see these shared businesses as **profiles** (0.7.1, Matthew's call; "projects" was dropped because IV Studio has its own Projects): the switcher, the Profiles tab, the pop-up ("One profile everywhere") and the in-app handoff panel say profile. Code, IPC and storage keep the business/brand names, and the chat agent is told that profile and business mean the same thing.

The person picks the business they're working on once, in Hivemind, and every IV app follows it with its memory.

- **Active business:** the shared workspace keeps it (`active()`/`setActive()` in `src/service/iv-workspace.js`, meta key `active`; `''` means all businesses). Hivemind's dock switcher and the Businesses tab set it.
- **Outreach and Signal follow** (`followActive` in `src/service/iv-workspace-host.js`): on launch and every 3 s while open they select their linked copy of it, making the copy from the shared profile first if they have none, and their window switches (`workspace:active`). Picking a shared business inside either app (`picked`) makes it active everywhere; picking a business that isn't shared changes only that app.
- **The Hivemind button in each app** (Outreach, Signal, Studio; shared `IVWorkspace.jsx`) shows the active business and opens a short pop-up (Matthew's call): what Hivemind is, then **Open Hivemind** when it's installed in the standard per-user folder (launches it) or **Get Hivemind** (opens `HIVEMIND_PAGE`, https://infinitevariance.ai/downloads, which does not list Hivemind yet). "Handoffs in this app" still opens the earlier in-app panel, which also still opens for incoming handoffs. `IV_HIVEMIND_EXE` points a test copy at another program. Check: `docs/verification/hivemind/popup-check.mjs`.
- **Studio:** Studio's chat gets its shared profile and memories (`ivMemoryNote({ useActive: true })`).
- **Businesses tab** (`main/businesses.js`, `renderer/businesses.jsx`): the shared profiles with which apps have a copy, Work on this, Edit and New business (name, website, offer, audience, voice, look, place, goal, colour, logo), and businesses that so far exist in only one app (read from Outreach's and Signal's own databases) with Share, which saves the profile and logo and links that app's copy exactly as the app's own Share does. Edits reach Outreach and Signal's copies the next time their Hivemind panel refreshes (every 4 s while open).
- Checks: `test/hivemind-businesses.test.mjs`; `docs/verification/hivemind/follow-check.mjs` (Outreach and Signal test copies on throwaway data: open on the active business, switch while open, show it, an in-app pick sets it); `docs/verification/hivemind/businesses-check.mjs [--packaged]` (switcher, Businesses tab, share, new, edit, following an app's pick).

## Working in the IV apps (0.6.0, 2026-11-15)

Hivemind's chat does the work in IV Outreach, IV Signal and IV Studio itself, through each app's own tools, and the person can watch.

- **Router:** `main/app-tools.js` starts each installed app's MCP server from its install folder (`<app>.exe` in Node mode on `resources/app.asar/out/main/mcp.js`) in the app's own chat mode (`FITSCOUT_AGENT_RUN`, `IV_SIGNAL_AGENT_RUN`, `IV_STUDIO_AGENT_RUN` = `chat`), keeps it for a few idle minutes, and passes no keys: credentials stay in the apps. Tools that only point at the app's own window (`show_in_app`, `inspect_app`, `list_places`) are left out.
- **Three tools instead of hundreds:** `iv_app_tools` (search an app's tools, with the app's guide), `iv_app_tool` (one tool's inputs), `iv_app_call` (run it). The agent never loads Studio's 200+ schemas at once.
- **The apps' rules:** in chat mode each app asks before anything that approves, spends, deletes, sends or changes settings by writing an ask file and waiting for the answer. Hivemind shows each ask as an Allow card in the reply (Allow / Don't allow) and writes the answer back; a reply that ends or is stopped answers open cards with Don't allow. The card and its answer stay on the reply.
- **Business:** the context gives the selected business's own ID in each app (from the workspace links). A call whose `business_id`/`brand_id` belongs to another business, or isn't the linked one, is refused. With All businesses selected Hivemind doesn't narrow it.
- **Live:** steps are named after the app tool ("Signal: Draft a post"); the app's tile shows Working and the eye says "Working in Signal"; the first change in an app brings it up on screen, and Hivemind stays on top for the rest of the reply (the Keep on top choice comes back afterwards). A "Worked in Signal" card lists the tools used with Show Signal.
- **IV memory in the apps' own chats:** `src/service/iv-memory-note.js` adds the person's memories, and the linked business's for Outreach and Signal, to each message in Outreach, Signal and Studio's own chats.
- Checks: `test/hivemind-apps.test.mjs` (a stand-in app server in `test/fixtures`); `docs/verification/hivemind/apps-check.mjs claude|codex [--packaged]` (off screen, throwaway Signal data: brand and draft made, archive asked and declined, nothing archived).

## IV memory (0.5.0, 2026-11-15)

What the person's IV apps know about them and each business, whichever agent runs the chat.

- **Store:** `src/service/iv-memory.js` (shared source, like `iv-workspace.js`), an SQLite file at `%APPDATA%\IV Workspace\memory.db` beside the shared workspace; this PC only. Scope `you` or a shared business ID. Up to 600 memories of up to 600 characters; exact duplicates are skipped; anything that looks like a password, key, token or code is refused.
- **In chat:** each message carries the memories about the person and the selected business. Two more tools, `hivemind_remember` (one short fact, about "you" or the turn's business) and `hivemind_recall` (search). A green "Remembered" card shows each save with Forget it.
- **Memory tab** (Chat · Memory · Handoffs): About you and About <business>, each memory editable, movable between you and a business, and forgettable; an Add box.
- **Import from your AI:** Claude Code on this PC (`~/.claude/CLAUDE.md` and each project's `memory/MEMORY.md`), Codex on this PC (`~/.codex/AGENTS.md` and `memory_summary.md`), or the Claude/ChatGPT app (a prompt to copy, then paste its answer). The person's chosen agent reads it in one tool-free turn (up to about 70k characters) and suggests up to 40 short memories; the person ticks, edits and files them before anything is saved (`main/memory-import.js`).
- **In the other apps:** from 0.6.0 the IV Outreach, IV Signal and IV Studio chats read it too (see above); only Hivemind adds to it.
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
- Menu tiles (0.3.2) show each app's real icon, a short line and, on hover, what it does. An app that isn't installed is greyed out with a tag: **Get** (every app has a public release feed since 0.7.3: IV Outreach, IV Studio, IV Signal, IV Chat, IV Voice, IV Downloader). Clicking a Get tile shows the version and size from the feed; Install downloads the installer named in the release's `latest.yml`, checks its size and SHA-512, runs it per-user and silently into the standard folder, then opens the app once so it connects. Nothing runs if the check fails (`main/install.js`, `test/hivemind-install.test.mjs`). `HIVEMIND_PROGRAMS_DIR`, `HIVEMIND_HIDDEN=1` and `HIVEMIND_INSTALL_DRYRUN=1` are for test copies; `docs/verification/hivemind/menu-install-check.mjs` uses them off screen. Note the public IV Studio (1.1.11) predates the Hivemind handoff contract in the private 1.1.14 build, so its handoffs show "Connect first" until a release includes it.
- Menu: six tiles fan out above the eye. Outreach, Studio and Signal (the workspace apps) sit in the middle; IV Chat, IV Voice and IV Downloader sit on the ends and only launch (`TOOLS` in `main/workspace.js`; they take no handoffs).
- Dock bar under the eye: business picker, Handoffs (with a count), Keep on top (remembered in `overlay.json`), Minimize and Close. Drag the eye to move the whole dock; its place is remembered.
- The eye opens a dark glass panel on the side with more room, with Chat and Handoffs tabs. Esc closes it. Enter sends; Shift+Enter adds a line.
- Motion: the eye fades in, the tiles spring out from it and drift, threads flow to them, the panel slides in from the eye's side. Reduced motion turns all of it off.
- Browser video (0.6.0): while the pointer is over a control the overlay takes clicks and, to Windows, became a plain opaque rectangle over the whole screen, so Chrome and Edge treated a browser under it as covered and stopped drawing its video (YouTube froze while Hivemind was dragged). The window now has a region with one corner pixel left out (`shapeWindow` in `main/index.js`), which browsers' occlusion checks skip. `docs/verification/hivemind/shape-check.mjs` checks the packaged window's region in both states.
- Monitors (0.6.1): dragging the eye past the edge of its screen moves the overlay to the display under the pointer and the drag carries on there (`hivemind:move-to`). `docs/verification/hivemind/monitor-check.mjs` checks it off screen.
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
