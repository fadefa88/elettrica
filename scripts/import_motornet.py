#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import subprocess
import time
import urllib.parse
import urllib.robotparser
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

BASE = "https://www.motornet.it"
LIST_URL = f"{BASE}/auto/listini-del-nuovo"
OUT = Path("data/cars_motornet.json")
UA = "ElettricaMotornetImporter/1.0 (+https://github.com/fadefa88/elettrica)"
MODEL_IMAGE_PATH_MARKER = "/img/modelli/auto/"
IMAGE_ALLOWED_HOST = "motornet.it"

# Fallback: the Motornet brand selector often exposes only raw brand codes
# (for example "ABA") instead of full URLs. If automatic discovery returns
# nothing, these codes keep the importer usable.
KNOWN_BRAND_CODES = [
    "ABA", "ALF", "AST", "AUD", "BMW", "BYD", "CAD", "CHE", "CHC", "CIR",
    "CIT", "CUP", "DAC", "DOD", "DR", "DS", "EVO", "FER", "FIA", "FOR",
    "GMC", "HON", "HYU", "INE", "JAG", "JEE", "KIA", "LAN", "LND", "LEX",
    "LOT", "MAS", "MAZ", "MCL", "MER", "MG", "MIL", "MIN", "MIT", "NIS",
    "OPE", "PEU", "POL", "POR", "REN", "ROL", "SEA", "SKO", "SMA", "SUB",
    "SUZ", "TES", "TOY", "VLV", "VLK", "VOL"
]


FUEL_CODE_BY_LABEL = {
    "elettrica": "E",
    "elettrica_idrogeno": "EH",
    "benzina": "B",
    "diesel": "D",
    "ibrida_benzina": "IB",
    "ibrida_diesel": "ID",
    "gpl": "G",
    "ibrida_gpl": "IG",
    "metano": "M",
    "ibrida_metano": "IM",
}

def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()

def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()

def parse_decimal(value: object) -> float | None:
    text = clean(value).replace(".", "").replace(",", ".")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None

def parse_int(value: object) -> int | None:
    number = parse_decimal(value)
    return int(round(number)) if number is not None else None

def parse_price(text: str) -> int | None:
    matches = re.findall(r"(?:€\s*)?(\d{1,3}(?:[\. ]\d{3})+|\d{4,7})\s*(?:€|EUR)?", text or "", re.I)
    candidates = []
    for item in matches:
        try:
            value = int(re.sub(r"\D", "", item))
            if 5000 <= value <= 1000000:
                candidates.append(value)
        except ValueError:
            pass
    return min(candidates) if candidates else None

def full_url(url: str) -> str:
    return urllib.parse.urljoin(BASE, str(url or "").split("#")[0])

def can_fetch(robots: urllib.robotparser.RobotFileParser, url: str) -> bool:
    try:
        return robots.can_fetch(UA, url)
    except Exception:
        return True

def make_id(url: str) -> str:
    return "motornet_" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:14]

def normalise_fuel(raw: str) -> tuple[str, str]:
    text = clean(raw).lower()
    if "idrogen" in text:
        fuel = "elettrica_idrogeno"
    elif "elettr" in text:
        fuel = "elettrica"
    elif "gpl" in text and ("ibrid" in text or "hybrid" in text):
        fuel = "ibrida_gpl"
    elif "metano" in text and ("ibrid" in text or "hybrid" in text):
        fuel = "ibrida_metano"
    elif "diesel" in text and ("ibrid" in text or "hybrid" in text):
        fuel = "ibrida_diesel"
    elif "benzina" in text and ("ibrid" in text or "hybrid" in text):
        fuel = "ibrida_benzina"
    elif "gpl" in text:
        fuel = "gpl"
    elif "metano" in text:
        fuel = "metano"
    elif "diesel" in text or "gasolio" in text:
        fuel = "diesel"
    elif "benzina" in text:
        fuel = "benzina"
    elif "ibrid" in text or "hybrid" in text:
        fuel = "ibrida_benzina"
    else:
        fuel = "benzina"
    return fuel, FUEL_CODE_BY_LABEL.get(fuel, "B")

def category_for_fuel(fuel: str) -> str:
    return "electric" if fuel in {"elettrica", "elettrica_idrogeno"} else "thermal"

