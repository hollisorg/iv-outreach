# Hivemind control center direction

Matthew's product direction, November 12, 2026: launch Hivemind as its own app. An animated brain sits in the center of a wheel. Outreach, Signal and Studio sit around it as app launch buttons. Clicking the brain opens a single agent chat that can coordinate the IV apps. Studio source and builds remain private.

This is a proposed next phase. The current installed work renames the existing shared workspace and verifies native draft handoffs; it does not yet provide a standalone launcher or a cross-app agent.

## Interaction

- Resting view: a gently animated brain, three clearly labeled app nodes, selected business and a small current-activity indicator. The orbit does not move click targets.
- Brain click: transition into the conversation, keeping the three apps accessible. Keyboard activation and reduced-motion mode work too.
- App node click: open the installed app at the relevant business/project/draft when available. Missing apps show a clear setup action.
- Chat: request an outcome such as "Make Hollis a LinkedIn campaign." Show research, brief, creative project and post draft as linked steps, with progress and a way to open each result.
- Approval cards name the app, business, action and any cost. A draft request does not authorize generating paid media or publishing it.

## Existing foundation and gaps

The local handoff store already carries versioned business context, selected media and repeat-safe native draft receipts. The apps already have agent and MCP integration patterns. A coordinating agent still needs an explicit tool catalog spanning all three apps, app availability checks, resumable tasks, progress events, per-action permissions and a shared chat surface. Reuse app-owned operations rather than having the new chat write directly into three native databases.

Keep account credentials in their owning app. Share the selected business and task context; avoid mixing brands' conversations or approvals. Store durable task state locally first. Keep the existing Hivemind data/IDs compatible.

## T3 Code assessment

Primary sources reviewed November 12, 2026:
- [Repository](https://github.com/pingdotgg/t3code)
- [FAQ](https://github.com/pingdotgg/t3code/blob/main/docs/user/faq.md)
- [MIT license](https://github.com/pingdotgg/t3code/blob/main/LICENSE)

T3 Code describes itself as a control surface using existing agent harnesses, including Claude Code and Codex. It supports bringing an existing provider setup. Its root license permits modification/distribution while retaining the copyright and permission notice. This is evidence that a derivative is feasible, not a completed dependency/security review.

Recommendation: prototype the wheel and one unified chat first, then compare T3's provider/session machinery against the IV apps' existing adapters. Evaluate a pinned T3 revision for Windows packaging, custom MCP tools, permission behavior, reconnect/session recovery, local-only operation and any hosted-service dependencies before committing to a full fork. Keep the IV-specific tool layer separate so the UI/provider foundation can change without rewriting the apps. No T3 fork, installation, account connection or background service was created in this task.

## Supplied identity and motion

Matthew supplied logowhite.png as Hivemind's central identity: the existing white eye/infinity mark. Keep its shape intact. The shared UI now uses this exact asset with a subtle idle pulse and a brighter orbit during app handoffs. Reduced-motion mode is static. Carry this identity into the future central agent button and wheel; no generated replacement brain is needed. These are native UI animations, not generated video.
