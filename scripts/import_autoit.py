#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, re, time, urllib.parse, urllib.robotparser
from pathlib import Path
import requests
from bs4 import BeautifulSoup

BASE = "https://www.auto.it"
OUT = Path("data/cars_autoit.json")
UA = "ElettricaImporter/1.0 (+https://github.com/fadefa88/elettrica)"

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

def now():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()

def clean(x):
    return re.sub(r"\s+", " ", str(x or "")).strip()

def full_url(u):
    return urllib.parse.urljoin(BASE, u.split("#")[0])

def make_id(url, code):
    return "autoit_" + code.lower() + "_" + hashlib.sha1((code + "|" + url).encode()).hexdigest()[:12]

def parse_price(text):
    for rx in [r"€\s*([\d\.]+)", r"([\d\.]+)\s*€"]:
        m = re.search(rx, text or "", re.I)
        if m:
            try:
                return int(m.group(1).replace(".", ""))
            except ValueError:
                pass
    return None

def specs(text):
    text = clean(text)
    out = {}
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
    for key, rx, cast in patterns:
        m = re.search(rx, text, re.I)
        if m:
            val = float(m.group(1).replace(",", "."))
            out[key] = int(val) if cast is int else round(val, 1)
    if "power_cv" in out and "power_kw" not in out:
        out["power_kw"] = round(out["power_cv"] * 0.7355, 1)
    return out

def walk(o):
    if isinstance(o, dict):
        yield o
        for v in o.values():
            yield from walk(v)
    elif isinstance(o, list):
        for x in o:
            yield from walk(x)

def json_blocks(soup):
    blocks = []
    for s in soup.find_all("script"):
        raw = (s.string or s.get_text(" ")).strip()
        if not raw:
            continue
        if s.get("type") == "application/ld+json" or raw.startswith("{") or raw.startswith("["):
            try:
                blocks.append(json.loads(raw))
            except Exception:
                pass
    return blocks

def discover_links(html):
    soup = BeautifulSoup(html, "html.parser")
    links = []

    for a in soup.find_all("a", href=True):
        url = full_url(a["href"])
        path = urllib.parse.urlparse(url).path

        is_model_page = path.startswith("/marche/") and "/modelli/" in path

        if is_model_page and url not in links:
            links.append(url)

    return links

def first_hrefs(html, limit=20):
    soup = BeautifulSoup(html, "html.parser")
    urls = []
    for a in soup.find_all("a", href=True):
        url = full_url(a["href"])
        if url not in urls:
            urls.append(url)
        if len(urls) >= limit:
            break
    return urls

def script_debug(html, limit=12):
    soup = BeautifulSoup(html, "html.parser")
    scripts = soup.find_all("script")
    rows = []
    parsed_json = 0
    for i, script in enumerate(scripts[:limit], start=1):
        raw = (script.string or script.get_text(" ") or "").strip()
        stype = script.get("type") or "inline/unknown"
        sid = script.get("id") or ""
        looks_json = raw.startswith("{") or raw.startswith("[") or stype == "application/ld+json"
        if looks_json:
            try:
                json.loads(raw)
                parsed_json += 1
            except Exception:
                pass
        rows.append({
            "n": i,
            "type": stype,
            "id": sid,
            "len": len(raw),
            "looks_json": looks_json,
            "head": clean(raw[:120]),
        })
    return len(scripts), parsed_json, rows

def debug_list_page(code, html, links):
    print(f"--- DEBUG LIST PAGE {code} ---")
    print("HTML scaricato: sì")
    print("lunghezza HTML:", len(html))
    print("link dettaglio trovati:", len(links))

    print("prime 20 URL trovate nella pagina:")
    hrefs = first_hrefs(html, 20)
    if not hrefs:
        print("  (nessun href trovato)")
    for i, url in enumerate(hrefs, start=1):
        print(f"  {i:02d}. {url}")

    total_scripts, parsed_json, rows = script_debug(html)
    print("script tag trovati:", total_scripts)
    print("eventuali script JSON parseabili:", parsed_json)
    print("prime info script:")
    if not rows:
        print("  (nessuno script trovato)")
    for row in rows:
        print("  -", row)
    print(f"--- END DEBUG {code} ---")

