# IV Outreach visual identity

The visible desktop interface is renamed IV Outreach and follows the installed IV Studio 1.1.5 application.
The renderer's existing bridge identifiers remain unchanged for compatibility.

## Reference and assets

Reference: `%LOCALAPPDATA%\Programs\IV Studio\resources\app.asar`.
The parent agent viewed the installed application through native computer use. Its packaged CSS and static assets were
then read with `@electron/asar`; the installed package declares `license: MIT`, author Infinite Variance.
Matthew explicitly requested use of this app's visual styling.

- Dark canvas `#100c0e`, violet-black panels `#19131a`, coral `#f44859`, cream `#f4ecdc`.
- Barlow Condensed 700/800 display type, DM Sans 400/600 body type, JetBrains Mono 400 labels.
- Numbered uppercase sidebar, thin rectangular borders, compact titlebar and chat controls.
- Infinite Variance eye mark reused from its packaged renderer; four original outreach illustrations created with built-in imagegen, using the installed eye artwork as a style reference only. See `iv-outreach-graphics.md` for exact prompts and provenance.
- Outreach-specific dashboard hero: “Who's next?”, a lead-search prompt, and a chat handoff.
- The new application icon combines the Infinite Variance eye with a coral outbound arrow.

Font files are copied from the installed IV Studio bundle, with their official SIL OFL notices obtained from the
Google Fonts source directories `ofl/barlowcondensed`, `ofl/dmsans`, and `ofl/jetbrainsmono`. Notices live under
`src/renderer/src/assets/licenses` and are included in the renderer build via local `rel=license` URLs.

## Checks

- Renderer production build passed.
- Existing fictional-data `scripts/ui-check.mjs` passed with zero renderer errors.
- Dashboard, lead list, approval, social, settings, mailbox and drawer screenshots captured under
  `docs/verification/iv-outreach-style`.
- Dashboard and Settings screenshots visually inspected against the installed IV Studio reference.
- `scripts/ui-empty.mjs` uses the old `.hero` selector and needs `.outreach-hero` after this redesign; parent notified.

This work did not read or change user campaign data, mailboxes, account state, or provider credentials.
