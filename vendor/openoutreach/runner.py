"""IV Outreach's bounded launcher for the separately installed OpenOutreach engine.

Only discovery and local export are exposed. The upstream operator hub, data sharing,
newsletter and telemetry paths are disabled before its pipeline is loaded. This is
an application guard for the pinned packages, not an OS-wide network firewall.
"""
from __future__ import annotations

import argparse
import io
import json
import os
from pathlib import Path
import socket
import sys
from importlib.metadata import version
from urllib.parse import urlsplit

PINS = {"openoutreach": "0.1.93", "openoutfind": "0.1.78", "openoutsend": "0.1.72"}
BLOCKED_DOMAINS = ("openoutreach.app", "openoutreach.com", "logfire.dev", "pydantic.dev", "sentry.io", "posthog.com")
_guards_installed = False
_local_only = False


def check_host(host) -> None:
    if isinstance(host, bytes):
        host = host.decode("ascii", errors="ignore")
    name = str(host or "").lower().rstrip(".")
    if _local_only and name:
        raise PermissionError("IV Outreach's local operation cannot access the network")
    if any(name == domain or name.endswith("." + domain) for domain in BLOCKED_DOMAINS):
        raise PermissionError("IV Outreach blocks this upstream or telemetry destination")


def check_url(url) -> None:
    check_host(urlsplit(str(url)).hostname)


def install_network_guards(*, local_only=False) -> None:
    """Stop known upstream destinations before HTTP dispatch, DNS or socket connect."""
    global _guards_installed, _local_only
    _local_only = _local_only or local_only
    if _guards_installed:
        return
    _guards_installed = True
    os.environ.update({
        "HF_HUB_DISABLE_TELEMETRY": "1", "DO_NOT_TRACK": "1",
        "ANONYMIZED_TELEMETRY": "False", "OTEL_SDK_DISABLED": "true",
        "OTEL_TRACES_EXPORTER": "none", "OTEL_METRICS_EXPORTER": "none",
        "OTEL_LOGS_EXPORTER": "none", "LOGFIRE_SEND_TO_LOGFIRE": "false",
        "OPENOUTFIND_NEWSLETTER": "false", "OPENOUTFIND_CONTACTS_API_TOKEN": "",
        "OPENOUTFIND_OPERATOR_EMAIL": "",
    })
    # The finder has no reason to receive the user's mailbox or sender credentials.
    for key in list(os.environ):
        if key.startswith("OUTSEND_") and key != "OUTSEND_HOME":
            os.environ.pop(key, None)

    def network_audit(event, args):
        if event in ("socket.getaddrinfo", "socket.gethostbyname", "socket.gethostbyname_ex"):
            check_host(args[0])
        elif event == "socket.connect" and isinstance(args[1], tuple):
            check_host(args[1][0])
    sys.addaudithook(network_audit)

    # URL guards also apply when a configured HTTP proxy would resolve the target remotely.
    import requests
    original_send = requests.sessions.Session.send

    def requests_send(self, request, **kwargs):
        check_url(request.url)
        return original_send(self, request, **kwargs)
    requests.sessions.Session.send = requests_send

    import httpx
    original_httpx_send = httpx.Client.send
    original_async_send = httpx.AsyncClient.send
    original_httpx_one = httpx.Client._send_single_request
    original_async_one = httpx.AsyncClient._send_single_request

    def httpx_send(self, request, *args, **kwargs):
        check_url(request.url)
        return original_httpx_send(self, request, *args, **kwargs)

    async def httpx_async_send(self, request, *args, **kwargs):
        check_url(request.url)
        return await original_async_send(self, request, *args, **kwargs)

    def httpx_one(self, request):
        check_url(request.url)
        return original_httpx_one(self, request)

    async def httpx_async_one(self, request):
        check_url(request.url)
        return await original_async_one(self, request)
    httpx.Client.send = httpx_send
    httpx.AsyncClient.send = httpx_async_send
    # Redirects pass through the single-request methods without revisiting public send.
    httpx.Client._send_single_request = httpx_one
    httpx.AsyncClient._send_single_request = httpx_async_one

    import urllib.request
    original_open = urllib.request.OpenerDirector.open

    def urllib_open(self, fullurl, *args, **kwargs):
        check_url(fullurl.full_url if isinstance(fullurl, urllib.request.Request) else fullurl)
        return original_open(self, fullurl, *args, **kwargs)
    urllib.request.OpenerDirector.open = urllib_open


