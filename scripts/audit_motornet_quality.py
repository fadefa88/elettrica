#!/usr/bin/env python3
"""Audit Motornet car catalog data quality and export a curated Excel workbook.

The Excel export is intentionally limited to fields used by the frontend for:
- car selection and display;
- TCO calculations;
- tax/superbollo logic;
- basic traceability back to Motornet.

Large raw/debug fields such as specs_raw are not exported to the workbook, but are
preserved by scripts/motornet_excel_to_json.py when converting back from Excel.
Images are ignored by default in issue generation.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter


EV_CONSUMPTION_KEYS = ["consumption_kwh_100km", "kwh_100km"]
EV_CONSUMPTION_SPEC_KEYS = [
    "kW/h 100 km",
    "kWh 100 km",
    "kWh/100 km",
    "Consumo elettrico combinato",
    "Consumo Elettrico Combinato",
    "Consumo Energia Combinato",
]

BATTERY_KEYS = ["battery_kwh", "battery_capacity_kwh", "battery_usable_kwh"]
BATTERY_SPEC_KEY_PATTERNS = [r"batteria", r"accumulatore", r"capacita.*kwh", r"capacità.*kwh"]

RANGE_KEYS = ["range_wltp_km", "range_km", "autonomy_km"]
RANGE_SPEC_KEYS = [
    "Autonomia Solo Elettrico Combinato",
    "Automonia Solo Elettrico Combinato",
    "Autonomia Solo Elettrico Urbano",
    "Automonia Solo Elettrico Urbano",
    "Autonomia WLTP",
    "Autonomia Combinato",
]

THERMAL_CONSUMPTION_L_KEYS = ["consumption_l_100km", "consumption_l100km"]
THERMAL_CONSUMPTION_KG_KEYS = ["consumption_kg_100km", "consumption_kg100km"]
THERMAL_CONSUMPTION_SPEC_KEYS = ["Consumo Combinato", "Consumo misto (l/100Km)", "Consumo Medio"]
THERMAL_GAS_CONSUMPTION_SPEC_KEYS = ["Consumo Gas Combinato", "Consumo Combinato Gas"]
EMISSIONS_KEYS = ["emissions_g_km", "co2_g_km"]
EMISSIONS_SPEC_KEYS = ["CO2 Combinato", "Emissioni CO2 NEDC", "Emissioni CO2 WLTP", "Emissioni CO2"]

IMAGE_KEYS = [
    "image_url",
    "image_local_path",
    "image_source_url",
    "image",
    "photo_url",
    "photo",
    "thumbnail_url",
    "thumbnail",
    "img_url",
    "img",
]
IMAGE_EMPTY_MARKERS = {"", "-", "null", "none", "n/a", "na", "undefined", "about:blank"}

FUEL_LABELS = {
    "E": "elettrica",
    "EH": "elettrica_idrogeno",
    "B": "benzina",
    "D": "diesel",
    "IB": "ibrida_benzina",
    "ID": "ibrida_diesel",
    "G": "gpl",
    "IG": "ibrida_gpl",
    "M": "metano",
    "IM": "ibrida_metano",
}

DISPLAY_NAME_BATTERY_RE = re.compile(
    r"(?<![\w])(?P<value>\d{1,3}(?:[\.,]\d{1,2})?)\s*kwh(?!\s*/?\s*100)",
    flags=re.I,
)

# Keep this list aligned with scripts/motornet_excel_to_json.py.
EXCEL_COLUMNS = [
    "issues",
    "status",
    "notes",
    "id",
    "category",
    "brand",
    "model",
    "version",
    "powertrain",
    "fuel",
    "year",
    "price_eur",
    "price_source",
    "power_kw",
    "power_cv",
    "consumption_l_100km",
    "consumption_kg_100km",
    "consumption_kwh_100km",
    "battery_kwh",
    "range_wltp_km",
    "emissions_g_km",
    "image_url",
    "source_url",
    "motornet_detail_url",
]


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if math.isfinite(float(value)) and float(value) > 0:
            return float(value)
        return None

    text = clean_text(value)
    if not text:
        return None
    if re.search(r"[A-Za-z]", text) and not re.search(r"\d", text):
        return None

    normalized = text.replace(" ", "")
    if "," in normalized and "." in normalized:
        normalized = normalized.replace(".", "").replace(",", ".")
    else:
        normalized = normalized.replace(",", ".")

    match = re.search(r"-?\d+(?:\.\d+)?", normalized)
    if not match:
        return None
    number = float(match.group(0))
    if not math.isfinite(number) or number <= 0:
        return None
    return number


def excel_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, (str, int, float, bool)):
        return value
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def first_number_from_fields(car: dict[str, Any], keys: Iterable[str]) -> float | None:
    for key in keys:
        value = parse_number(car.get(key))
        if value is not None:
            return value
    return None


def specs_raw(car: dict[str, Any]) -> dict[str, Any]:
    raw = car.get("specs_raw")
    return raw if isinstance(raw, dict) else {}


def iter_spec_entries(value: Any, prefix: str = "") -> Iterable[tuple[str, Any]]:
    if isinstance(value, dict):
        label = value.get("label") or value.get("name") or value.get("key") or value.get("title")
        val = value.get("value") or value.get("val") or value.get("text")
        if label is not None and val is not None:
            yield clean_text(f"{prefix} {label}"), val
        for key, nested in value.items():
            if key in {"label", "name", "key", "title", "value", "val", "text"} and not isinstance(nested, (dict, list)):
                continue
            yield from iter_spec_entries(nested, clean_text(f"{prefix} {key}"))
    elif isinstance(value, list):
        for item in value:
            yield from iter_spec_entries(item, prefix)
    else:
        if prefix:
            yield clean_text(prefix), value


def spec_number_exact(car: dict[str, Any], keys: Iterable[str]) -> float | None:
    normalized = {clean_text(k).lower(): v for k, v in iter_spec_entries(specs_raw(car))}
    for wanted in keys:
        value = parse_number(normalized.get(clean_text(wanted).lower()))
        if value is not None:
            return value
    return None


def spec_number_by_pattern(car: dict[str, Any], patterns: Iterable[str]) -> float | None:
    for key, value in iter_spec_entries(specs_raw(car)):
        key_l = clean_text(key).lower()
        for pattern in patterns:
            if re.search(pattern, key_l, flags=re.I):
                number = parse_number(value)
                if number is not None:
                    return number
    return None


def get_ev_consumption(car: dict[str, Any]) -> float | None:
    return first_number_from_fields(car, EV_CONSUMPTION_KEYS) or spec_number_exact(car, EV_CONSUMPTION_SPEC_KEYS)


def battery_from_display_name(car: dict[str, Any]) -> float | None:
    text = " ".join(
        clean_text(car.get(key))
        for key in ["display_name", "name", "title", "brand", "model", "version", "powertrain"]
    )
    for match in DISPLAY_NAME_BATTERY_RE.finditer(text):
        value = parse_number(match.group("value"))
        if value is not None:
            return value
    return None


def get_battery_kwh(car: dict[str, Any]) -> float | None:
    return (
        first_number_from_fields(car, BATTERY_KEYS)
        or spec_number_by_pattern(car, BATTERY_SPEC_KEY_PATTERNS)
        or battery_from_display_name(car)
    )


def get_range_km(car: dict[str, Any]) -> float | None:
    return first_number_from_fields(car, RANGE_KEYS) or spec_number_exact(car, RANGE_SPEC_KEYS)


def get_thermal_consumption(car: dict[str, Any], fuel: str) -> tuple[float | None, str, str]:
    if "metano" in fuel:
        kg = first_number_from_fields(car, THERMAL_CONSUMPTION_KG_KEYS) or spec_number_exact(car, THERMAL_GAS_CONSUMPTION_SPEC_KEYS)
        return kg, "kg/100 km", "consumption_kg_100km"
    liters = first_number_from_fields(car, THERMAL_CONSUMPTION_L_KEYS) or spec_number_exact(car, THERMAL_CONSUMPTION_SPEC_KEYS)
    return liters, "l/100 km", "consumption_l_100km"


def get_emissions(car: dict[str, Any]) -> float | None:
    return first_number_from_fields(car, EMISSIONS_KEYS) or spec_number_exact(car, EMISSIONS_SPEC_KEYS)


def fuel_of(car: dict[str, Any]) -> str:
    code = clean_text(car.get("fuel_code")).upper()
    if code in FUEL_LABELS:
        return FUEL_LABELS[code]
    return clean_text(car.get("fuel") or car.get("fuel_original")).lower()


def is_electric(car: dict[str, Any]) -> bool:
    category = clean_text(car.get("category")).lower()
    fuel = fuel_of(car)
    code = clean_text(car.get("fuel_code")).upper()
    return category == "electric" or code in {"E", "EH"} or "elettr" in fuel


def image_value(car: dict[str, Any]) -> str:
    for key in IMAGE_KEYS:
        value = car.get(key)
        if isinstance(value, str):
            text = clean_text(value)
            if text and text.lower() not in IMAGE_EMPTY_MARKERS:
                return text
        elif isinstance(value, dict):
            for nested_key in IMAGE_KEYS:
                nested = clean_text(value.get(nested_key) if isinstance(value, dict) else "")
                if nested and nested.lower() not in IMAGE_EMPTY_MARKERS:
                    return nested
    return ""


def has_image(car: dict[str, Any]) -> bool:
    value = image_value(car)
    if not value:
        return False
    lower = value.lower()
    if lower in IMAGE_EMPTY_MARKERS:
        return False
    if lower.startswith(("http://", "https://", "assets/", "images/", "data/", "/")):
        return True
    return bool(re.search(r"\.(?:jpg|jpeg|png|webp|avif)(?:\?|$)", lower))


def add_issue(issues: list[str], metric: str, value: float | None, unit: str, min_value: float, max_value: float) -> None:
    if value is None:
        issues.append(f"missing {metric}")
    elif value < min_value:
        issues.append(f"too low {metric}: {value:g} {unit} < {min_value:g}")
    elif value > max_value:
        issues.append(f"too high {metric}: {value:g} {unit} > {max_value:g}")


def output_category(car: dict[str, Any]) -> str:
    return "electric" if is_electric(car) else "thermal"


def common_row(car: dict[str, Any], issues: list[str]) -> dict[str, Any]:
    return {
        "issues": " | ".join(issues) if issues else "tutto ok",
        "status": "",
        "notes": "",
        "id": clean_text(car.get("id")),
        "category": output_category(car),
        "brand": clean_text(car.get("brand")),
        "model": clean_text(car.get("model")),
        "version": clean_text(car.get("version")),
        "powertrain": clean_text(car.get("powertrain")),
        "fuel": fuel_of(car),
        "year": parse_number(car.get("year")) or "",
        "price_eur": parse_number(car.get("price_eur")) or "",
        "price_source": clean_text(car.get("price_source")),
        "power_kw": parse_number(car.get("power_kw")) or "",
        "power_cv": parse_number(car.get("power_cv")) or "",
        "consumption_l_100km": "",
        "consumption_kg_100km": "",
        "consumption_kwh_100km": "",
        "battery_kwh": "",
        "range_wltp_km": "",
        "emissions_g_km": "",
        "image_url": image_value(car),
        "source_url": clean_text(car.get("source_url")),
        "motornet_detail_url": clean_text(car.get("motornet_detail_url")),
    }


def audit(cars: list[dict[str, Any]], args: argparse.Namespace) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    all_rows: list[dict[str, Any]] = []
    ev_rows: list[dict[str, Any]] = []
    thermal_rows: list[dict[str, Any]] = []
    missing_image_rows: list[dict[str, Any]] = []
    counts = Counter()

    for car in cars:
        if not isinstance(car, dict):
            continue

        base_issues: list[str] = []
        if not clean_text(car.get("id")):
            base_issues.append("missing id")
        if not clean_text(car.get("brand")):
            base_issues.append("missing brand")
        if not clean_text(car.get("model")):
            base_issues.append("missing model")

        if not has_image(car):
            counts["missing_images"] += 1
            if not args.ignore_images:
                missing_image_rows.append(common_row(car, ["missing image"]))

        price = parse_number(car.get("price_eur"))
        power_kw = parse_number(car.get("power_kw"))
        power_cv = parse_number(car.get("power_cv"))

        issues = list(base_issues)
        add_issue(issues, "prezzo", price, "EUR", args.price_min, args.price_max)
        if power_kw is None and power_cv is None:
            issues.append("missing power_kw/power_cv")
        elif power_kw is not None:
            add_issue(issues, "potenza kW", power_kw, "kW", args.power_kw_min, args.power_kw_max)

        if is_electric(car):
            counts["electric_total"] += 1
            consumption = get_ev_consumption(car)
            battery = get_battery_kwh(car)
            wltp_range = get_range_km(car)
            add_issue(issues, "Consumo kWh/100 km", consumption, "kWh/100 km", args.ev_consumption_min, args.ev_consumption_max)
            add_issue(issues, "Batteria kWh", battery, "kWh", args.ev_battery_min, args.ev_battery_max)
            add_issue(issues, "Autonomia WLTP", wltp_range, "km", args.ev_range_min, args.ev_range_max)

            row = common_row(car, issues)
            row.update({
                "consumption_kwh_100km": consumption if consumption is not None else "",
                "battery_kwh": battery if battery is not None else "",
                "range_wltp_km": wltp_range if wltp_range is not None else "",
            })
            all_rows.append(row)
            if issues:
                ev_rows.append(row)
                counts["electric_with_issues"] += 1
        else:
            counts["thermal_total"] += 1
            fuel = fuel_of(car)
            consumption, unit, consumption_field = get_thermal_consumption(car, fuel)
            emissions = get_emissions(car)
            if unit.startswith("kg"):
                add_issue(issues, "consumo termico", consumption, unit, args.thermal_consumption_kg_min, args.thermal_consumption_kg_max)
            else:
                add_issue(issues, "consumo termico", consumption, unit, args.thermal_consumption_l_min, args.thermal_consumption_l_max)
            add_issue(issues, "emissioni CO2", emissions, "g/km", args.emissions_min, args.emissions_max)

            row = common_row(car, issues)
            row.update({
                consumption_field: consumption if consumption is not None else "",
                "emissions_g_km": emissions if emissions is not None else "",
            })
            all_rows.append(row)
            if issues:
                thermal_rows.append(row)
                counts["thermal_with_issues"] += 1

    summary = {
        "total_cars": len(cars),
        "excel_rows": len(all_rows),
        "electric_total": counts["electric_total"],
        "electric_with_issues": counts["electric_with_issues"],
        "thermal_total": counts["thermal_total"],
        "thermal_with_issues": counts["thermal_with_issues"],
        "missing_images": counts["missing_images"],
        "image_issues_ignored": bool(args.ignore_images),
        "excel_columns": EXCEL_COLUMNS,
        "thresholds": {
            "price_eur": [args.price_min, args.price_max],
            "power_kw": [args.power_kw_min, args.power_kw_max],
            "ev_consumption_kwh_100km": [args.ev_consumption_min, args.ev_consumption_max],
            "ev_battery_kwh": [args.ev_battery_min, args.ev_battery_max],
            "ev_range_wltp_km": [args.ev_range_min, args.ev_range_max],
            "thermal_consumption_l_100km": [args.thermal_consumption_l_min, args.thermal_consumption_l_max],
            "thermal_consumption_kg_100km": [args.thermal_consumption_kg_min, args.thermal_consumption_kg_max],
            "thermal_emissions_g_km": [args.emissions_min, args.emissions_max],
        },
    }
    return all_rows, ev_rows, thermal_rows, missing_image_rows, summary


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(EXCEL_COLUMNS)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows({key: row.get(key, "") for key in fieldnames} for row in rows)


def write_excel(path: Path, rows: list[dict[str, Any]], summary: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    ws = wb.active
    ws.title = "catalog"

    columns = list(EXCEL_COLUMNS)
    header_fill = PatternFill("solid", fgColor="1F2937")
    ok_fill = PatternFill("solid", fgColor="DCFCE7")
    issue_fill = PatternFill("solid", fgColor="FEE2E2")
    header_font = Font(color="FFFFFF", bold=True)

    ws.append(columns)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for row in rows:
        ws.append([excel_value(row.get(column, "")) for column in columns])
        fill = ok_fill if clean_text(row.get("issues")).lower() == "tutto ok" else issue_fill
        ws.cell(row=ws.max_row, column=1).fill = fill

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for idx, column in enumerate(columns, start=1):
        letter = get_column_letter(idx)
        width = min(max(len(column) + 3, 12), 42)
        if column in {"issues", "notes", "version", "powertrain", "source_url", "motornet_detail_url", "image_url"}:
            width = 48
        ws.column_dimensions[letter].width = width

    summary_ws = wb.create_sheet("summary")
    summary_ws.append(["metric", "value"])
    for key, value in summary.items():
        summary_ws.append([key, json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value])
    summary_ws.column_dimensions["A"].width = 32
    summary_ws.column_dimensions["B"].width = 100

    wb.save(path)


def write_markdown(path: Path, ev_rows: list[dict[str, Any]], thermal_rows: list[dict[str, Any]], missing_image_rows: list[dict[str, Any]], summary: dict[str, Any], max_preview: int) -> None:
    def preview(rows: list[dict[str, Any]]) -> str:
        if not rows:
            return "Nessuna anomalia trovata.\n"
        lines = []
        for row in rows[:max_preview]:
            name = clean_text(f"{row.get('brand','')} {row.get('model','')} {row.get('version','')}")
            lines.append(f"- **{name}** — {row.get('issues','')} — `{row.get('source_url') or row.get('motornet_detail_url') or ''}`")
        if len(rows) > max_preview:
            lines.append(f"- ... altre {len(rows) - max_preview} righe nel CSV/Excel")
        return "\n".join(lines) + "\n"

    image_section = "Immagini ignorate per richiesta operativa.\n" if summary.get("image_issues_ignored") else preview(missing_image_rows)

    text = f"""# Motornet catalog quality audit

