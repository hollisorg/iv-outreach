# IV Outreach

Find and research real businesses for your outreach, from a chat with your own **Claude Code, Codex or Hermes**. IV Outreach keeps your campaigns, leads, research and drafts on your PC, and nothing is sent without your approval.

This repository also holds **IV Hivemind** (`apps/hivemind`), the desktop overlay that opens and connects the IV apps.

## Download

- **IV Outreach** for Windows: [latest release](https://github.com/hollisorg/iv-outreach/releases/latest)
- **IV Hivemind** for Windows: [IV-Hivemind-Setup.exe](https://github.com/hollisorg/iv-hivemind-releases/releases/latest/download/IV-Hivemind-Setup.exe)

The installers aren't code-signed yet, so Windows may show "Windows protected your PC" the first time. Choose More info, then Run anyway.

## What it does

- **Chat with your own agent.** Tell it what you sell, who you want to reach and where. It researches businesses on the public web and saves what it finds, with sources.
- **Scanning.** A gallery of free workflows: local markets by business type, agent research, custom Maps searches, opportunity scans of a business website, watchlists and news, and content briefs for IV Studio and IV Signal.
- **Leads you can trust.** Each lead keeps its observations, fit reasons, opportunities and unknowns apart. Unknowns stay marked; nothing is invented.
- **Drafts with approval.** Ask for drafts when you're ready. Email sending needs your approval and a connected mailbox; social messages stay manual.
- **Works with the other IV apps** through IV Hivemind: shared profiles, shared memory and handoffs.

Public research can find websites, published contacts and business facts. It can't promise private emails, verified deliverability or buying intent.

**Premium** (paid contact data and extra reach) is coming soon. Everything in IV Outreach today is free.

## Updates

IV Outreach updates itself from this repository's releases, with no account or sign-in needed. It checks when it opens and every six hours, downloads new versions in the background, and installs them when you close it. Settings → App updates shows your version, with Check for updates and Restart and install, and lets you turn automatic updates off. IV Hivemind does the same from its gear button.

## Build it yourself

You need Node.js 24 on Windows.

```
npm ci
npm test
npm run dist            # IV Outreach installer in dist/
npm run hivemind:dist   # IV Hivemind installer in apps/hivemind/dist/
```

`npm run dev` and `npm run hivemind:dev` run them from source. The Google Maps scraper used by local searches isn't in git; `node scripts/restore-vendor.mjs` fetches the pinned release (see `vendor/README.md`).

## Licence

MIT (see [LICENSE](LICENSE)). Bundled third-party tools and data keep their own licences, listed in `vendor/README.md`.