def extract_links(page, pattern: str) -> list[str]:
    values = page.evaluate("""
        () => {
          const out = [];

          document.querySelectorAll('a[href], option[value], [data-href], [data-url], [data-value]').forEach(el => {
            ['href', 'value', 'data-href', 'data-url', 'data-value'].forEach(attr => {
              const value = el.getAttribute(attr);
              if (value) out.push(value);
            });
          });

          // Some menus keep brand codes as visible text rather than value attributes.
          document.querySelectorAll('option, li, button, a').forEach(el => {
            const text = (el.innerText || el.textContent || '').trim();
            if (/^[A-Z0-9]{2,4}$/.test(text)) out.push(text);
          });

          // Also inspect rendered HTML for hidden URLs.
          out.push(document.documentElement.innerHTML || '');

          return out;
        }
    """)

    links = []
    rx = re.compile(pattern, re.I)

    for value in values:
        if not value:
            continue

        value = str(value).strip()

        # Raw brand code case: "ABA" => /auto/scheda-modello/ABA
        if re.fullmatch(r"[A-Z0-9]{2,4}", value):
            url = f"{BASE}/auto/scheda-modello/{value}"
            path = urllib.parse.urlparse(url).path
            if rx.search(path) and url not in links:
                links.append(url)
            continue

        # Hidden HTML may contain many URLs.
        for match in re.findall(r"/auto/scheda-modello(?:/modello/\d+/allestimento/[A-Za-z0-9_-]+|/[A-Z0-9]{2,4})", value):
            url = full_url(match)
            path = urllib.parse.urlparse(url).path
            if rx.search(path) and url not in links:
                links.append(url)

        url = full_url(value)
        path = urllib.parse.urlparse(url).path
        if rx.search(path) and url not in links:
            links.append(url)

    return links

def rendered_text(page) -> str:
    try:
        return clean(page.locator("body").inner_text(timeout=5000))
    except Exception:
        return clean(page.content())

def rendered_title(page) -> str:
    data = page.evaluate("""
        () => {
          const h = document.querySelector('h1,h2,h3');
          return { title: document.title || '', heading: h ? h.innerText : '' };
        }
    """)
    return clean(data.get("heading") or data.get("title"))

def table_pairs(page) -> dict[str, str]:
    rows = page.evaluate("""
        () => {
          const rows = [];
          document.querySelectorAll('tr').forEach(tr => {
            const cells = Array.from(tr.children).map(x => (x.innerText || '').trim()).filter(Boolean);
            if (cells.length) rows.push(cells);
          });
          return rows;
        }
    """)
    pairs = {}
    for cells in rows:
        if len(cells) >= 2:
            for i in range(0, len(cells) - 1, 2):
                key = clean(cells[i])
                val = clean(cells[i + 1])
                if key and val and key not in pairs:
                    pairs[key] = val

    if pairs:
        return pairs

    # Fallback per layout a div/griglia.
    nodes = page.evaluate("""
        () => Array.from(document.querySelectorAll('td,th,span,div,p'))
          .map(x => (x.innerText || '').trim())
          .filter(Boolean)
          .slice(0, 2000)
    """)
    compact = []
    for node in nodes:
        node = clean(node)
        if node and len(node) < 90 and (not compact or compact[-1] != node):
            compact.append(node)

    label_words = ["Alimentazione", "kW", "Cv", "CV", "Prezzo", "Consumo", "Autonomia", "CO2", "Emissioni", "Cilindrata", "Cambio", "Batteria"]
    for i, node in enumerate(compact[:-1]):
        if any(word.lower() in node.lower() for word in label_words):
            pairs.setdefault(node, compact[i + 1])
    return pairs

def pair_value(pairs: dict[str, str], *needles: str) -> str | None:
    for key, value in pairs.items():
        key_l = key.lower()
        if all(n.lower() in key_l for n in needles):
            return value
    return None

def parse_kw_cv(value: str | None) -> tuple[float | None, float | None]:
    if not value:
        return None, None
    nums = re.findall(r"\d+(?:[,.]\d+)?", value)
    if not nums:
        return None, None
    first = float(nums[0].replace(",", "."))
    second = float(nums[1].replace(",", ".")) if len(nums) > 1 else None
    return first, second

