# Bundled third-party tools

Fitscout is a closed personal test (not distributed or sold), per Matthew, 2026-11-12. Both items were downloaded with
his explicit OK and are shipped inside the installer under `resources/vendor`.

| Path | What | Source | License | Integrity |
|---|---|---|---|---|
| `gmaps/google_maps_scraper.exe` (not in git, 58.4 MB) | Google Maps / Business Profile scraper, run in fast mode | github.com/gosom/google-maps-scraper release v1.18.2, asset `google_maps_scraper-1.18.2-windows-amd64.exe` | MIT | sha256 `6609e9638ee303b6d419a329f629efcd9ed5d083f86ad6b93f92a21d59c2aca5` (matches GitHub's published digest) |
| `wmn/wmn-data.json` | WhatsMyName site list for username lookup (the data Blackbird uses) | github.com/WebBreacher/WhatsMyName `main` | CC BY-SA 4.0, (C) Micah Hoffman | fetched 2026-11-12 |

To restore the scraper on a fresh checkout, download that exact release asset into `vendor/gmaps/` as
`google_maps_scraper.exe` and check the sha256 above. On first run it downloads its own browser driver.

Not included, by decision: OpenOutreach (LinkedIn bot automation with stealth plugins), Blackbird's email
enumeration (probes other sites' sign-up/reset endpoints), Firecrawl (skipped for now; AGPL, needs Docker or an API key).
