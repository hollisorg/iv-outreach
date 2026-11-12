# Bundled third-party tools

IV Outreach is a closed personal test (not for sale), per Matthew, 2026-11-12. These tools are shipped inside the
installer under `resources/vendor`. Retain license files when packaging.

| Path | What | Source | License | Integrity |
|---|---|---|---|---|
| `gmaps/google_maps_scraper.exe` (not in git, 58.4 MB) | Google Maps / Business Profile scraper, run in fast mode | github.com/gosom/google-maps-scraper release v1.18.2, asset `google_maps_scraper-1.18.2-windows-amd64.exe` | MIT | sha256 `6609e9638ee303b6d419a329f629efcd9ed5d083f86ad6b93f92a21d59c2aca5` (matches GitHub's published digest) |
| `wmn/wmn-data.json` | WhatsMyName site list for username lookup (the data Blackbird uses) | github.com/WebBreacher/WhatsMyName `main` | CC BY-SA 4.0, (C) Micah Hoffman | fetched 2026-11-12 |

To restore the scraper on a fresh checkout, download that exact release asset into `vendor/gmaps/` as
`google_maps_scraper.exe` and check the sha256 above. On first run it downloads its own browser driver.

Version 0.3.0 uses the person's installed agent for public-source research. It neither includes nor launches
OpenOutreach, uv, managed Python or the old provider bridge. `uv/` and `openoutreach/` in the source checkout are
historical v0.2 assets excluded by the explicit package resource allowlist. Existing user-installed runtime files
are left untouched but unused. See `docs/openoutreach-network-audit.md` for the historical audit.

Not included: Blackbird's email enumeration via sign-up/reset endpoints, social-send automation, or Firecrawl.