def extract_image_url(page) -> str | None:
    candidates = page.evaluate("""
        () => {
          const out = [];
          document.querySelectorAll('img').forEach(img => {
            ['src','data-src','data-original','data-lazy'].forEach(a => {
              if (img.getAttribute(a)) out.push(img.getAttribute(a));
            });
            if (img.getAttribute('srcset')) {
              img.getAttribute('srcset').split(',').forEach(p => out.push(p.trim().split(' ')[0]));
            }
          });
          document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]').forEach(m => {
            if (m.getAttribute('content')) out.push(m.getAttribute('content'));
          });
          return out;
        }
    """)
    scored = []
    for candidate in candidates:
        url = full_url(candidate)
        parsed = urllib.parse.urlparse(url)
        path = urllib.parse.unquote(parsed.path).lower()
        host = parsed.netloc.lower()
        if IMAGE_ALLOWED_HOST not in host:
            continue
        if MODEL_IMAGE_PATH_MARKER not in path:
            continue
        if any(x in path for x in ["logo", "marchio", "placeholder", "default", "no-image"]):
            continue
        score = 10
        if path.endswith("_1.jpg") or path.endswith("_1.webp"):
            score += 5
        scored.append((score, url))
    if not scored:
        return None
    scored.sort(reverse=True)
    return scored[0][1]

def image_ext(url: str, content_type: str) -> str:
    ct = (content_type or "").lower().split(";")[0].strip()
    if ct in {"image/jpeg", "image/jpg"}:
        return ".jpg"
    if ct == "image/png":
        return ".png"
    if ct == "image/webp":
        return ".webp"
    suffix = Path(urllib.parse.urlparse(url).path).suffix.lower()
    return ".jpg" if suffix == ".jpeg" else (suffix if suffix in {".jpg", ".png", ".webp"} else ".jpg")

def download_image(session: requests.Session, url: str, car_id: str, image_dir: Path, timeout: int, max_bytes: int) -> dict | None:
    response = session.get(url, timeout=timeout, stream=True, headers={"User-Agent": UA})
    response.raise_for_status()
    ext = image_ext(url, response.headers.get("content-type", ""))
    image_dir.mkdir(parents=True, exist_ok=True)
    local = image_dir / f"{car_id}{ext}"
    size = 0
    with local.open("wb") as handle:
        for chunk in response.iter_content(chunk_size=16384):
            if not chunk:
                continue
            size += len(chunk)
            if size > max_bytes:
                local.unlink(missing_ok=True)
                raise RuntimeError("image_too_large")
            handle.write(chunk)
    return {
        "image_source_url": url,
        "image_source_host": urllib.parse.urlparse(url).netloc.lower(),
        "image_local_path": str(local).replace("\\", "/"),
        "image_bytes": size,
        "image_downloaded_at": now(),
    }

