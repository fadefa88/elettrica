#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import time
import urllib.robotparser
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

import import_motornet as base

EXTRA_BRAND_CODES = ["ALN", "ALP", "BEN", "BES", "CAT", "CHA"]


def bool_arg(value: object) -> bool:
    return str(value).lower() in {"1", "true", "yes", "si", "sì", "on"}


def extended_brand_codes() -> list[str]:
    out: list[str] = []
    for code in list(base.KNOWN_BRAND_CODES) + EXTRA_BRAND_CODES:
        code = str(code).strip().upper()
        if code and code not in out:
            out.append(code)
    return out


def canonical_url(value: object) -> str:
    text = base.clean(value)
    return base.full_url(text) if text else ""


def load_existing_catalog() -> tuple[list[dict], list[dict], set[str], set[str]]:
    if not base.OUT.exists():
        return [], [], set(), set()

    try:
        payload = json.loads(base.OUT.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"WARN existing catalog not readable, starting from empty: {exc}")
        return [], [], set(), set()

    cars = payload.get("cars") or []
    errors = payload.get("errors") or []
    if not isinstance(cars, list):
        cars = []
    if not isinstance(errors, list):
        errors = []

    seen_urls: set[str] = set()
    seen_ids: set[str] = set()
    clean_cars: list[dict] = []

    for car in cars:
        if not isinstance(car, dict):
            continue
        clean_cars.append(car)
        if car.get("id"):
            seen_ids.add(str(car["id"]))
        for key in ("motornet_detail_url", "source_url"):
            url = canonical_url(car.get(key))
            if url:
                seen_urls.add(url)
                seen_ids.add(base.make_id(url))

    print(f"RESUME existing catalog: cars={len(clean_cars)} seen_urls={len(seen_urls)}")
    return clean_cars, errors, seen_urls, seen_ids


def already_imported(url: str, seen_urls: set[str], seen_ids: set[str]) -> bool:
    url = canonical_url(url)
    return bool(url and (url in seen_urls or base.make_id(url) in seen_ids))


def mark_seen(car: dict, seen_urls: set[str], seen_ids: set[str]) -> None:
    if car.get("id"):
        seen_ids.add(str(car["id"]))
    for key in ("motornet_detail_url", "source_url"):
        url = canonical_url(car.get(key))
        if url:
            seen_urls.add(url)
            seen_ids.add(base.make_id(url))


def write_payload(cars: list[dict], errors: list[dict], args, requests_count: int, images_downloaded: int) -> None:
    base.write_payload(base.build_payload(cars, errors, args, requests_count, images_downloaded))


