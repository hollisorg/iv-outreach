# Leadwell (working name)

Describe your ideal customer, or paste a franchise website. Claude finds matching businesses, researches each one,
writes a personal first message for your approval, and ranks whoever replies so you know who to call first.

Everything sends from **your own** email and **your own** LinkedIn, at a human pace, with a do-not-contact list
that's respected across every campaign.

## Status

| Piece | State |
|---|---|
| Core engine (campaigns, leads, enrichment, scoring, drafts, approval, caps, opt-outs) | Built, tested |
| MCP server (Claude drives it from chat) | Built, tested |
| Desktop dashboard | Next |
| Email sending + reply detection | After dashboard |
| Windows installer | After that |

## Try it with Claude now (developer setup)

```powershell
npm.cmd install
npm.cmd test
```

Add this to Claude Desktop's `claude_desktop_config.json` under `mcpServers` (adjust the path), then restart Claude:

```json
"leadwell": {
  "command": "node",
  "args": ["C:\\Users\\Matthew\\Desktop\\leadwell\\src\\mcp\\server.js"]
}
```

Then ask Claude: *"Use Leadwell. Build me a campaign from mrrooter.com's franchise page and find 20 owners of
independent plumbing shops in Columbus, Ohio."*

## How a campaign runs

1. **ICP**: Claude builds it from your answers or a website (`leadwell_read_website`, `leadwell_create_campaign`).
2. **Find**: Claude researches real businesses and adds them with the page it found them on, or you import a CSV
   you already own (Sales Navigator, Apollo, Google Maps exports).
3. **Research**: each lead's own website is read for published contact emails, socials and a summary.
4. **Score**: Claude rates fit 0-100 with a reason.
5. **Draft**: short, specific messages. Each one is checked for missing details, risky claims, the LinkedIn
   300-character limit, and the do-not-contact list.
6. **Approve**: nothing goes out until you say so.
7. **Send**: the app sends email within your daily cap. LinkedIn notes come as a send list, and you send each
   one yourself.
8. **Rank**: replies are logged with intent. Fast, interested replies rise to the top and follow-ups stop.
