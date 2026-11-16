#!/usr/bin/env bash
# The macOS checks GitHub runs after building IV Outreach (.github/workflows/mac.yml), on Apple Silicon and Intel.
# Each check's output goes to ci-out/<name>.log; a summary prints at the end and the script fails if any check failed.
# (From IV Studio's scripts/ci-mac.sh.)
set -u
OUT="$PWD/ci-out"
mkdir -p "$OUT"
APP="$(ls -d dist/mac*/IV\ Outreach.app | head -n 1)"
BIN="$APP/Contents/MacOS/IV Outreach"
SCRAPER="$APP/Contents/Resources/vendor/gmaps/google_maps_scraper"
results=()
run() {
  local name="$1"; shift
  echo "::group::$name"
  if "$@" >"$OUT/$name.log" 2>&1; then results+=("ok   $name"); else results+=("FAIL $name"); fi
  tail -n 25 "$OUT/$name.log"
  echo "::endgroup::"
}

# the app bundle: the right architecture and a valid (ad-hoc) signature; the Maps scraper inside is for this chip too
run app-arch bash -c "file '$BIN' | grep -q '$(uname -m)'"
run app-signature codesign --verify --deep --strict "$APP"
run scraper-arch bash -c "file '$SCRAPER' | tee /dev/stderr | grep -q '$( [ "$(uname -m)" = arm64 ] && echo arm64 || echo x86_64 )'"

# the unit tests (core, MCP with Allow cards, mail against local servers, the Mac updater's parts)
run unit-tests npm test

# the packaged app on a throwaway data folder: the bundled scraper runs, its MCP server through the app's own binary in
# Node mode, then the window opens every page with no page errors
(sleep 15; screencapture -x "$OUT/screen.png" 2>/dev/null) &
run packaged-check node scripts/packaged-check.mjs "$OUT/packaged" "--app=$BIN"
# a real Google Maps search through the bundled scraper: Google may show CI machines a check page instead of results,
# so this one is reported but doesn't fail the run
if node scripts/packaged-check.mjs "$OUT/packaged-live" "--app=$BIN" --live >"$OUT/maps-live.log" 2>&1; then
  results+=("info maps-live: $(grep -o '"found": [0-9]*' "$OUT/maps-live.log" | head -n 1)")
else results+=("info maps-live: no result (see maps-live.log)"); fi

# the Mac updater (src/main/macupdates.js), end to end: a copy of the app in a temporary folder finds a 9.9.9 on a
# local feed (this build with its version changed, signed again ad hoc), downloads and checks it, swaps itself and
# opens again. The 9.9.9 copy that opens is stopped afterwards.
mac_update_selftest() {
  local U="$OUT/update" W="${TMPDIR:-/tmp}/iv-outreach-update" ARCH ZIP PORT=8767 SHA SIZE HTTP i v ok=1
  rm -rf "$U" "$W"; mkdir -p "$U/apps" "$U/feed" "$U/new" "$U/data"
  ARCH=$( [ "$(uname -m)" = arm64 ] && echo arm64 || echo x64 )
  ditto "$APP" "$U/apps/IV Outreach.app"
  ditto "$APP" "$U/new/IV Outreach.app"
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString 9.9.9" -c "Set :CFBundleVersion 9.9.9" "$U/new/IV Outreach.app/Contents/Info.plist"
  codesign --force --deep -s - "$U/new/IV Outreach.app"
  ZIP="IV-Outreach-mac-$ARCH.zip"
  (cd "$U/new" && ditto -c -k --keepParent "IV Outreach.app" "$U/feed/$ZIP")
  SHA=$(openssl dgst -sha512 -binary "$U/feed/$ZIP" | base64 | tr -d '\n')
  SIZE=$(stat -f%z "$U/feed/$ZIP")
  printf 'version: 9.9.9\nfiles:\n  - url: %s\n    sha512: %s\n    size: %s\npath: %s\nsha512: %s\nreleaseDate: "2026-01-01T00:00:00.000Z"\n' "$ZIP" "$SHA" "$SIZE" "$ZIP" "$SHA" > "$U/feed/latest-mac.yml"
  cat "$U/feed/latest-mac.yml"
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$U/feed" >"$U/http.log" 2>&1 &
  HTTP=$!
  for i in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/latest-mac.yml" >/dev/null && break; sleep 1; done
  IV_OUTREACH_UPDATE_FEED="http://127.0.0.1:$PORT" IV_OUTREACH_UPDATE_SELFTEST=1 FITSCOUT_DATA_DIR="$U/data" \
    "$U/apps/IV Outreach.app/Contents/MacOS/IV Outreach" >"$U/app.log" 2>&1 &
  for i in $(seq 1 120); do
    v=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$U/apps/IV Outreach.app/Contents/Info.plist" 2>/dev/null)
    if [ "$v" = 9.9.9 ] && pgrep -f "$U/apps/IV Outreach.app/Contents/MacOS/IV Outreach" >/dev/null; then ok=0; break; fi
    sleep 2
  done
  echo "after $i checks: version ${v:-none}"
  cat "$W/update.log" 2>/dev/null
  [ -e "$U/apps/IV Outreach.app.iv-old" ] && { echo "the old copy was left behind"; ok=1; }
  grep -q 'installed$' "$W/update.log" 2>/dev/null || { echo "no 'installed' in the log"; ok=1; }
  grep -q 'opened$' "$W/update.log" 2>/dev/null || { echo "no 'opened' in the log"; ok=1; }
  codesign --verify --deep --strict "$U/apps/IV Outreach.app" || ok=1
  pkill -f "$U/apps/IV Outreach.app/Contents/MacOS/IV Outreach" 2>/dev/null
  kill "$HTTP" 2>/dev/null
  return $ok
}
run mac-update-selftest mac_update_selftest

echo
printf '%s\n' "${results[@]}" | tee "$OUT/summary.txt"
! grep -q '^FAIL' "$OUT/summary.txt"