def parse_detail(page, url: str, brand_hint: str | None = None) -> dict | None:
    pairs = table_pairs(page)
    text = rendered_text(page)
    title = rendered_title(page)

    fuel_raw = pair_value(pairs, "Alimentazione") or ""
    fuel, fuel_code = normalise_fuel(fuel_raw)

    kw_raw = pair_value(pairs, "kW")
    cv_raw = pair_value(pairs, "Cv") or pair_value(pairs, "CV")
    power_kw, power_kw_max = parse_kw_cv(kw_raw)
    power_cv, power_cv_max = parse_kw_cv(cv_raw)

    price = parse_price(text)
    consumption_kwh = parse_decimal(pair_value(pairs, "kWh", "100") or pair_value(pairs, "kWh/100"))
    consumption_l = parse_decimal(pair_value(pairs, "Consumo", "Combinato") or pair_value(pairs, "Consumo", "misto"))
    consumption_kg = None
    if fuel in {"metano", "ibrida_metano"}:
        consumption_kg = consumption_l
        consumption_l = None

    range_wltp = parse_int(pair_value(pairs, "Autonomia", "Elettrico", "Combinato") or pair_value(pairs, "Autonomia", "Combinato"))
    emissions = parse_int(pair_value(pairs, "CO2", "Combinato") or pair_value(pairs, "Emissioni", "WLTP") or pair_value(pairs, "Emissioni", "CO2"))
    battery = parse_decimal(pair_value(pairs, "Batteria") or pair_value(pairs, "Capacità", "batteria"))

    brand = clean(brand_hint or "")
    if not brand:
        m = re.search(r"\b([A-Z][A-Za-zÀ-ÿ-]+)\b", title)
        brand = clean(m.group(1)) if m else "Motornet"

    version = clean(title)
    version = re.sub(r"Motornet\.it.*", "", version, flags=re.I).strip()
    version = re.sub(r"Scheda.*", "", version, flags=re.I).strip()
    version = version or clean(pair_value(pairs, "Versione") or pair_value(pairs, "Allestimento") or title)

    model = version
    if brand and model.lower().startswith(brand.lower()):
        model = clean(model[len(brand):])
    model = clean(model) or version or brand

    car_id = make_id(url)
    car = {
        "id": car_id,
        "brand": brand,
        "model": model,
        "version": version,
        "powertrain": version,
        "fuel": fuel,
        "fuel_code": fuel_code,
        "fuel_original": clean(fuel_raw),
        "category": "electric" if fuel in {"elettrica", "elettrica_idrogeno"} else "thermal",
        "source_site": "motornet.it",
        "source_url": url,
        "motornet_detail_url": url,
        "scraped_at": now(),
        "price_source": "motornet_listino_nuovo",
        "consumption_source": "motornet_technical_sheet",
    }

    optional = {
        "price_eur": price,
        "power_kw": power_kw,
        "power_kw_max": power_kw_max,
        "power_cv": power_cv,
        "power_cv_max": power_cv_max,
        "consumption_kwh_100km": consumption_kwh,
        "consumption_l_100km": consumption_l,
        "consumption_kg_100km": consumption_kg,
        "battery_kwh": battery,
        "range_wltp_km": range_wltp,
        "emissions_g_km": emissions,
    }
    for key, value in optional.items():
        if value is not None:
            car[key] = value

    image_url = extract_image_url(page)
    if image_url:
        car["image_source_url"] = image_url
        car["image_source_host"] = urllib.parse.urlparse(image_url).netloc.lower()

    car["specs_raw"] = pairs
    return car if car["brand"] and car["model"] else None

def build_payload(cars, errors, args, requests_count, images_downloaded):
    return {
        "source": "motornet.it",
        "status": "ok" if cars else "empty",
        "scraped_at": now(),
        "schema": "cars_motornet_v1",
        "request_policy": {
            "delay_seconds": args.delay,
            "limit": args.limit,
            "requests_count": requests_count,
            "checkpoint_every": args.checkpoint_every,
            "download_images": args.download_images,
            "image_dir": args.image_dir,
        },
        "image_stats": {"downloaded": images_downloaded},
        "cars": cars,
        "errors": errors[-100:],
    }

