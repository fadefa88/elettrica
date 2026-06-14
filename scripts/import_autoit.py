#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import time
import urllib.parse
import urllib.robotparser
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://www.auto.it"
OUT = Path("data/cars_autoit.json")
UA = "ElettricaImporter/1.0 (+https://github.com/fadefa88/elettrica)"
IMAGE_ALLOWED_HOST = "motornet.it"
MODEL_IMAGE_PATH_MARKER = "/img/modelli/auto/"

SOURCES = {
    "E": ("elettrica", "electric", "https://www.auto.it/listino-nuovo/search?fuelType=E&sort=lowestPrice%20desc"),
    "EH": ("elettrica_idrogeno", "electric", "https://www.auto.it/listino-nuovo/search?fuelType=EH&sort=lowestPrice%20desc"),
    "B": ("benzina", "thermal", "https://www.auto.it/listino-nuovo/search?fuelType=B&sort=lowestPrice%20desc"),
    "D": ("diesel", "thermal", "https://www.auto.it/listino-nuovo/search?fuelType=D&sort=lowestPrice%20desc"),
    "IB": ("ibrida_benzina", "thermal", "https://www.auto.it/listino-nuovo/search?fuelType=IB&sort=lowestPrice%20desc"),
    "ID": ("ibrida_diesel", "thermal", "https://www.auto.it/listino-nuovo/search?fuelType=ID&sort=lowestPrice%20desc"),
    "G": ("gpl", "thermal", "https://www.auto.it/listino-nuovo/search?fuelType=G&sort=lowestPrice%20desc"),
    "IG": ("ibrida_gpl", "thermal", "https://www.auto.it/listino-nuovo/search?fuelType=IG&sort=lowestPrice%20desc"),
    "M": ("metano", "thermal", "https://www.auto.it/listino-nuovo/search?fuelType=M&sort=lowestPrice%20desc"),
    "IM": ("ibrida_metano", "thermal", "https://www.auto.it/listino-nuovo/search?fuelType=IM&sort=lowestPrice%20desc"),
}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def full_url(url: str) -> str:
    return urllib.parse.urljoin(BASE, url.split("#")[0])


def make_id(url: str, code: str) -> str:
    raw = f"{code}|{url}".encode("utf-8")
    return "autoit_" + code.lower() + "_" + hashlib.sha1(raw).hexdigest()[:12]


def parse_price(text: str) -> int | None:
    for pattern in [r"€\s*([\d\.]+)", r"([\d\.]+)\s*€"]:
        match = re.search(pattern, text or "", re.I)
        if match:
            try:
                return int(match.group(1).replace(".", ""))
            except ValueError:
                pass
    return None


def specs(text: str) -> dict:
    text = clean(text)
    out: dict[str, float | int] = {}
    patterns = [
        ("power_kw", r"(\d+(?:,\d+)?)\s*kW", float),
        ("power_cv", r"(\d+(?:,\d+)?)\s*CV", int),
        ("consumption_kwh_100km", r"(\d+(?:,\d+)?)\s*kWh\s*/\s*100\s*km", float),
        ("consumption_l_100km", r"(\d+(?:,\d+)?)\s*l\s*/\s*100\s*km", float),
        ("consumption_kg_100km", r"(\d+(?:,\d+)?)\s*kg\s*/\s*100\s*km", float),
        ("battery_kwh", r"(\d+(?:,\d+)?)\s*kWh(?!\s*/)", float),
        ("range_wltp_km", r"(?:autonomia|WLTP|range)[^\d]{0,25}(\d{2,4})\s*km", int),
        ("emissions_g_km", r"(\d{1,3})\s*g\s*/\s*km", int),
    ]
    for key, pattern, cast in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            value = float(match.group(1).replace(",", "."))
            out[key] = int(value) if cast is int else round(value, 1)
    if "power_cv" in out and "power_kw" not in out:
        out["power_kw"] = round(float(out["power_cv"]) * 0.7355, 1)
    return out


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def json_blocks(soup: BeautifulSoup) -> list:
    blocks = []
    for script in soup.find_all("script"):
        raw = (script.string or script.get_text(" ")).strip()
        if not raw:
            continue
        if script.get("type") == "application/ld+json" or raw.startswith("{") or raw.startswith("["):
            try:
                blocks.append(json.loads(raw))
            except Exception:
                pass
    return blocks


