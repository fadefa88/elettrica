#!/usr/bin/env python3
"""Audit Motornet car catalog data quality and export a full Excel workbook.

Checks:
- Electric cars: missing/out-of-range consumption kWh/100 km, battery kWh, WLTP range.
- Thermal cars: missing/out-of-range fuel consumption and CO2 emissions.
- Images are ignored by default.

Outputs CSV reports, one full Excel workbook, summary JSON and Markdown.
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
    "image_local_path",
    "image_source_url",
    "image_url",
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

EXCEL_COLUMNS = [
    "issues",
    "row_type",
    "id",
    "brand",
    "model",
    "version",
    "powertrain",
    "fuel",
    "fuel_code",
    "category",
    "price_eur",
    "power_kw",
    "power_cv",
    "consumption_kwh_100km",
    "battery_kwh",
    "range_wltp_km",
    "consumption_value",
    "consumption_unit",
    "emissions_g_km",
    "motornet_model_id",
    "motornet_trim_code",
    "source_url",
    "motornet_detail_url",
    "image_local_path",
    "image_source_url",
    "notes",
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


def spec_number_exact(car: dict[str, Any], keys: Iterable[str]) -> float | None:
    raw = specs_raw(car)
    normalized = {clean_text(k).lower(): v for k, v in raw.items()}
    for wanted in keys:
        value = parse_number(normalized.get(clean_text(wanted).lower()))
        if value is not None:
            return value
    return None


def spec_number_by_pattern(car: dict[str, Any], patterns: Iterable[str]) -> float | None:
    raw = specs_raw(car)
    for key, value in raw.items():
        key_l = clean_text(key).lower()
        for pattern in patterns:
            if re.search(pattern, key_l, flags=re.I):
                number = parse_number(value)
                if number is not None:
                    return number
    return None


def get_ev_consumption(car: dict[str, Any]) -> float | None:
    return first_number_from_fields(car, EV_CONSUMPTION_KEYS) or spec_number_exact(car, EV_CONSUMPTION_SPEC_KEYS)


def display_name(car: dict[str, Any]) -> str:
    brand = clean_text(car.get("brand"))
    model = clean_text(car.get("model"))
    version = clean_text(car.get("version"))
    if version and version.lower() != model.lower() and not version.lower().startswith((brand + " " + model).lower()):
        return clean_text(f"{brand} {model} · {version}")
    return clean_text(f"{brand} {model}")


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


def get_thermal_consumption(car: dict[str, Any], fuel: str) -> tuple[float | None, str]:
    if "metano" in fuel:
        kg = first_number_from_fields(car, THERMAL_CONSUMPTION_KG_KEYS) or spec_number_exact(car, THERMAL_GAS_CONSUMPTION_SPEC_KEYS)
        return kg, "kg/100 km"
    liters = first_number_from_fields(car, THERMAL_CONSUMPTION_L_KEYS) or spec_number_exact(car, THERMAL_CONSUMPTION_SPEC_KEYS)
    return liters, "l/100 km"


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


def motornet_model_id(car: dict[str, Any]) -> str:
    text = " ".join(clean_text(car.get(k)) for k in ["source_url", "motornet_detail_url", "image_source_url", "image_local_path"])
    match = re.search(r"/modello/(\d+)", text)
    return match.group(1) if match else ""


def motornet_trim_code(car: dict[str, Any]) -> str:
    text = " ".join(clean_text(car.get(k)) for k in ["source_url", "motornet_detail_url", "image_source_url", "image_local_path"])
    match = re.search(r"/allestimento/([A-Z0-9]+)", text, flags=re.I)
    return match.group(1).upper() if match else ""


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


def common_row(car: dict[str, Any], issues: list[str]) -> dict[str, Any]:
    return {
        "issues": " | ".join(issues) if issues else "tutto ok",
        "row_type": "electric" if is_electric(car) else "thermal",
        "id": clean_text(car.get("id")),
        "brand": clean_text(car.get("brand")),
        "model": clean_text(car.get("model")),
        "version": clean_text(car.get("version")),
        "powertrain": clean_text(car.get("powertrain")),
        "display_name": display_name(car),
        "fuel": fuel_of(car),
        "fuel_code": clean_text(car.get("fuel_code")),
        "category": clean_text(car.get("category")),
        "price_eur": parse_number(car.get("price_eur")) or "",
        "power_kw": parse_number(car.get("power_kw")) or "",
        "power_cv": parse_number(car.get("power_cv")) or "",
        "motornet_model_id": motornet_model_id(car),
        "motornet_trim_code": motornet_trim_code(car),
        "source_url": clean_text(car.get("motornet_detail_url") or car.get("source_url")),
        "motornet_detail_url": clean_text(car.get("motornet_detail_url")),
        "image_local_path": clean_text(car.get("image_local_path")),
        "image_source_url": clean_text(car.get("image_source_url")),
        "notes": "",
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

        if not has_image(car):
            counts["missing_images"] += 1
            if not args.ignore_images:
                missing_image_rows.append(common_row(car, ["missing image"]))

        if is_electric(car):
            counts["electric_total"] += 1
            consumption = get_ev_consumption(car)
            battery = get_battery_kwh(car)
            wltp_range = get_range_km(car)
            issues: list[str] = []
            add_issue(issues, "Consumo kWh/100 km", consumption, "kWh/100 km", args.ev_consumption_min, args.ev_consumption_max)
            add_issue(issues, "Batteria kWh", battery, "kWh", args.ev_battery_min, args.ev_battery_max)
            add_issue(issues, "Autonomia WLTP", wltp_range, "km", args.ev_range_min, args.ev_range_max)

            row = common_row(car, issues)
            row.update({
                "consumption_kwh_100km": consumption if consumption is not None else "",
                "battery_kwh": battery if battery is not None else "",
                "range_wltp_km": wltp_range if wltp_range is not None else "",
                "consumption_value": "",
                "consumption_unit": "",
                "emissions_g_km": "",
            })
            all_rows.append(row)
            if issues:
                ev_rows.append(row)
                counts["electric_with_issues"] += 1
        else:
            counts["thermal_total"] += 1
            fuel = fuel_of(car)
            consumption, unit = get_thermal_consumption(car, fuel)
            emissions = get_emissions(car)
            issues = []
            if unit.startswith("kg"):
                add_issue(issues, "consumo termico", consumption, unit, args.thermal_consumption_kg_min, args.thermal_consumption_kg_max)
            else:
                add_issue(issues, "consumo termico", consumption, unit, args.thermal_consumption_l_min, args.thermal_consumption_l_max)
            add_issue(issues, "emissioni CO2", emissions, "g/km", args.emissions_min, args.emissions_max)

            row = common_row(car, issues)
            row.update({
                "consumption_kwh_100km": "",
                "battery_kwh": "",
                "range_wltp_km": "",
                "consumption_value": consumption if consumption is not None else "",
                "consumption_unit": unit,
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
        "thresholds": {
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
    fieldnames = sorted({key for row in rows for key in row.keys()})
    if not fieldnames:
        fieldnames = ["issues", "id", "brand", "model", "version", "source_url"]
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_excel(path: Path, rows: list[dict[str, Any]], summary: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    ws = wb.active
    ws.title = "catalog"

    columns = list(EXCEL_COLUMNS)
    extra_columns = sorted({key for row in rows for key in row.keys()} - set(columns))
    columns.extend(extra_columns)

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
        if column in {"issues", "version", "powertrain", "source_url", "motornet_detail_url", "notes"}:
            width = 48
        ws.column_dimensions[letter].width = width

    summary_ws = wb.create_sheet("summary")
    summary_ws.append(["metric", "value"])
    for key, value in summary.items():
        summary_ws.append([key, json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value])
    summary_ws.column_dimensions["A"].width = 32
    summary_ws.column_dimensions["B"].width = 80

    wb.save(path)


def write_markdown(path: Path, ev_rows: list[dict[str, Any]], thermal_rows: list[dict[str, Any]], missing_image_rows: list[dict[str, Any]], summary: dict[str, Any], max_preview: int) -> None:
    def preview(rows: list[dict[str, Any]]) -> str:
        if not rows:
            return "Nessuna anomalia trovata.\n"
        lines = []
        for row in rows[:max_preview]:
            lines.append(f"- **{row.get('display_name','')}** — {row.get('issues','')} — `{row.get('source_url','')}`")
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

- `motornet_catalog_audit.xlsx`: catalogo completo modificabile in Excel.
- `all_cars_audit.csv`: stesso contenuto in CSV.
- `ev_quality_issues.csv`: solo elettriche con problemi.
- `thermal_quality_issues.csv`: solo termiche con problemi.

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
    parser = argparse.ArgumentParser(description="Audit Motornet catalog quality and export Excel.")
    parser.add_argument("--catalog", default="data/cars_motornet.json", help="Path to cars_motornet.json")
    parser.add_argument("--out-dir", default="reports/motornet-quality", help="Output directory")
    parser.add_argument("--excel", default="motornet_catalog_audit.xlsx", help="Excel filename inside out-dir")
    parser.add_argument("--fail-on-issues", action="store_true", help="Exit with code 2 if issues are found")
    parser.add_argument("--preview", type=int, default=30, help="Rows to preview in Markdown report")
    parser.add_argument("--ignore-images", action=argparse.BooleanOptionalAction, default=True, help="Ignore missing images in issues")

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