def parse_detail(html, url, code, label, category):
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
    for block in json_blocks(soup):
        for d in walk(block):
            blob = json.dumps(d, ensure_ascii=False)[:3500]
            if not any(w in blob.lower() for w in ["brand", "model", "price", "prezzo", "kw", "cv"]):
                continue

            b = d.get("brand") or d.get("manufacturer") or d.get("make")
            if isinstance(b, dict):
                b = b.get("name")
            if b and not car["brand"]:
                car["brand"] = clean(b)

            m = d.get("model") or d.get("name")
            if m and car["model"] == title:
                car["model"] = clean(m)

            offers = d.get("offers") if isinstance(d.get("offers"), dict) else {}
            p = d.get("price") or offers.get("price") or offers.get("lowPrice")
            if p and not car.get("price_eur"):
                try:
                    car["price_eur"] = int(float(str(p).replace(",", ".")))
                except Exception:
                    pass

            for k, v in specs(blob).items():
                car.setdefault(k, v)

    for k, v in specs(text).items():
        car.setdefault(k, v)

    if not car.get("price_eur"):
        p = parse_price(text)
        if p:
            car["price_eur"] = p

    if not car["brand"]:
        parts = title.split()
        car["brand"] = parts[0] if parts else ""

    return car if car["brand"] and car["model"] else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=80)
    ap.add_argument("--pages-per-fuel", type=int, default=2)
    ap.add_argument("--delay", type=float, default=4)
    ap.add_argument("--timeout", type=int, default=30)
    args = ap.parse_args()

    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(BASE + "/robots.txt")
    try:
        rp.read()
    except Exception as e:
        print("WARN robots non leggibile:", e)

    session = requests.Session()
    session.headers.update({
        "User-Agent": UA,
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.6",
    })

    cars, errors, seen = [], [], set()

    for code, (label, category, list_url) in SOURCES.items():
        if len(cars) >= args.limit:
            break

        print("LIST", code, list_url)

        if not rp.can_fetch(UA, list_url):
            errors.append({"url": list_url, "error": "blocked_by_robots"})
            print("HTML scaricato: no - blocked_by_robots")
            continue

        try:
            time.sleep(args.delay)
            r = session.get(list_url, timeout=args.timeout)
            print("HTTP status:", r.status_code)
            if r.status_code == 429:
                raise RuntimeError("429 Too Many Requests")
            r.raise_for_status()
        except Exception as e:
            errors.append({"url": list_url, "error": str(e)})
            print("HTML scaricato: no -", str(e))
            continue

        links = discover_links(r.text)
        debug_list_page(code, r.text, links)

        for link in links:
            if len(cars) >= args.limit:
                break
            if link in seen:
                continue
            seen.add(link)

            if not rp.can_fetch(UA, link):
                errors.append({"url": link, "error": "blocked_by_robots"})
                continue

            try:
                time.sleep(args.delay)
                d = session.get(link, timeout=args.timeout)
                if d.status_code == 429:
                    raise RuntimeError("429 Too Many Requests")
                d.raise_for_status()
                car = parse_detail(d.text, link, code, label, category)
                if car:
                    cars.append(car)
            except Exception as e:
                errors.append({"url": link, "error": str(e)})
                if "429" in str(e):
                    break

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "auto.it",
        "status": "ok" if cars else "empty",
        "scraped_at": now(),
        "schema": "cars_autoit_v1",
        "cars": cars,
        "errors": errors[-100:],
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Done cars=", len(cars), "errors=", len(errors), "status=", payload["status"])

if __name__ == "__main__":
    main()
