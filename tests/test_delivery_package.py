"""
Tests: after payment succeeds, order delivery package includes
login credentials + features + instructions + rules.

Run from repo root:
  python -m unittest tests.test_delivery_package -v
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import email_delivery  # noqa: E402
import server  # noqa: E402


class DeliveryPackageTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = Path(self._tmp.name)

        deals = [
            {
                "id": "test-plan",
                "name": "Test SuperGrok Week",
                "brand": "xAI",
                "category": "AI",
                "monogram": "TG",
                "price": 99.0,
                "original": 299.0,
                "priceBase": "PHP",
                "period": "7 days",
                "duration": "7 days access",
                "delivery": "Instant login",
                "description": "Test plan description",
                "includes": [
                    "SuperGrok model access",
                    "Higher rate limits",
                    "Priority responses",
                ],
                "accountType": "Shared login",
                "validity": "7 days from delivery",
                "howToRedeem": (
                    "1. Open grok.com\n"
                    "2. Sign in with the username and password\n"
                    "3. Do not change the password"
                ),
                "importantNotes": (
                    "Do not change username or password\n"
                    "Personal use only\n"
                    "Breaking rules voids refunds"
                ),
                "finePrint": "Not affiliated with xAI.",
                "active": True,
                "tagline": "Test",
                "badge": "",
                "stock": "In stock",
                "rating": 4.8,
                "reviews": 10,
                "extraDetails": [],
            }
        ]
        inventory = {
            "test-plan": [
                {
                    "code": "buyer@test.com | SecretPass#1",
                    "status": "available",
                    "addedAt": "2026-01-01T00:00:00Z",
                },
                {
                    "code": "spare@test.com | SparePass#2",
                    "status": "available",
                    "addedAt": "2026-01-01T00:00:00Z",
                },
            ]
        }
        settings = {
            "siteName": "SubSaverPH",
            "defaultCurrency": "PHP",
            "supportEmail": "support@subsaverph.com",
        }

        (self.store / "deals.json").write_text(
            json.dumps(deals, indent=2), encoding="utf-8"
        )
        (self.store / "inventory.json").write_text(
            json.dumps(inventory, indent=2), encoding="utf-8"
        )
        (self.store / "settings.json").write_text(
            json.dumps(settings, indent=2), encoding="utf-8"
        )
        (self.store / "orders.json").write_text("[]", encoding="utf-8")
        (self.store / "pending_payments.json").write_text("{}", encoding="utf-8")
        (self.store / "auth.json").write_text(
            json.dumps(
                {
                    "username": "admin",
                    "password_hash": "unused",
                }
            ),
            encoding="utf-8",
        )

        self.patches = [
            mock.patch.object(server, "STORE", self.store),
            mock.patch.object(server, "DEALS_FILE", self.store / "deals.json"),
            mock.patch.object(server, "SETTINGS_FILE", self.store / "settings.json"),
            mock.patch.object(server, "AUTH_FILE", self.store / "auth.json"),
            mock.patch.object(server, "INVENTORY_FILE", self.store / "inventory.json"),
            mock.patch.object(server, "ORDERS_FILE", self.store / "orders.json"),
            # Do not send real email during fulfill
            mock.patch.object(
                server,
                "_email_invoice_for_order",
                side_effect=lambda order: order.update(
                    {"emailSent": False, "emailDetail": "test-skip"}
                )
                or order,
            ),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self._tmp.cleanup()

    def test_fulfill_order_includes_credentials_features_instructions_rules(self):
        order = server.fulfill_order(
            email="customer@example.com",
            name="Test Customer",
            currency="PHP",
            items=[{"id": "test-plan", "qty": 1}],
            payment_mode_name="instant_demo",
            method="demo",
            provider_ref="demo-delivery-test-001",
        )

        self.assertEqual(order["status"], "paid")
        self.assertTrue(order["id"].startswith("PH"))
        self.assertEqual(len(order["items"]), 1)

        item = order["items"][0]
        self.assertEqual(item["name"], "Test SuperGrok Week")

        # Features
        self.assertIn("SuperGrok model access", item["includes"])
        self.assertIn("Higher rate limits", item["includes"])
        self.assertGreaterEqual(len(item["includes"]), 3)

        # Instructions + rules (admin-editable fields)
        self.assertIn("Sign in with the username", item["howToRedeem"])
        self.assertIn("Do not change username", item["importantNotes"])
        self.assertIn("Not affiliated", item["finePrint"])
        self.assertEqual(item["accountType"], "Shared login")
        self.assertEqual(item["validity"], "7 days from delivery")

        # Login credentials reserved from stock
        self.assertTrue(item["credentials"], "expected credentials on order item")
        cred = item["credentials"][0]
        self.assertEqual(cred.get("username"), "buyer@test.com")
        self.assertEqual(cred.get("password"), "SecretPass#1")
        self.assertTrue(any("buyer@test.com" in c for c in item["codes"]))

        # Stock consumed
        inv = server.load_inventory()
        available = [
            c
            for c in inv["test-plan"]
            if c.get("status", "available") == "available"
        ]
        sold = [c for c in inv["test-plan"] if c.get("status") == "sold"]
        self.assertEqual(len(available), 1)
        self.assertEqual(len(sold), 1)

    def test_invoice_email_content_has_delivery_sections(self):
        order = {
            "id": "PHTESTORDER01",
            "email": "customer@example.com",
            "name": "Test Customer",
            "currency": "PHP",
            "method": "demo",
            "paymentMode": "instant_demo",
            "createdAt": "2026-07-19T12:00:00Z",
            "providerRef": "demo-ref-xyz",
            "items": [
                {
                    "name": "Test SuperGrok Week",
                    "brand": "xAI",
                    "category": "AI",
                    "duration": "7 days access",
                    "delivery": "Instant login",
                    "qty": 1,
                    "price": 99.0,
                    "priceBase": "PHP",
                    "description": "Test plan description",
                    "includes": [
                        "SuperGrok model access",
                        "Higher rate limits",
                    ],
                    "accountType": "Shared login",
                    "validity": "7 days from delivery",
                    "howToRedeem": "1. Open grok.com\n2. Sign in",
                    "importantNotes": "Do not change password\nPersonal use only",
                    "finePrint": "Not affiliated with xAI.",
                    "credentials": [
                        {
                            "username": "buyer@test.com",
                            "password": "SecretPass#1",
                            "raw": "buyer@test.com | SecretPass#1",
                            "code": "",
                        }
                    ],
                    "codes": [
                        "Username: buyer@test.com  Password: SecretPass#1"
                    ],
                }
            ],
        }

        subject, text, html = email_delivery.build_invoice_content(order)

        self.assertIn("PHTESTORDER01", subject)
        self.assertIn("login", subject.lower())

        # Plain text package
        self.assertIn("buyer@test.com", text)
        self.assertIn("SecretPass#1", text)
        self.assertIn("Features included", text)
        self.assertIn("SuperGrok model access", text)
        self.assertIn("Instructions (how to use)", text)
        self.assertIn("Open grok.com", text)
        self.assertIn("Rules & important notes", text)
        self.assertIn("Do not change password", text)

        # HTML package
        self.assertIn("buyer@test.com", html)
        self.assertIn("SecretPass#1", html)
        self.assertIn("Features included", html)
        self.assertIn("SuperGrok model access", html)
        self.assertIn("Instructions", html)
        self.assertIn("Open grok.com", html)
        self.assertIn("Rules", html)
        self.assertIn("Do not change password", html)

    def test_fulfill_idempotent_by_provider_ref(self):
        kwargs = dict(
            email="customer@example.com",
            name="Test Customer",
            currency="PHP",
            items=[{"id": "test-plan", "qty": 1}],
            payment_mode_name="instant_demo",
            method="demo",
            provider_ref="demo-idempotent-xyz",
        )
        first = server.fulfill_order(**kwargs)
        second = server.fulfill_order(**kwargs)
        self.assertEqual(first["id"], second["id"])

        inv = server.load_inventory()
        sold = [c for c in inv["test-plan"] if c.get("status") == "sold"]
        # Only one unit consumed despite two fulfill calls
        self.assertEqual(len(sold), 1)

    def test_admin_deal_fields_round_trip_normalize(self):
        deal = server.normalize_deal(
            {
                "name": "Editable Delivery Plan",
                "price": 150,
                "priceBase": "PHP",
                "includes": "Feature A\nFeature B",
                "howToRedeem": "Step one\nStep two",
                "importantNotes": "Rule one\nRule two",
                "accountType": "Private",
                "validity": "30 days",
                "finePrint": "Fine print here",
                "active": True,
            },
            "editable-plan",
        )
        self.assertEqual(deal["includes"], ["Feature A", "Feature B"])
        self.assertEqual(deal["howToRedeem"], "Step one\nStep two")
        self.assertEqual(deal["importantNotes"], "Rule one\nRule two")
        self.assertEqual(deal["accountType"], "Private")
        self.assertEqual(deal["validity"], "30 days")
        self.assertEqual(deal["finePrint"], "Fine print here")


if __name__ == "__main__":
    unittest.main()