def disable_hub() -> None:
    """Disable hub behavior, including callers that otherwise mint a token on demand."""
    from openoutfind.contacts import service

    def nothing(*args, **kwargs):
        return None

    def no_token(*args, **kwargs):
        return ""

    for name in ("resolve", "contribute", "share_profiles", "share_companies", "_send", "_register"):
        if not hasattr(service, name):
            raise RuntimeError("OpenOutreach hub contract changed")
        setattr(service, name, nothing)
    for name in ("token_in_hand", "_register_this_install", "_mint", "_page_token"):
        if not hasattr(service, name):
            raise RuntimeError("OpenOutreach hub contract changed")
        setattr(service, name, no_token)
    service.register_operator = lambda: False
    service.hub_balance = lambda: {"balance": None, "known": False, "disabled": True}
    service._minted_token = ""


def checked_versions() -> dict:
    versions = {name: version(name) for name in PINS}
    if versions != PINS:
        raise RuntimeError("OpenOutreach version differs from the audited runtime; reinstall it from IV Outreach")
    return versions


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="IV Outreach discovery engine", allow_abbrev=False)
    parser.add_argument("--db", type=Path)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("probe", allow_abbrev=False)
    find = commands.add_parser("find", allow_abbrev=False)
    find.add_argument("count", type=int)
    find.add_argument("unit", nargs="?", choices=("emails",), default=None)
    find.add_argument("--json", action="store_true", required=True)
    args = parser.parse_args(argv)
    if args.command == "find":
        if args.db is None or not args.db.is_absolute():
            parser.error("find requires --db with an absolute path")
        if not 0 <= args.count <= 25:
            parser.error("count must be between 0 and 25")
    return args


def configure_engine(database: Path) -> None:
    # A dedicated campaign database prevents the orchestrator reading unrelated stored
    # configuration. We invoke only the finder management command, never its wizard.
    os.environ["OPENOUTREACH_DB"] = str(database)
    os.environ["DJANGO_SETTINGS_MODULE"] = "openoutreach.settings"
    os.environ["OUTSEND_HOME"] = str(database.parent)
    import django
    django.setup()
    from django.conf import settings
    cache = Path(os.environ.get("IV_OUTREACH_CACHE_DIR") or database.parent / "model-cache")
    settings.FASTEMBED_CACHE_DIR = cache
    import onnxruntime
    onnxruntime.disable_telemetry_events()
    disable_hub()
    check_url(os.environ.get("OPENOUTFIND_LLM_API_BASE", ""))
    # Keep the balance/help response useful without the upstream's affiliate redirect.
    from openoutfind.enrichment import bettercontact
    bettercontact.SIGNUP_URL = "https://bettercontact.rocks"


def main(argv=None) -> int:
    args = parse_args(argv)
    install_network_guards(local_only=args.command == "probe" or args.count == 0)
    versions = checked_versions()
    if args.command == "probe":
        # No Django setup, database/schema write, credential check, or remote request.
        import django
        import openoutreach
        import openoutfind
        print(json.dumps({"version": versions["openoutreach"], "finder_version": versions["openoutfind"],
                          "sender_version": versions["openoutsend"], "privacy": "upstream-disabled",
                          "hub": False, "telemetry": False, "sending": False}))
        return 0

    configure_engine(args.db)
    if args.count == 0:
        # Upstream find 0 still verifies a model and reads provider credit balances.
        # Use its actual bootstrap/export functions for a strictly local re-export.
        from openoutfind.core.management.bootstrap import ensure_database
        from openoutfind.core.export import lead_records, write_json_lines
        ensure_database(io.StringIO())
        count = write_json_lines(lead_records(), sys.stdout)
        print(json.dumps({"local_export": True, "exported": count}), file=sys.stderr)
        return 0

    from django.core.management import execute_from_command_line
    command = ["iv-outreach", "find", str(args.count)]
    if args.unit:
        command.append(args.unit)
    command.append("--json")
    execute_from_command_line(command)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        # Provider secrets must never leak through an unexpected traceback.
        print(json.dumps({"error": {"type": "runtime_error", "message":
              f"OpenOutreach could not start ({type(error).__name__}). Check its installation and configuration."}}), file=sys.stderr)
        raise SystemExit(1)
