#!/usr/bin/env python3
import csv, io, json, zipfile
from datetime import datetime, timezone
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'ice_cars_world.json'
URL = 'https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip'

MPG_TO_L100 = 235.214583

def fnum(x):
    try:
        return float(str(x).strip())
    except Exception:
        return 0.0

def classify_fuel(f):
    s = (f or '').lower()
    if 'diesel' in s:
        return 'diesel'
    if 'electric' in s or 'cng' in s or 'hydrogen' in s:
        return None
    if 'gasoline' in s or 'premium' in s or 'regular' in s or 'midgrade' in s:
        return 'benzina'
    return None

def main():
    r = requests.get(URL, timeout=60, headers={'User-Agent':'elettrica-tco/1.0'})
    r.raise_for_status()
    z = zipfile.ZipFile(io.BytesIO(r.content))
    name = z.namelist()[0]
    text = z.read(name).decode('utf-8', errors='replace')
    rows = csv.DictReader(io.StringIO(text))
    cars = []
    seen = set()
    for row in rows:
        year = int(fnum(row.get('year')))
        if year < 2018:
            continue
        mpg = fnum(row.get('comb08'))
        if mpg <= 0:
            continue
        fuel = classify_fuel(row.get('fuelType'))
        if not fuel:
            continue
        make = row.get('make','').strip()
        model = row.get('model','').strip()
        trany = row.get('trany','').strip()
        displ = row.get('displ','').strip()
        key = (year, make, model, fuel, trany, displ)
        if key in seen:
            continue
        seen.add(key)
        l100 = round(MPG_TO_L100 / mpg, 2)
        price = 0
        cars.append({
            'id': 'epa_' + str(row.get('id','')).strip(),
            'brand': make,
            'model': f"{model} {displ}L {trany}".strip(),
            'year': year,
            'fuel': fuel,
            'segment': row.get('VClass','').strip() or 'EPA vehicle',
            'price_eur': price,
            'consumption_l_100km': l100,
            'source': 'FuelEconomy.gov EPA dataset',
            'epa_id': row.get('id','').strip()
        })
    cars.sort(key=lambda c: (-c['year'], c['brand'], c['model']))
    obj = {'updated_at': datetime.now(timezone.utc).isoformat(), 'source': URL, 'count': len(cars), 'cars': cars[:6000]}
    OUT.write_text(json.dumps(obj, ensure_ascii=False, separators=(',',':')) + '\n', encoding='utf-8')
    print('written', OUT, 'cars', len(obj['cars']))

if __name__ == '__main__':
    main()