def write_payload(payload: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def git_checkpoint(count: int, image_dir: Path) -> None:
    subprocess.run(["git", "config", "user.name", "github-actions"], check=False)
    subprocess.run(["git", "config", "user.email", "github-actions@github.com"], check=False)
    subprocess.run(["git", "add", str(OUT), str(image_dir)], check=False)
    diff = subprocess.run(["git", "diff", "--cached", "--quiet"], check=False)
    if diff.returncode == 0:
        return
    subprocess.run(["git", "commit", "-m", f"Checkpoint Motornet catalogue ({count} cars)"], check=False)
    subprocess.run(["git", "pull", "--rebase", "origin", "main"], check=False)
    subprocess.run(["git", "push"], check=False)

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=650)
    parser.add_argument("--delay", type=float, default=8)
    parser.add_argument("--timeout", type=int, default=45000)
    parser.add_argument("--brand-codes", default="", help="CSV brand codes for test runs, e.g. ABA,ROL")
    parser.add_argument("--checkpoint-every", type=int, default=25)
    parser.add_argument("--checkpoint-commit", default="true")
    parser.add_argument("--download-images", default="true")
    parser.add_argument("--image-dir", default="assets/cars/motornet")
    parser.add_argument("--max-image-mb", type=float, default=6)
    args = parser.parse_args()

    args.checkpoint_commit = str(args.checkpoint_commit).lower() in {"1", "true", "yes", "si", "sì", "on"}
    args.download_images = str(args.download_images).lower() in {"1", "true", "yes", "si", "sì", "on"}
    image_dir = Path(args.image_dir)
    max_image_bytes = int(args.max_image_mb * 1024 * 1024)

    robots = urllib.robotparser.RobotFileParser()
    robots.set_url(f"{BASE}/robots.txt")
    try:
        robots.read()
    except Exception as exc:
        print("WARN robots non leggibile:", exc)

    image_session = requests.Session()
    image_session.headers.update({"User-Agent": UA})

    cars, errors = [], []
    requests_count = images_downloaded = last_checkpoint = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=UA, locale="it-IT")
        page = context.new_page()

        if args.brand_codes.strip():
            brand_urls = [f"{BASE}/auto/scheda-modello/{code.strip().upper()}" for code in args.brand_codes.split(",") if code.strip()]
        else:
            print("LIST", LIST_URL)
            if can_fetch(robots, LIST_URL):
                page.goto(LIST_URL, wait_until="domcontentloaded", timeout=args.timeout)
                page.wait_for_timeout(2500)
                requests_count += 1
                brand_urls = extract_links(page, r"^/auto/scheda-modello/[A-Z0-9]{2,4}$")
                if not brand_urls:
                    print("  automatic brand discovery returned 0 links; using known brand code fallback")
                    brand_urls = [f"{BASE}/auto/scheda-modello/{code}" for code in KNOWN_BRAND_CODES]
            else:
                brand_urls = []
                errors.append({"url": LIST_URL, "error": "blocked_by_robots"})

        print("brand links:", len(brand_urls))
        seen_details = set()

        for brand_url in brand_urls:
            if len(cars) >= args.limit:
                break
            if not can_fetch(robots, brand_url):
                errors.append({"url": brand_url, "error": "blocked_by_robots"})
                continue

            try:
                time.sleep(args.delay)
                print("BRAND", brand_url)
                page.goto(brand_url, wait_until="domcontentloaded", timeout=args.timeout)
                page.wait_for_timeout(2500)
                requests_count += 1
                brand_title = rendered_title(page)
                brand_code = urllib.parse.urlparse(brand_url).path.rstrip("/").split("/")[-1]
                brand_name = clean(re.sub(r".*modelli\s+", "", brand_title, flags=re.I))
                if not brand_name or brand_name.lower() in {"motornet.it", "listino", "listini", "auto"}:
                    brand_name = brand_code
                detail_links = extract_links(page, r"^/auto/scheda-modello/modello/\d+/allestimento/[^/]+$")
                print("  detail links:", len(detail_links))
            except Exception as exc:
                errors.append({"url": brand_url, "error": str(exc)})
                continue

            for detail_url in detail_links:
                if len(cars) >= args.limit:
                    break
                if detail_url in seen_details:
                    continue
                seen_details.add(detail_url)

                if not can_fetch(robots, detail_url):
                    errors.append({"url": detail_url, "error": "blocked_by_robots"})
                    continue

                try:
                    time.sleep(args.delay)
                    page.goto(detail_url, wait_until="domcontentloaded", timeout=args.timeout)
                    try:
                        page.wait_for_selector("text=Scheda tecnica", timeout=8000)
                    except PlaywrightTimeoutError:
                        page.wait_for_timeout(2000)
                    requests_count += 1

                    car = parse_detail(page, detail_url, brand_name)
                    if not car:
                        continue

                    if args.download_images and car.get("image_source_url"):
                        try:
                            time.sleep(max(1, args.delay / 2))
                            image_data = download_image(image_session, car["image_source_url"], car["id"], image_dir, int(args.timeout / 1000), max_image_bytes)
                            if image_data:
                                car.update(image_data)
                                images_downloaded += 1
                        except Exception as exc:
                            car["image_error"] = str(exc)
                            errors.append({"url": car.get("image_source_url"), "error": f"image: {exc}"})

                    cars.append(car)
                    print(f"  + {car.get('brand')} {car.get('model')} [{car.get('fuel')}] price={car.get('price_eur')} kwh100={car.get('consumption_kwh_100km')} l100={car.get('consumption_l_100km')}")

                    if args.checkpoint_commit and args.checkpoint_every > 0 and len(cars) % args.checkpoint_every == 0 and len(cars) != last_checkpoint:
                        write_payload(build_payload(cars, errors, args, requests_count, images_downloaded))
                        git_checkpoint(len(cars), image_dir)
                        last_checkpoint = len(cars)

                except Exception as exc:
                    errors.append({"url": detail_url, "error": str(exc)})

        context.close()
        browser.close()

    payload = build_payload(cars, errors, args, requests_count, images_downloaded)
    write_payload(payload)
    print("Done cars=", len(cars), "errors=", len(errors), "requests=", requests_count, "images_downloaded=", images_downloaded, "status=", payload["status"])

if __name__ == "__main__":
    main()
