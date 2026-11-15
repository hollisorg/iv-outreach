# Hydrodesk outreach review and adaptation

Reviewed a local snapshot of Hydrodesk, an earlier Hollis sales tool, read-only.
This is the October deployment snapshot, not proof that current Hydrodesk production has identical code. No Hydrodesk production code, data, settings, API keys, or integrations were changed.

Useful source workflows:

- `_run_business_scan` (line 5603): category and city scan, contact normalization, duplicate filtering, partial counts; Google Places and OSM branches.
- Saved scans and scan history (lines 5965–6017): reusable search parameters and a record of previous runs.
- `_build_market_intel` (line 557): contextual research prompts. Its numeric urgency/confidence heuristics and water-treatment pitches do not transfer reliably to AI services.
- Residential and neighborhood scanners are separate tools. They were not imported into this business-focused product.

IV Outreach 0.4 adapts the business scan workflow: 12 categories including home services, cleaning, water treatment, hotels, dental, salons and professional services; up to three categories per run, 1–20 listings each, sequential execution, reusable local searches, overlap protection, deduplication through the existing lead importer, partial-failure history, and a button to ask the person's agent to verify website and ICP fit. Available directly in Leads → Business scanner, and through three MCP tools. No paid API or Premium account is needed.

Implementation uses IV Outreach's existing bundled Maps tool, not Hydrodesk's paid Google Places requests. No upstream Hydrodesk files or new Python runtime are bundled. The public OSM fallback was not added as a production backend: [Overpass's guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) recommends operating an instance for applications relying on it as their backend. Existing Maps city lookup uses Nominatim; before a broad public release its application-wide throttling, caching, attribution, and switchable endpoint need attention under the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/). Small local tests are distinct from a public launch.

No automated urgency score, homeowner search, contact enumeration, sending automation, paid Google Places, or Brave key was copied. Existing IV evidence records keep observations, opportunities and unknowns distinct. Scan results are candidates, not verified buyers.