def robust_git_checkpoint(count: int, image_dir: Path) -> None:
    subprocess.run(["git", "config", "user.name", "github-actions"], check=False)
    subprocess.run(["git", "config", "user.email", "github-actions@github.com"], check=False)
    subprocess.run(["git", "add", str(base.OUT), str(image_dir)], check=False)
    diff = subprocess.run(["git", "diff", "--cached", "--quiet"], check=False)
    if diff.returncode == 0:
        return

    committed = subprocess.run(["git", "commit", "-m", f"Checkpoint Motornet catalogue ({count} cars)"], check=False)
    if committed.returncode != 0:
        return

    for attempt in range(1, 4):
        print(f"Checkpoint push attempt {attempt}")
        pushed = subprocess.run(["bash", "-lc", "git pull --rebase --autostash origin main && git push"], check=False)
        if pushed.returncode == 0:
            print("Checkpoint pushed.")
            return
        subprocess.run(["git", "rebase", "--abort"], check=False)
        time.sleep(5)

    print("WARN checkpoint commit created but push failed after retries")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=650, help="Maximum total cars in data/cars_motornet.json. Use 0 for no total limit.")
    parser.add_argument("--delay", type=float, default=8)
    parser.add_argument("--timeout", type=int, default=45000)
    parser.add_argument("--brand-codes", default="", help="CSV brand codes for test runs, e.g. ABA,ROL")
    parser.add_argument("--checkpoint-every", type=int, default=25)
    parser.add_argument("--checkpoint-commit", default="true")
    parser.add_argument("--download-images", default="true")
    parser.add_argument("--image-dir", default="assets/cars/motornet")
    parser.add_argument("--max-image-mb", type=float, default=6)
    args = parser.parse_args()

    args.checkpoint_commit = bool_arg(args.checkpoint_commit)
    args.download_images = bool_arg(args.download_images)
    image_dir = Path(args.image_dir)
    max_image_bytes = int(args.max_image_mb * 1024 * 1024)

    cars, errors, seen_urls, seen_ids = load_existing_catalog()
    initial_count = len(cars)
    last_checkpoint = initial_count

    if args.limit > 0 and len(cars) >= args.limit:
        print(f"Existing catalog already has {len(cars)} cars, limit={args.limit}. Nothing to import.")
        write_payload(cars, errors, args, 0, 0)
        return

    robots = urllib.robotparser.RobotFileParser()
    robots.set_url(f"{base.BASE}/robots.txt")
    try:
        robots.read()
    except Exception as exc:
        print("WARN robots non leggibile:", exc)

    image_session = requests.Session()
    image_session.headers.update({"User-Agent": base.UA})

    requests_count = 0
    images_downloaded = 0
    skipped_existing = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=base.UA, locale="it-IT")
        page = context.new_page()

        if args.brand_codes.strip():
            brand_urls = [f"{base.BASE}/auto/scheda-modello/{code.strip().upper()}" for code in args.brand_codes.split(",") if code.strip()]
        else:
            print("LIST", base.LIST_URL)
            if base.can_fetch(robots, base.LIST_URL):
                page.goto(base.LIST_URL, wait_until="domcontentloaded", timeout=args.timeout)
                page.wait_for_timeout(2500)
                requests_count += 1
                brand_urls = base.discover_links_after_clicking_menus(page, r"^/auto/scheda-modello/[A-Z0-9]{2,4}$")
                if not brand_urls:
                    print("  automatic brand discovery returned 0 links; using known brand code fallback")
                    brand_urls = [f"{base.BASE}/auto/scheda-modello/{code}" for code in extended_brand_codes()]
            else:
                brand_urls = []
                errors.append({"url": base.LIST_URL, "error": "blocked_by_robots"})

        print("brand links:", len(brand_urls))
        run_seen_details: set[str] = set()

        for brand_url in brand_urls:
            if args.limit > 0 and len(cars) >= args.limit:
                break
            if not base.can_fetch(robots, brand_url):
                errors.append({"url": brand_url, "error": "blocked_by_robots"})
                continue

            try:
                time.sleep(args.delay)
                print("BRAND", brand_url)
                page.goto(brand_url, wait_until="domcontentloaded", timeout=args.timeout)
                page.wait_for_timeout(2500)
                requests_count += 1
                brand_name = base.brand_name_from_page(page, brand_url)

                detail_links = base.discover_links_after_clicking_menus(page, r"^/auto/scheda-modello/modello/\d+/allestimento/[^/]+$")
                model_links = base.discover_links_after_clicking_menus(page, r"^/auto/scheda-modello/modello/\d+$")
                if model_links:
                    expanded, requests_count = base.expand_model_links_to_details(page, model_links, args, robots, errors, requests_count)
                    for detail_url in expanded:
                        if detail_url not in detail_links:
                            detail_links.append(detail_url)

                print("  detail links:", len(detail_links))
            except Exception as exc:
                errors.append({"url": brand_url, "error": str(exc)})
                continue

            for detail_url in detail_links:
                detail_url = canonical_url(detail_url)
                if args.limit > 0 and len(cars) >= args.limit:
                    break
                if detail_url in run_seen_details:
                    continue
                run_seen_details.add(detail_url)

                if already_imported(detail_url, seen_urls, seen_ids):
                    skipped_existing += 1
                    print("  = skip existing", detail_url)
                    continue

                if not base.can_fetch(robots, detail_url):
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

                    car = base.parse_detail(page, detail_url, brand_name)
                    if not car:
                        continue
                    if already_imported(car.get("motornet_detail_url") or car.get("source_url") or detail_url, seen_urls, seen_ids):
                        skipped_existing += 1
                        print("  = skip existing after parse", detail_url)
                        continue

                    if args.download_images and car.get("image_source_url"):
                        try:
                            time.sleep(max(1, args.delay / 2))
                            image_data = base.download_image(image_session, car["image_source_url"], car["id"], image_dir, int(args.timeout / 1000), max_image_bytes)
                            if image_data:
                                car.update(image_data)
                                images_downloaded += 1
                        except Exception as exc:
                            car["image_error"] = str(exc)
                            errors.append({"url": car.get("image_source_url"), "error": f"image: {exc}"})

                    cars.append(car)
                    mark_seen(car, seen_urls, seen_ids)
                    print(f"  + {car.get('brand')} {car.get('model')} [{car.get('fuel')}] price={car.get('price_eur')} kwh100={car.get('consumption_kwh_100km')} l100={car.get('consumption_l_100km')}")

                    new_since_start = len(cars) - initial_count
                    if args.checkpoint_commit and args.checkpoint_every > 0 and new_since_start > 0 and new_since_start % args.checkpoint_every == 0 and len(cars) != last_checkpoint:
                        write_payload(cars, errors, args, requests_count, images_downloaded)
                        robust_git_checkpoint(len(cars), image_dir)
                        last_checkpoint = len(cars)

                except Exception as exc:
                    errors.append({"url": detail_url, "error": str(exc)})

        context.close()
        browser.close()

    write_payload(cars, errors, args, requests_count, images_downloaded)
    print(
        "Done cars=", len(cars),
        "new=", len(cars) - initial_count,
        "skipped_existing=", skipped_existing,
        "errors=", len(errors),
        "requests=", requests_count,
        "images_downloaded=", images_downloaded,
        "status=", "ok" if cars else "empty",
    )


if __name__ == "__main__":
    main()
