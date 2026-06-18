#!/usr/bin/env python3
"""Update data/charging.json from public charging tariff pages.

There is no single official national daily feed for public EV charging prices in
Italy. This script therefore uses a conservative approach:
- fetch a small set of public tariff pages from charging operators;
- extract only values clearly expressed as EUR/kWh;
- group values by configured segment (AC, DC, HPC, Tesla);
- update only segments with plausible values;
- keep the file unchanged when no reliable public value is found.

Sources can be overridden with CHARGING_PRICE_SOURCES_JSON, for example:
[
  {"name":"Example","url":"https://example.com/tariffe","segment":"hpc"}
]
"""
from __future__ import annotations

import argparse
import html
import json
import math
import os
import re
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CHARGING_JSON = ROOT / "data" / "charging.json"

DEFAULT_SOURCES = [
    {
        "name": "Enel X Way",
        "url": "https://www.enelxway.com/it/it/servizi/soluzioni-ricarica-pubblica/tariffe",
        "segment": "mixed",
    },
    {
        "name": "Plenitude On the Road",
        "url": "https://www.plenitude.com/it-it/on-the-road/ricarica-pubblica/tariffe",
        "segment": "mixed",
    },
    {
        "name": "A2A e-moving",
        "url": "https://www.a2a.it/casa/mobilita-elettrica",
        "segment": "mixed",
    },
    {
        "name": "IONITY",
        "url": "https://www.ionity.eu/it",
        "segment": "hpc",
    },
    {
        "name": "Tesla Supercharger",
        "url": "https://www.tesla.com/it_it/supercharger",
        "segment": "tesla",
    },
]

SEGMENT_KEYS = {
    "ac": "ac",
    "dc": "dc",
    "hpc": "hpc",
    "tesla": "tesla_supercharger_owner",
    "mixed": "public_mixed",
}

PRICE_PATTERNS = [
    re.compile(r"(?P<value>\d{1,2}[\.,]\d{1,3})\s*(?:€|eur|euro)\s*(?:/|al|per)?\s*kwh", re.I),
    re.compile(r"(?:€|eur|euro)\s*(?P<value>\d{1,2}[\.,]\d{1,3})\s*(?:/|al|per)?\s*kwh", re.I),
    re.compile(r"(?P<value>\d{1,3})\s*(?:cent|centesimi)\s*(?:/|al|per)?\s*kwh", re.I),
]


def clean_text(markup: str) -> str:
    markup = re.sub(r"(?is)<script.*?</script>|<style.*?</style>", " ", markup)
    markup = re.sub(r"(?i)<br\s*/?>|</?(p|div|li|tr|td|th|section|article|h\d)[^>]*>", "\n", markup)
    text = re.sub(r"<[^>]+>", " ", markup)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_price(raw: str, is_cent: bool = False) -> float | None:
    value = raw.replace(".", "").replace(",", ".") if "," in raw and "." in raw else raw.replace(",", ".")
    try:
        price = float(value)
    except ValueError:
        return None
    if is_cent:
        price = price / 100
    if not math.isfinite(price):
        return None
    if 0.15 <= price <= 1.50:
        return round(price, 3)
    return None


def extract_prices(text: str) -> list[float]:
    prices: list[float] = []
    for pattern in PRICE_PATTERNS:
        for match in pattern.finditer(text):
            raw = match.group("value")
            is_cent = "cent" in match.group(0).lower() or "centesimi" in match.group(0).lower()
            price = parse_price(raw, is_cent=is_cent)
            if price is not None:
                prices.append(price)
    out: list[float] = []
    for price in prices:
        if price not in out:
            out.append(price)
    return out


