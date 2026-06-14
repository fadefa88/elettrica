#!/usr/bin/env python3
"""Fetch reusable car images from Wikimedia Commons.

The script reads the local car catalogues, searches Wikimedia Commons for each
brand/model, downloads the first image with a reusable licence, and writes:
- assets/cars/<car-id>.<ext>
- data/car_images.json

It deliberately avoids Google Images because Google is not a licence source.
The script is intentionally slow and resumable to avoid Wikimedia rate limits.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ASSET_DIR = ROOT / "assets" / "cars"
OUT_JSON = DATA_DIR / "car_images.json"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "ElettricaCarImageFetcher/1.1 (static educational site; GitHub repo fadefa88/elettrica)"

CATALOGUE_FILES = [
    "cars_ev.json",
    "cars_ev_2.json",
    "cars_ev_3.json",
    "cars_ev_4.json",
    "cars_ev_5.json",
    "cars_ev_6.json",
    "cars_ev_7.json",
    "cars_ev_8.json",
    "ice_cars_seed.json",
    "ice_cars_2.json",
    "ice_cars_diesel.json",
    "ice_cars_more_petrol_gpl_methane.json",
    "ice_cars_more_petrol_gpl_methane_2.json",
]

ALLOWED_LICENSE_HINTS = (
    "cc-by",
    "cc by",
    "cc-by-sa",
    "cc by-sa",
    "cc0",
    "public domain",
    "pd-",
)
BAD_TITLE_HINTS = (
    "logo",
    "badge",
    "emblem",
    "interior",
    "wheel",
    "engine",
    "brochure",
    "showroom sign",
    "crash",
    "police",
    "ambulance",
)

class RateLimitHit(Exception):
    pass


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "car"


def read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def save_state(images: Dict[str, Any], misses: Dict[str, Any], rate_limited: bool = False) -> None:
    write_json(OUT_JSON, {
        "updated_at": time.strftime("%Y-%m-%d"),
        "source_policy": "Downloaded from Wikimedia Commons only when reusable licence metadata is available. Google Images is not used as a licence source.",
        "rate_limited": rate_limited,
        "images": images,
        "misses": misses,
    })


def load_cars() -> List[Dict[str, Any]]:
    cars: List[Dict[str, Any]] = []
    seen = set()
    for filename in CATALOGUE_FILES:
        payload = read_json(DATA_DIR / filename)
        for car in payload.get("cars", []):
            car_id = car.get("id")
            if not car_id or car_id in seen:
                continue
            seen.add(car_id)
            cars.append(car)
    return cars


def request_json(url: str, attempts: int = 4, base_wait: float = 12.0) -> Dict[str, Any]:
    last_exc: Optional[Exception] = None
    for attempt in range(attempts):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code == 429:
                retry_after = exc.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else base_wait * (attempt + 1)
                print(f"WARN Wikimedia rate limit 429. Sleeping {wait:.0f}s before retry {attempt + 1}/{attempts}.")
                time.sleep(wait)
                continue
            raise
        except Exception as exc:
            last_exc = exc
            time.sleep(3 * (attempt + 1))
    if isinstance(last_exc, urllib.error.HTTPError) and last_exc.code == 429:
        raise RateLimitHit("Wikimedia Commons rate limit persisted after retries") from last_exc
    if last_exc:
        raise last_exc
    raise RuntimeError("request failed")


def text_meta(meta: Dict[str, Any], key: str) -> str:
    value = meta.get(key, {})
    if isinstance(value, dict):
        return str(value.get("value", ""))
    return str(value or "")


def clean_html(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value or "").strip()


def licence_allowed(info: Dict[str, Any]) -> bool:
    meta = info.get("extmetadata", {}) or {}
    bits = " ".join([
        text_meta(meta, "LicenseShortName"),
        text_meta(meta, "UsageTerms"),
        text_meta(meta, "LicenseUrl"),
        text_meta(meta, "AttributionRequired"),
        text_meta(meta, "Restrictions"),
    ]).lower()
    if "non-free" in bits or "fair use" in bits or "all rights reserved" in bits:
        return False
    return any(hint in bits for hint in ALLOWED_LICENSE_HINTS)


def bad_title(title: str) -> bool:
    lower = title.lower()
    return any(hint in lower for hint in BAD_TITLE_HINTS)


def simplify_model(model: str) -> str:
    model = re.sub(r"\b(tce|puretech|bluehdi|tdi|tfsi|gdi|mpi|ecoboost|hybrid|mild|e-tech|e-power|plug-in|gpl|metano|diesel|benzina)\b", "", model, flags=re.I)
    model = re.sub(r"\b\d+(\.\d+)?\b", "", model)
    model = re.sub(r"\s+", " ", model).strip()
    return model


def query_candidates(car: Dict[str, Any], max_queries: int) -> List[str]:
    brand = str(car.get("brand", "")).strip()
    model = str(car.get("model", "")).strip()
    simplified = simplify_model(model)
    queries = []
    if brand and model:
        queries.append(f'{brand} {model}')
    if brand and simplified and simplified.lower() != model.lower():
        queries.append(f'{brand} {simplified}')
    if brand and simplified:
        queries.append(f'{brand} {simplified} car')
    # Preserve order and uniqueness.
    out: List[str] = []
    for q in queries:
        q = re.sub(r"\s+", " ", q).strip()
        if q and q not in out:
            out.append(q)
    return out[:max_queries]


def search_commons(car: Dict[str, Any], result_limit: int, query_limit: int, delay: float) -> Optional[Dict[str, Any]]:
    brand = str(car.get("brand", "")).strip()
    model = str(car.get("model", "")).strip()
    if not brand or not model:
        return None
    for query in query_candidates(car, query_limit):
        params = {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": "6",
            "gsrlimit": str(result_limit),
            "prop": "imageinfo",
            "iiprop": "url|mime|size|extmetadata",
            "iiurlwidth": "1000",
        }
        url = COMMONS_API + "?" + urllib.parse.urlencode(params)
        try:
            data = request_json(url)
        except RateLimitHit:
            raise
        except Exception as exc:
            print(f"WARN search failed for {brand} {model}: {exc}")
            time.sleep(delay)
            continue
        pages = data.get("query", {}).get("pages", {}) or {}
        for page in pages.values():
            title = page.get("title", "")
            if bad_title(title):
                continue
            imageinfo = (page.get("imageinfo") or [{}])[0]
            mime = imageinfo.get("mime", "")
            if mime not in {"image/jpeg", "image/png", "image/webp"}:
                continue
            width = int(imageinfo.get("width") or 0)
            height = int(imageinfo.get("height") or 0)
            if width < 500 or height < 250:
                continue
            if not licence_allowed(imageinfo):
                continue
            return {"page": page, "imageinfo": imageinfo, "query": query}
        time.sleep(delay)
    return None


def file_ext(mime: str) -> str:
    return {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(mime, ".jpg")


def download(url: str, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=90) as resp:
        out.write_bytes(resp.read())


def build_record(car: Dict[str, Any], found: Dict[str, Any], out_path: Path) -> Dict[str, Any]:
    page = found["page"]
    info = found["imageinfo"]
    meta = info.get("extmetadata", {}) or {}
    title = page.get("title", "")
    commons_url = "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"), safe="/:_")
    return {
        "src": str(out_path.relative_to(ROOT)).replace(os.sep, "/"),
        "source": "Wikimedia Commons",
        "source_url": commons_url,
        "file_title": title,
        "author": clean_html(text_meta(meta, "Artist")) or "Wikimedia Commons contributor",
        "license": clean_html(text_meta(meta, "LicenseShortName")) or clean_html(text_meta(meta, "UsageTerms")),
        "license_url": text_meta(meta, "LicenseUrl"),
        "search_query": found.get("query", ""),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=20, help="Maximum number of cars to process")
    parser.add_argument("--refresh", action="store_true", help="Re-download even if an image already exists")
    parser.add_argument("--delay", type=float, default=4.0, help="Delay between Wikimedia search calls")
    parser.add_argument("--query-limit", type=int, default=1, help="Maximum Commons search queries per car")
    parser.add_argument("--result-limit", type=int, default=8, help="Maximum Commons image results per query")
    parser.add_argument("--retry-misses", action="store_true", help="Retry cars previously marked as having no image")
    args = parser.parse_args()

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    existing = read_json(OUT_JSON)
    images: Dict[str, Any] = existing.get("images", {}) if isinstance(existing.get("images"), dict) else {}
    misses: Dict[str, Any] = existing.get("misses", {}) if isinstance(existing.get("misses"), dict) else {}
    cars = load_cars()[: args.limit]

    matched = 0
    skipped = 0
    no_image = 0
    for car in cars:
        car_id = car.get("id")
        if not car_id:
            continue
        if car_id in images and not args.refresh and (ROOT / images[car_id].get("src", "")).exists():
            skipped += 1
            continue
        if car_id in misses and not args.retry_misses and not args.refresh:
            skipped += 1
            continue
        print(f"Searching image for {car.get('brand')} {car.get('model')}...")
        try:
            found = search_commons(car, result_limit=args.result_limit, query_limit=args.query_limit, delay=args.delay)
        except RateLimitHit as exc:
            print(f"RATE LIMITED: {exc}. Saving partial state and stopping cleanly.")
            save_state(images, misses, rate_limited=True)
            return 0
        if not found:
            misses[str(car_id)] = {
                "brand": car.get("brand"),
                "model": car.get("model"),
                "checked_at": time.strftime("%Y-%m-%d"),
                "reason": "no reusable Commons image found with current query policy",
            }
            no_image += 1
            print("  no reusable Commons image found")
            save_state(images, misses)
            time.sleep(args.delay)
            continue
        info = found["imageinfo"]
        url = info.get("thumburl") or info.get("url")
        if not url:
            continue
        out = ASSET_DIR / (slugify(str(car_id)) + file_ext(info.get("mime", "image/jpeg")))
        try:
            download(url, out)
        except Exception as exc:
            print(f"  download failed: {exc}")
            time.sleep(args.delay)
            continue
        images[str(car_id)] = build_record(car, found, out)
        misses.pop(str(car_id), None)
        matched += 1
        print(f"  saved {out.relative_to(ROOT)}")
        save_state(images, misses)
        time.sleep(args.delay)

    save_state(images, misses)
    print(f"Done. matched={matched} skipped={skipped} no_image={no_image} total_images={len(images)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