def discover_links(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    links: list[str] = []
    for anchor in soup.find_all("a", href=True):
        url = full_url(anchor["href"])
        path = urllib.parse.urlparse(url).path
        is_model_page = path.startswith("/marche/") and "/modelli/" in path
        if is_model_page and url not in links:
            links.append(url)
    return links


def normalize_image_url(url: str) -> str:
    url = str(url or "").replace("\\/", "/").strip()
    url = urllib.parse.unquote(url)
    return full_url(url)


def is_allowed_image_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    return IMAGE_ALLOWED_HOST in parsed.netloc.lower()


def is_model_image_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    path = urllib.parse.unquote(parsed.path).lower()
    return is_allowed_image_url(url) and MODEL_IMAGE_PATH_MARKER in path


def is_rejected_image_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    path = urllib.parse.unquote(parsed.path).lower()
    filename = Path(path).name.lower()
    rejected_markers = [
        "logo",
        "logos",
        "marchio",
        "marchi",
        "brand",
        "placeholder",
        "default",
        "no-image",
        "no_image",
        "spacer",
        "blank",
    ]
    return any(marker in path or marker in filename for marker in rejected_markers)


def candidate_score(url: str) -> int:
    if is_rejected_image_url(url):
        return -100
    if is_model_image_url(url):
        score = 100
        path = urllib.parse.unquote(urllib.parse.urlparse(url).path).lower()
        if path.endswith("_1.jpg") or path.endswith("_1.jpeg") or path.endswith("_1.webp"):
            score += 10
        return score
    return -10


def image_ext_from_url_or_type(url: str, content_type: str) -> str:
    content_type = (content_type or "").lower().split(";")[0].strip()
    if content_type in {"image/jpeg", "image/jpg"}:
        return ".jpg"
    if content_type == "image/png":
        return ".png"
    if content_type == "image/webp":
        return ".webp"
    suffix = Path(urllib.parse.urlparse(url).path).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp"}:
        return ".jpg" if suffix == ".jpeg" else suffix
    return ".jpg"


def collect_image_candidates(soup: BeautifulSoup, html: str) -> list[str]:
    candidates: list[str] = []

    meta_selectors = [
        {"property": "og:image"},
        {"property": "og:image:secure_url"},
        {"name": "twitter:image"},
        {"name": "twitter:image:src"},
    ]
    for selector in meta_selectors:
        tag = soup.find("meta", selector)
        if tag and tag.get("content"):
            candidates.append(str(tag["content"]))

    link = soup.find("link", rel=lambda value: value and "image_src" in value)
    if link and link.get("href"):
        candidates.append(str(link["href"]))

    for img in soup.find_all("img"):
        for attr in ["src", "data-src", "data-original", "data-lazy", "data-url"]:
            if img.get(attr):
                candidates.append(str(img[attr]))
        if img.get("srcset"):
            for part in str(img["srcset"]).split(","):
                src = part.strip().split(" ")[0]
                if src:
                    candidates.append(src)

    regexes = [
        r"https?:\\?/\\?/[^\"'\s<>]+motornet\.it[^\"'\s<>]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\"'\s<>]*)?",
        r"/img/modelli/auto/[^\"'\s<>]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\"'\s<>]*)?",
    ]
    for pattern in regexes:
        candidates.extend(re.findall(pattern, html, re.I))

    unique: list[str] = []
    for candidate in candidates:
        url = normalize_image_url(candidate)
        if url not in unique:
            unique.append(url)
    return unique


def extract_image_url(soup: BeautifulSoup, html: str) -> str | None:
    candidates = collect_image_candidates(soup, html)
    scored = [(candidate_score(url), url) for url in candidates]
    scored = [(score, url) for score, url in scored if score > 0]
    if not scored:
        return None
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1]