## Sintesi

- Auto totali: {summary['total_cars']}
- Righe Excel generate: {summary['excel_rows']}
- Elettriche totali: {summary['electric_total']}
- Elettriche con anomalie: {summary['electric_with_issues']}
- Termiche totali: {summary['thermal_total']}
- Termiche con anomalie: {summary['thermal_with_issues']}
- Auto senza immagine: {summary['missing_images']}
- Problemi immagine ignorati: {summary['image_issues_ignored']}

## Output principali

- `motornet_catalog_audit.xlsx`: catalogo completo modificabile in Excel, limitato ai campi usati dal sito.
- `all_cars_audit.csv`: stesso contenuto in CSV.
- `ev_quality_issues.csv`: solo elettriche con problemi.
- `thermal_quality_issues.csv`: solo termiche con problemi.

## Colonne Excel esportate

```json
{json.dumps(summary['excel_columns'], indent=2, ensure_ascii=False)}
```

## Soglie usate

```json
{json.dumps(summary['thresholds'], indent=2, ensure_ascii=False)}
```

## Elettriche — anteprima anomalie

{preview(ev_rows)}
## Termiche — anteprima anomalie

{preview(thermal_rows)}
## Immagini

{image_section}
"""
    path.write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Motornet catalog quality and export curated Excel.")
    parser.add_argument("--catalog", default="data/cars_motornet.json", help="Path to cars_motornet.json")
    parser.add_argument("--out-dir", default="reports/motornet-quality", help="Output directory")
    parser.add_argument("--excel", default="motornet_catalog_audit.xlsx", help="Excel filename inside out-dir")
    parser.add_argument("--fail-on-issues", action="store_true", help="Exit with code 2 if issues are found")
    parser.add_argument("--preview", type=int, default=30, help="Rows to preview in Markdown report")
    parser.add_argument("--ignore-images", action=argparse.BooleanOptionalAction, default=True, help="Ignore missing images in issues")

    parser.add_argument("--price-min", type=float, default=1000.0)
    parser.add_argument("--price-max", type=float, default=1000000.0)
    parser.add_argument("--power-kw-min", type=float, default=1.0)
    parser.add_argument("--power-kw-max", type=float, default=1500.0)

    parser.add_argument("--ev-consumption-min", type=float, default=7.0)
    parser.add_argument("--ev-consumption-max", type=float, default=40.0)
    parser.add_argument("--ev-battery-min", type=float, default=5.0)
    parser.add_argument("--ev-battery-max", type=float, default=250.0)
    parser.add_argument("--ev-range-min", type=float, default=30.0)
    parser.add_argument("--ev-range-max", type=float, default=1000.0)

    parser.add_argument("--thermal-consumption-l-min", type=float, default=1.0)
    parser.add_argument("--thermal-consumption-l-max", type=float, default=30.0)
    parser.add_argument("--thermal-consumption-kg-min", type=float, default=1.0)
    parser.add_argument("--thermal-consumption-kg-max", type=float, default=15.0)
    parser.add_argument("--emissions-min", type=float, default=1.0)
    parser.add_argument("--emissions-max", type=float, default=500.0)

    args = parser.parse_args()
    catalog_path = Path(args.catalog)
    if not catalog_path.exists():
        raise SystemExit(f"Catalog not found: {catalog_path}")

    payload = json.loads(catalog_path.read_text(encoding="utf-8"))
    cars = payload.get("cars", []) if isinstance(payload, dict) else []
    if not isinstance(cars, list):
        raise SystemExit("Invalid catalog: expected top-level object with cars[]")

    all_rows, ev_rows, thermal_rows, missing_image_rows, summary = audit(cars, args)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    write_csv(out_dir / "all_cars_audit.csv", all_rows)
    write_csv(out_dir / "ev_quality_issues.csv", ev_rows)
    write_csv(out_dir / "thermal_quality_issues.csv", thermal_rows)
    write_csv(out_dir / "missing_images.csv", [] if args.ignore_images else missing_image_rows)
    write_excel(out_dir / args.excel, all_rows, summary)
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    write_markdown(out_dir / "quality_report.md", ev_rows, thermal_rows, missing_image_rows, summary, args.preview)

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"Reports written to: {out_dir}")
    print(f"Excel written to: {out_dir / args.excel}")

    issue_count = len(ev_rows) + len(thermal_rows)
    if not args.ignore_images:
        issue_count += len(missing_image_rows)
    if args.fail_on_issues and issue_count:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
