# Bundled third-party tools

IV Outreach is open source under the MIT licence (since 2026-11-15). These tools are shipped inside the installer
under `resources/vendor` under their own licences below. Retain their license files when packaging.

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

Growth build npm runtime additions (exact versions pinned in package-lock.json): Lighthouse 13.6.0 and chrome-launcher 1.2.3 (Apache-2.0), Mozilla Readability 0.6.0 (Apache-2.0), linkedom 0.18.15 (ISC), rss-parser 3.13.0 (MIT). Their license files ship with the packaged node modules; preserve dependency notices. Chrome/Edge is discovered on the user's PC, not redistributed. Crawlee and changedetection.io are deferred until their extra crawl/scheduling capabilities are needed; the current implementation uses the existing guarded fetcher and local watch records.