def download_image(session: requests.Session, image_url: str, car_id: str, image_dir: Path, timeout: int, max_bytes: int) -> dict | None:
    image_url = normalize_image_url(image_url)
    if not is_model_image_url(image_url) or is_rejected_image_url(image_url):
        return None

    response = session.get(image_url, timeout=timeout, stream=True)
    response.raise_for_status()

    ext = image_ext_from_url_or_type(image_url, response.headers.get("content-type", ""))
    image_dir.mkdir(parents=True, exist_ok=True)
    local_path = image_dir / f"{car_id}{ext}"

    downloaded = 0
    with local_path.open("wb") as handle:
        for chunk in response.iter_content(chunk_size=16384):
            if not chunk:
                continue
            downloaded += len(chunk)
            if downloaded > max_bytes:
                local_path.unlink(missing_ok=True)
                raise RuntimeError("image_too_large")
            handle.write(chunk)

    return {
        "image_source_url": image_url,
        "image_source_host": urllib.parse.urlparse(image_url).netloc.lower(),
        "image_local_path": str(local_path).replace("\\", "/"),
        "image_bytes": downloaded,
        "image_downloaded_at": now(),
    }


def parse_detail(html: str, url: str, code: str, label: str, category: str) -> tuple[dict | None, str | None]:
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    title = clean((soup.find("h1") or soup.find("title") or soup).get_text(" "))
    car = {
        "id": make_id(url, code),
        "brand": "",
        "model": title,
        "version": title,
        "powertrain": title,
        "fuel": label,
        "fuel_code": code,
        "category": category,
        "source_site": "auto.it",
        "source_url": url,
        "scraped_at": now(),
        "price_source": "autoit_listino_nuovo",
    }

    image_url = extract_image_url(soup, html)
    if image_url:
        car["image_source_url"] = image_url
        car["image_source_host"] = urllib.parse.urlparse(image_url).netloc.lower()

    for block in json_blocks(soup):
        for item in walk(block):
            blob = json.dumps(item, ensure_ascii=False)[:3500]
            if not any(word in blob.lower() for word in ["brand", "model", "price", "prezzo", "kw", "cv"]):
                continue
            brand = item.get("brand") or item.get("manufacturer") or item.get("make")
            if isinstance(brand, dict):
                brand = brand.get("name")
            if brand and not car["brand"]:
                car["brand"] = clean(brand)
            model = item.get("model") or item.get("name")
            if model and car["model"] == title:
                car["model"] = clean(model)
            offers = item.get("offers") if isinstance(item.get("offers"), dict) else {}
            price = item.get("price") or offers.get("price") or offers.get("lowPrice")
            if price and not car.get("price_eur"):
                try:
                    car["price_eur"] = int(float(str(price).replace(",", ".")))
                except Exception:
                    pass
            for key, value in specs(blob).items():
                car.setdefault(key, value)

    for key, value in specs(text).items():
        car.setdefault(key, value)

    if not car.get("price_eur"):
        price = parse_price(text)
        if price:
            car["price_eur"] = price

    if not car["brand"]:
        parts = title.split()
        car["brand"] = parts[0] if parts else ""

    return (car if car["brand"] and car["model"] else None), image_url


