#!/usr/bin/env python3
"""Create a Stripe course product, price, promo code, and Payment Link."""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, time
from typing import Any
from zoneinfo import ZoneInfo


API_BASE = "https://api.stripe.com/v1"


def parse_metadata(items: list[str]) -> dict[str, str]:
    metadata: dict[str, str] = {}
    for item in items:
        if "=" not in item:
            raise SystemExit(f"Metadata must be key=value, got: {item}")
        key, value = item.split("=", 1)
        metadata[key] = value
    return metadata


def form_pairs(data: dict[str, Any]) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for key, value in data.items():
        if value is None:
            continue
        if isinstance(value, dict):
            for nested_key, nested_value in value.items():
                pairs.append((f"{key}[{nested_key}]", str(nested_value)))
        else:
            pairs.append((key, str(value)))
    return pairs


def stripe_post(path: str, secret_key: str, data: dict[str, Any]) -> dict[str, Any]:
    encoded = urllib.parse.urlencode(form_pairs(data)).encode("utf-8")
    request = urllib.request.Request(
        f"{API_BASE}{path}",
        data=encoded,
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Stripe API error {exc.code}: {body}") from exc


def expiry_timestamp(expires_at: str, timezone: str) -> int:
    expiry_date = date.fromisoformat(expires_at)
    end_of_day = datetime.combine(expiry_date, time(23, 59, 59), ZoneInfo(timezone))
    return int(end_of_day.timestamp())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True)
    parser.add_argument("--description", default="")
    parser.add_argument("--unit-amount-gbp", type=float, required=True)
    parser.add_argument("--promo-code")
    parser.add_argument("--percent-off", type=float)
    parser.add_argument("--expires-at", help="Promotion code expiry date, YYYY-MM-DD")
    parser.add_argument("--timezone", default="Europe/London")
    parser.add_argument("--metadata", action="append", default=[], help="key=value")
    parser.add_argument("--success-message", default="You're registered. We'll email joining details shortly.")
    args = parser.parse_args()

    secret_key = os.environ.get("STRIPE_SECRET_KEY")
    if not secret_key:
        raise SystemExit("Set STRIPE_SECRET_KEY in the environment. Do not paste it into chat.")

    metadata = parse_metadata(args.metadata)
    unit_amount = int(round(args.unit_amount_gbp * 100))

    product = stripe_post(
        "/products",
        secret_key,
        {
            "name": args.name,
            "description": args.description,
            "metadata": metadata,
        },
    )

    price = stripe_post(
        "/prices",
        secret_key,
        {
            "product": product["id"],
            "currency": "gbp",
            "unit_amount": unit_amount,
            "metadata": metadata,
        },
    )

    coupon = None
    promotion_code = None
    if args.promo_code:
        if args.percent_off is None:
            raise SystemExit("--percent-off is required when --promo-code is used")
        coupon_data: dict[str, Any] = {
            "duration": "once",
            "name": args.promo_code,
            "percent_off": args.percent_off,
            "metadata": metadata,
        }
        if args.expires_at:
            coupon_data["redeem_by"] = expiry_timestamp(args.expires_at, args.timezone)
        coupon = stripe_post("/coupons", secret_key, coupon_data)

        promotion_data: dict[str, Any] = {
            "coupon": coupon["id"],
            "code": args.promo_code,
            "metadata": metadata,
        }
        if args.expires_at:
            promotion_data["expires_at"] = expiry_timestamp(args.expires_at, args.timezone)
        promotion_code = stripe_post("/promotion_codes", secret_key, promotion_data)

    payment_link = stripe_post(
        "/payment_links",
        secret_key,
        {
            "line_items[0][price]": price["id"],
            "line_items[0][quantity]": 1,
            "allow_promotion_codes": "true" if args.promo_code else "false",
            "after_completion[type]": "hosted_confirmation",
            "after_completion[hosted_confirmation][custom_message]": args.success_message,
            "metadata": metadata,
        },
    )

    print(
        json.dumps(
            {
                "mode": "live" if secret_key.startswith("sk_live_") else "test",
                "product": {"id": product["id"], "name": product["name"]},
                "price": {"id": price["id"], "unit_amount": price["unit_amount"], "currency": price["currency"]},
                "coupon": None if coupon is None else {"id": coupon["id"], "percent_off": coupon.get("percent_off")},
                "promotion_code": None
                if promotion_code is None
                else {"id": promotion_code["id"], "code": promotion_code["code"]},
                "payment_link": {"id": payment_link["id"], "url": payment_link["url"]},
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

