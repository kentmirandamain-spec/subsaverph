"""Tests for SubSaverPH AI chatbot helpers."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import chatbot  # noqa: E402


class ChatbotTests(unittest.TestCase):
    def test_fallback_capcut_rules(self):
        reply = chatbot._fallback_reply("What are CapCut account rules?")
        self.assertIn("log out", reply.lower().replace("logout", "log out"))
        self.assertIn("2", reply)
        self.assertIn("mobile", reply.lower())

    def test_fallback_refund(self):
        reply = chatbot._fallback_reply("Can I get a refund?")
        self.assertIn("refund", reply.lower())
        self.assertIn("Order ID", reply)

    def test_system_prompt_includes_catalog(self):
        deals = [
            {
                "id": "capcut-pro",
                "name": "CapCut Pro",
                "brand": "CapCut",
                "active": True,
                "price": 5.99,
                "priceBase": "USD",
                "duration": "12 months",
                "importantNotes": "Do NOT log out",
                "howToRedeem": "Login on mobile app",
            }
        ]
        prompt = chatbot.system_prompt(deals, {"siteName": "SubSaverPH"})
        self.assertIn("CapCut Pro", prompt)
        self.assertIn("Do NOT log out", prompt)
        self.assertIn("Login on mobile app", prompt)
        self.assertIn("not affiliated", prompt.lower())
        self.assertIn("customer support", prompt.lower())
        self.assertIn("out of scope", prompt.lower())

    def test_call_without_api_key_uses_fallback(self):
        with mock.patch.dict("os.environ", {"XAI_API_KEY": ""}, clear=False):
            # ensure empty
            with mock.patch.object(chatbot, "chat_configured", return_value=False):
                out = chatbot.call_xai_chat(
                    [{"role": "user", "content": "How do refunds work?"}]
                )
        self.assertTrue(out.get("ok"))
        self.assertIn(out.get("provider"), ("free", "assistant", "fallback"))
        self.assertIn("refund", out.get("reply", "").lower())

    def test_offtopic_fallback_refuses(self):
        with mock.patch.object(chatbot, "chat_configured", return_value=False):
            out = chatbot.call_xai_chat(
                [{"role": "user", "content": "Write me a Python sorting algorithm"}]
            )
        self.assertTrue(out.get("ok"))
        reply = out.get("reply", "").lower()
        self.assertTrue("customer" in reply or "store" in reply or "subsaverph" in reply)
        self.assertNotIn("def sort", reply)

    def test_product_catalog_assist(self):
        deals = [
            {
                "id": "supergrok-1m",
                "name": "SuperGrok 1 Month",
                "brand": "xAI",
                "price": 399,
                "priceBase": "PHP",
                "duration": "1 month",
                "active": True,
                "stockLeft": 3,
                "includes": ["SuperGrok access"],
            }
        ]
        reply = chatbot._customer_assist_reply(
            "How much is SuperGrok?",
            deals=deals,
            settings={"supportEmail": "support@subsaverph.com"},
        )
        self.assertIn("SuperGrok", reply)
        self.assertIn("399", reply)


if __name__ == "__main__":
    unittest.main()