def str_to_bool(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "y", "si", "sì", "on"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=650)
    parser.add_argument("--pages-per-fuel", type=int, default=1)
    parser.add_argument("--delay", type=float, default=25)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--backoff", type=float, default=120)
    parser.add_argument("--download-images", default="true", help="true/false")
    parser.add_argument("--image-delay", type=float, default=5)
    parser.add_argument("--image-dir", default="assets/cars/autoit")
    parser.add_argument("--max-image-mb", type=float, default=6)
    args = parser.parse_args()

    should_download_images = str_to_bool(args.download_images)
    image_dir = Path(args.image_dir)
    max_image_bytes = int(args.max_image_mb * 1024 * 1024)

    robots = urllib.robotparser.RobotFileParser()
    robots.set_url(BASE + "/robots.txt")
    try:
        robots.read()
    except Exception as exc:
        print("WARN robots non leggibile:", exc)

    session = requests.Session()
    session.headers.update({
        "User-Agent": UA,
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.6",
    })

    cars: list[dict] = []
    errors: list[dict] = []
    seen: set[str] = set()
    requests_count = 0
    images_found = 0
    images_downloaded = 0
    image_errors = 0

    for code, (label, category, list_url) in SOURCES.items():
        if len(cars) >= args.limit:
            break
        print(f"LIST {code} {list_url}")
        if not robots.can_fetch(UA, list_url):
            errors.append({"url": list_url, "error": "blocked_by_robots"})
            print("  blocked_by_robots")
            continue
        try:
            time.sleep(args.delay)
            response = session.get(list_url, timeout=args.timeout)
            requests_count += 1
            if response.status_code == 429:
                print(f"  429 on list, backoff {args.backoff}s")
                time.sleep(args.backoff)
                break
            response.raise_for_status()
        except Exception as exc:
            errors.append({"url": list_url, "error": str(exc)})
            print("  list error:", exc)
            continue
        links = discover_links(response.text)
        print(f"  model links: {len(links)}")
        for link in links:
            if len(cars) >= args.limit:
                break
            if link in seen:
                continue
            seen.add(link)
            if not robots.can_fetch(UA, link):
                errors.append({"url": link, "error": "blocked_by_robots"})
                continue
            try:
                time.sleep(args.delay)
                detail = session.get(link, timeout=args.timeout)
                requests_count += 1
                if detail.status_code == 429:
                    print(f"  429 on detail, backoff {args.backoff}s")
                    time.sleep(args.backoff)
                    break
                detail.raise_for_status()
                car, image_url = parse_detail(detail.text, link, code, label, category)
                if car:
                    if image_url:
                        images_found += 1
                    if should_download_images and image_url:
                        try:
                            time.sleep(args.image_delay)
                            image_data = download_image(
                                session=session,
                                image_url=image_url,
                                car_id=car["id"],
                                image_dir=image_dir,
                                timeout=args.timeout,
                                max_bytes=max_image_bytes,
                            )
                            requests_count += 1
                            if image_data:
                                car.update(image_data)
                                images_downloaded += 1
                        except Exception as image_exc:
                            image_errors += 1
                            car["image_error"] = str(image_exc)
                            errors.append({"url": image_url, "error": f"image: {image_exc}"})
                    cars.append(car)
                    img_status = " image=local" if car.get("image_local_path") else (" image=url" if car.get("image_source_url") else " image=none")
                    print(f"  + {car.get('brand')} {car.get('model')} [{label}] price={car.get('price_eur')}{img_status}")
            except Exception as exc:
                errors.append({"url": link, "error": str(exc)})
                if "429" in str(exc):
                    break

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "auto.it",
        "status": "ok" if cars else "empty",
        "scraped_at": now(),
        "schema": "cars_autoit_v1",
        "request_policy": {
            "delay_seconds": args.delay,
            "backoff_seconds": args.backoff,
            "limit": args.limit,
            "pages_per_fuel": args.pages_per_fuel,
            "requests_count": requests_count,
            "download_images": should_download_images,
            "image_delay_seconds": args.image_delay,
            "image_dir": str(image_dir).replace("\\", "/"),
            "max_image_mb": args.max_image_mb,
            "model_image_path_marker": MODEL_IMAGE_PATH_MARKER,
        },
        "image_stats": {
            "found": images_found,
            "downloaded": images_downloaded,
            "errors": image_errors,
        },
        "cars": cars,
        "errors": errors[-100:],
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "Done cars=", len(cars),
        "errors=", len(errors),
        "requests=", requests_count,
        "images_found=", images_found,
        "images_downloaded=", images_downloaded,
        "status=", payload["status"],
    )


if __name__ == "__main__":
    main()
