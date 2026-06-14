#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

CATALOG = Path("data/cars_motornet.json")

PRICE_KEYWORDS = (
    "prezzo",
    "listino",
    "chiavi in mano",
)
BAD_PRICE_KEYWORDS = (
    "cilindrata",
    "kw",
    "cv",
    "co2",
    "emission",
    "consumo",
    "autonomia",
    "batteria",
    "velocità",
    "accelerazione",
)


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_number(value: Any) -> float | None:
    text = clean(value)
    if not text:
        return None
    match = re.search(r"-?\d+(?:[.,]\d+)?(?:[.,]\d+)?", text.replace(" ", ""))
    if not match:
        return None
    raw = match.group(0)
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif "," in raw:
        raw = raw.replace(",", ".")
    elif raw.count(".") == 1:
        before, after = raw.split(".")
        # 6.8, 13.7, 17.2 are decimals. 34.400 is a thousands-style integer.
        if len(after) == 3 and len(before) <= 3:
            raw = before + after
    elif raw.count(".") > 1:
        raw = raw.replace(".", "")
    try:
        return float(raw)
    except ValueError:
        return None


def parse_money(value: Any) -> int | None:
    text = clean(value)
    if not text:
        return None
    match = re.search(r"\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|\d{4,7}(?:,\d+)?", text)
    if not match:
        return None
    raw = match.group(0).replace(" ", "")
    if "," in raw:
        raw = raw.split(",", 1)[0]
    raw = raw.replace(".", "")
    try:
        value_int = int(raw)
    except ValueError:
        return None
    if 5000 <= value_int <= 1000000:
        return value_int
    return None


def specs(car: dict[str, Any]) -> dict[str, Any]:
    raw = car.get("specs_raw")
    return raw if isinstance(raw, dict) else {}


def find_specs_value(car: dict[str, Any], include: tuple[str, ...], exclude: tuple[str, ...] = ()) -> Any | None:
    for key, value in specs(car).items():
        k = clean(key).lower()
        if all(token.lower() in k for token in include) and not any(token.lower() in k for token in exclude):
            return value
    return None


def find_price(car: dict[str, Any]) -> int | None:
    for key, value in specs(car).items():
        k = clean(key).lower()
        if any(bad in k for bad in BAD_PRICE_KEYWORDS):
            continue
        if any(token in k for token in PRICE_KEYWORDS):
            money = parse_money(value)
            if money:
                return money
    return None


def price_equals_non_price_field(car: dict[str, Any], price: int) -> bool:
    for key, value in specs(car).items():
        k = clean(key).lower()
        if not any(token in k for token in BAD_PRICE_KEYWORDS):
            continue
        n = parse_number(value)
        if n is not None and int(round(n)) == price:
            return True
    return False


def fix_consumption(car: dict[str, Any]) -> bool:
    changed = False
    fuel = clean(car.get("fuel")).lower()
    is_electric = "elettr" in fuel

    if is_electric:
        v = (
            find_specs_value(car, ("kw/h", "100"))
            or find_specs_value(car, ("kwh", "100"))
            or find_specs_value(car, ("kwh/100",))
        )
        n = parse_number(v)
        if n is not None and 1 <= n <= 80:
            if car.get("consumption_kwh_100km") != n:
                car["consumption_kwh_100km"] = n
                car["consumption_source"] = "motornet_specs_raw"
                changed = True
    else:
        v = (
            find_specs_value(car, ("consumo", "combinato"), ("co2", "kw/h", "kwh"))
            or find_specs_value(car, ("consumo", "misto"), ("co2", "kw/h", "kwh"))
            or find_specs_value(car, ("consumo",), ("co2", "kw/h", "kwh"))
        )
        n = parse_number(v)
        if n is not None and 0 < n <= 80:
            if "metano" in fuel:
                if car.get("consumption_kg_100km") != n:
                    car["consumption_kg_100km"] = n
                    car.pop("consumption_l_100km", None)
                    changed = True
            else:
                if car.get("consumption_l_100km") != n:
                    car["consumption_l_100km"] = n
                    changed = True
            car["consumption_source"] = "motornet_specs_raw"
    return changed


def fix_price(car: dict[str, Any]) -> bool:
    current = car.get("price_eur")
    current_int = int(current) if isinstance(current, (int, float)) else None
    price = find_price(car)
    if price:
        if current_int != price:
            car["price_eur"] = price
            car["price_source"] = "motornet_specs_raw"
            car.pop("price_missing", None)
            return True
        car["price_source"] = "motornet_specs_raw"
        car.pop("price_missing", None)
        return False

    # No explicit price label: never keep a number that is actually cilindrata/power/CO2/etc.
    if current_int is not None and price_equals_non_price_field(car, current_int):
        car.pop("price_eur", None)
        car["price_missing"] = True
        car["price_source"] = "not_found_in_motornet_specs"
        return True

    # For very low imported prices, be conservative: likely not a real new-car list price.
    if current_int is not None and current_int < 8000:
        car.pop("price_eur", None)
        car["price_missing"] = True
        car["price_source"] = "not_found_in_motornet_specs"
        return True

    return False


def main() -> None:
    if not CATALOG.exists():
        raise SystemExit("data/cars_motornet.json not found")

    data = json.loads(CATALOG.read_text(encoding="utf-8") or "{}")
    cars = data.get("cars") or []
    changed = 0
    missing_prices = 0

    for car in cars:
        if not isinstance(car, dict):
            continue
        if fix_consumption(car):
            changed += 1
        if fix_price(car):
            changed += 1
        if car.get("price_missing"):
            missing_prices += 1

    data["postprocess"] = {
        "version": "motornet_price_consumption_v1",
        "changed_fields": changed,
        "missing_prices": missing_prices,
        "rule": "prices only from explicit Motornet price/listino fields; no global numeric fallback",
    }
    CATALOG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Postprocessed Motornet catalogue: changed={changed}, missing_prices={missing_prices}, cars={len(cars)}")


if __name__ == "__main__":
    main()
