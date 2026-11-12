"""Local tests for the pinned runtime launcher. Run with its isolated Python."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "vendor" / "openoutreach" / "runner.py"
spec = importlib.util.spec_from_file_location("iv_outreach_runner", RUNNER)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class PrivacyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="iv-outreach-privacy-")
        runner.install_network_guards()
        runner.checked_versions()
        runner.configure_engine(Path(cls.temp.name) / "private.db")

    @classmethod
    def tearDownClass(cls):
        from django.db import connections
        connections.close_all()
        cls.temp.cleanup()

    def test_every_hub_entry_point_is_inert(self):
        from openoutfind.contacts import service
        with patch("requests.post", side_effect=AssertionError("Unexpected network")), \
             patch("requests.get", side_effect=AssertionError("Unexpected network")):
            self.assertFalse(service.register_operator())
            self.assertEqual(service.token_in_hand(object()), "")
            self.assertIsNone(service.resolve(object()))
            self.assertIsNone(service.contribute(object(), ["example@fictional.test"], "test"))
            self.assertIsNone(service.share_profiles([{"fictional": True}], "US", {}))
            self.assertIsNone(service.share_companies([{"fictional": True}], "US", {}))
            self.assertIsNone(service._register({}, object()))
            self.assertEqual(service._mint({}), "")
            self.assertEqual(service.hub_balance(), {"balance": None, "known": False, "disabled": True})

    def test_blocked_http_and_dns_never_reach_transport(self):
        import requests
        import urllib.request
        for host in ["hub.openoutreach.app", "OPENOUTREACH.APP.", "telemetry.openoutreach.app", "api.logfire.dev"]:
            with self.assertRaises(PermissionError):
                socket.getaddrinfo(host, 443)
            with self.assertRaises(PermissionError):
                requests.get("https://" + host + "/register", timeout=1)
            with self.assertRaises(PermissionError):
                urllib.request.urlopen("https://" + host + "/register", timeout=1)

    def test_httpx_blocks_redirects_but_allows_provider_transport(self):
        import httpx
        seen = []
        def handle(request):
            seen.append(request.url.host)
            return httpx.Response(302, headers={"Location": "https://hub.openoutreach.app/register"})
        with httpx.Client(transport=httpx.MockTransport(handle), follow_redirects=True) as client:
            with self.assertRaises(PermissionError):
                client.get("https://app.bettercontact.rocks/fictional")
        self.assertEqual(seen, ["app.bettercontact.rocks"])

    def test_async_httpx_blocks_upstream_without_transport(self):
        import httpx
        async def exercise():
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: self.fail("Unexpected transport"))) as client:
                with self.assertRaises(PermissionError):
                    await client.get("https://hub.openoutreach.app/register")
        asyncio.run(exercise())

    def test_upstream_api_base_is_rejected_and_telemetry_is_disabled(self):
        with self.assertRaises(PermissionError):
            runner.check_url("https://openoutreach.app/custom-model")
        self.assertEqual(os.environ["HF_HUB_DISABLE_TELEMETRY"], "1")
        self.assertEqual(os.environ["OTEL_SDK_DISABLED"], "true")
        self.assertEqual(os.environ["OPENOUTFIND_NEWSLETTER"], "false")
        self.assertEqual(os.environ["OPENOUTFIND_OPERATOR_EMAIL"], "")

    def test_sender_and_arbitrary_cli_options_are_not_available(self):
        with tempfile.TemporaryDirectory() as folder:
            database = str(Path(folder) / "never-created.db")
            for args in [["send"], ["run", "1"], ["init"], ["find", "26", "--json"],
                         ["find", "1", "--json", "--emails"], ["find", "1", "--json", "--open"],
                         ["find", "1", "--json", "--db", "elsewhere.db"]]:
                result = subprocess.run([sys.executable, str(RUNNER), "--db", database, *args], capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 2, args)
                self.assertFalse(Path(database).exists())

    def test_real_local_export_bootstraps_without_keys_or_network(self):
        with tempfile.TemporaryDirectory() as folder:
            database = Path(folder) / "export.db"
            env = {k: v for k, v in os.environ.items() if not k.startswith(("OPENOUT", "OUTSEND_"))}
            result = subprocess.run([sys.executable, str(RUNNER), "--db", str(database), "find", "0", "--json"], env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "")
            self.assertEqual(json.loads(result.stderr), {"local_export": True, "exported": 0})
            self.assertTrue(database.exists())

    def test_real_search_reports_missing_configuration_without_provider_calls(self):
        with tempfile.TemporaryDirectory() as folder:
            env = {k: v for k, v in os.environ.items() if not k.startswith(("OPENOUT", "OUTSEND_"))}
            result = subprocess.run([sys.executable, str(RUNNER), "--db", str(Path(folder) / "missing.db"), "find", "1", "--json"], env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stdout, "")
            error = json.loads(result.stderr)["error"]
            self.assertEqual(error["type"], "onboarding_incomplete")
            self.assertIn("OPENOUTFIND_BETTERCONTACT_API_KEY", error["message"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