def classify_segment_prices(source: dict[str, str], prices: list[float]) -> dict[str, float]:
    if not prices:
        return {}
    segment = source.get("segment", "mixed")
    values = sorted(prices)

    if segment == "mixed":
        if len(values) >= 3:
            return {
                "ac": values[0],
                "dc": values[len(values) // 2],
                "hpc": values[-1],
                "public_mixed": round(statistics.fmean(values), 3),
            }
        return {"public_mixed": round(statistics.fmean(values), 3)}

    key = SEGMENT_KEYS.get(segment, "public_mixed")
    return {key: round(statistics.median(values), 3)}


def load_sources() -> list[dict[str, str]]:
    raw = os.environ.get("CHARGING_PRICE_SOURCES_JSON", "").strip()
    if not raw:
        return DEFAULT_SOURCES
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid CHARGING_PRICE_SOURCES_JSON: {exc}")
    if not isinstance(parsed, list):
        raise SystemExit("CHARGING_PRICE_SOURCES_JSON must be a list")
    out: list[dict[str, str]] = []
    for item in parsed:
        if isinstance(item, dict) and item.get("url"):
            out.append({
                "name": str(item.get("name") or item.get("url")),
                "url": str(item.get("url")),
                "segment": str(item.get("segment") or "mixed"),
            })
    return out or DEFAULT_SOURCES


def fetch_source(source: dict[str, str]) -> tuple[dict[str, float], dict[str, Any]]:
    url = source["url"]
    name = source.get("name") or url
    try:
        response = requests.get(url, timeout=(8, 25), headers={"User-Agent": "Mozilla/5.0 elettrica-tco"})
        response.raise_for_status()
        text = clean_text(response.text)
        prices = extract_prices(text)
        segment_values = classify_segment_prices(source, prices)
        return segment_values, {
            "name": name,
            "url": url,
            "segment": source.get("segment", "mixed"),
            "status": "ok" if segment_values else "no_kwh_prices_found",
            "prices_found": prices,
            "values_used": segment_values,
        }
    except Exception as exc:
        return {}, {
            "name": name,
            "url": url,
            "segment": source.get("segment", "mixed"),
            "status": "error",
            "error": str(exc),
        }


def load_payload(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "status": "indicative_italy_seed",
            "charging_efficiency": {"home": 0.92, "mixed": 0.90, "public": 0.94},
            "market_average": {
                "home": 0.30,
                "ac": 0.59,
                "dc": 0.72,
                "hpc": 0.85,
                "public_mixed": 0.74,
                "tesla_supercharger_owner": 0.50,
                "tesla_supercharger_non_tesla": 0.62,
            },
        }
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise SystemExit(f"Invalid charging JSON: {path}")
    payload.setdefault("charging_efficiency", {"home": 0.92, "mixed": 0.90, "public": 0.94})
    payload.setdefault("market_average", {})
    return payload


def update_payload(payload: dict[str, Any], sources: list[dict[str, str]]) -> tuple[dict[str, Any], bool]:
    market = dict(payload.get("market_average") or {})
    by_key: dict[str, list[float]] = {}
    source_reports: list[dict[str, Any]] = []

    for source in sources:
        values, report = fetch_source(source)
        source_reports.append(report)
        for key, value in values.items():
            if value and 0.15 <= float(value) <= 1.50:
                by_key.setdefault(key, []).append(float(value))

    updated_values: dict[str, float] = {}
    for key, values in by_key.items():
        if values:
            updated_values[key] = round(statistics.fmean(values), 3)
            market[key] = updated_values[key]

    if not updated_values:
        # Nothing reliable was found. Keep the JSON byte-for-byte stable except for
        # stdout diagnostics, so the workflow does not create useless commits.
        return payload, False

    public_parts = [market.get("ac"), market.get("dc"), market.get("hpc")]
    public_nums = [float(x) for x in public_parts if isinstance(x, (int, float)) and 0.15 <= float(x) <= 1.50]
    if public_nums:
        if len(public_nums) >= 3:
            market["public_mixed"] = round(public_nums[0] * 0.35 + public_nums[1] * 0.40 + public_nums[2] * 0.25, 3)
        else:
            market["public_mixed"] = round(statistics.fmean(public_nums), 3)

    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    payload["status"] = "updated_public_tariff_pages"
    payload["market_average"] = market
    payload["source_reports"] = source_reports
    payload["notes"] = {
        "method": "Average from public tariff pages when explicit EUR/kWh values are found; previous values are kept otherwise.",
        "public_mixed": "Weighted approximation from AC/DC/HPC where available; not an official national price index.",
        "tesla_supercharger_owner": "Tesla prices can vary by station and time; parsed values are best-effort from public pages if available.",
    }
    return payload, True


def main() -> int:
    parser = argparse.ArgumentParser(description="Update public EV charging price estimates.")
    parser.add_argument("--out", default=str(DEFAULT_CHARGING_JSON), help="charging.json path")
    args = parser.parse_args()

    out = Path(args.out)
    payload = load_payload(out)
    sources = load_sources()
    payload, changed = update_payload(payload, sources)
    if changed:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": payload.get("status"),
        "changed": changed,
        "updated_at": payload.get("updated_at"),
        "market_average": payload.get("market_average"),
        "sources_checked": sources,
        "note": "No reliable public EUR/kWh values found; charging.json kept unchanged." if not changed else "charging.json updated from public tariff pages."
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
