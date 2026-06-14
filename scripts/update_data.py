#!/usr/bin/env python3
import csv, io, json, statistics
from datetime import datetime, timezone
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
PRICES = ROOT / 'data' / 'prices.json'
MIMIT_URLS = [
    'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv',
    'https://www.mise.gov.it/images/exportCSV/prezzo_alle_8.csv'
]
FUEL_KEYS = {
    'benzina': ['benzina'],
    'gasolio': ['gasolio', 'diesel'],
    'gpl': ['gpl'],
    'metano': ['metano']
}
UNITS = {'benzina':'eur_l','gasolio':'eur_l','gpl':'eur_l','metano':'eur_kg'}

def load(path):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}

def save(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def to_float(x):
    try:
        return float(str(x).replace(',', '.').strip())
    except Exception:
        return None

def col(names, want):
    low = {str(n).lower(): n for n in names or []}
    for w in want:
        if w.lower() in low:
            return low[w.lower()]
    for n in names or []:
        if any(w.lower() in str(n).lower() for w in want):
            return n
    return None

def key_for_fuel(label):
    text = str(label or '').lower()
    if 'special' in text or 'premium' in text or 'plus' in text:
        return None
    for key, aliases in FUEL_KEYS.items():
        if any(a in text for a in aliases):
            return key
    return None

def read_mimit():
    for url in MIMIT_URLS:
        try:
            r = requests.get(url, timeout=12, headers={'User-Agent':'Mozilla/5.0 elettrica-tco'})
            r.raise_for_status()
            text = r.content.decode('utf-8', errors='replace')
            dialect = csv.Sniffer().sniff(text[:3000], delimiters=';,|\t')
            reader = csv.DictReader(io.StringIO(text), dialect=dialect)
            fuel_col = col(reader.fieldnames, ['descCarburante','carburante','prodotto'])
            price_col = col(reader.fieldnames, ['prezzo','price'])
            self_col = col(reader.fieldnames, ['isSelf','self'])
            if not fuel_col or not price_col:
                print('missing columns', reader.fieldnames)
                continue
            buckets = {k: [] for k in FUEL_KEYS}
            for row in reader:
                k = key_for_fuel(row.get(fuel_col,''))
                price = to_float(row.get(price_col,''))
                if not k or not price or price <= 0 or price > 10:
                    continue
                if self_col and str(row.get(self_col,'')).lower() in ['0','false','servito'] and k in ['benzina','gasolio']:
                    continue
                buckets[k].append(price)
            data = {k: round(statistics.fmean(v), 3) for k, v in buckets.items() if v}
            if data.get('benzina') and data.get('gasolio'):
                data['source'] = url
                data['frequency'] = 'daily'
                data['samples'] = {k: len(v) for k, v in buckets.items()}
                return data
        except Exception as exc:
            print('MIMIT source failed', url, exc)
    return {}

def main():
    prices = load(PRICES) or {'fuel':{}, 'electricity':{'home':0.30,'solar':0.08}}
    prices.setdefault('fuel', {})
    prices['fuel'].setdefault('units', UNITS)
    data = read_mimit()
    if data:
        for k in FUEL_KEYS:
            if data.get(k):
                prices['fuel'][k] = data[k]
        prices['fuel']['source'] = data.get('source')
        prices['fuel']['frequency'] = data.get('frequency')
        prices['fuel']['samples'] = data.get('samples', {})
        prices['fuel']['units'] = UNITS
        prices['status'] = 'updated_mimit_daily'
    else:
        prices['status'] = 'fallback_previous_values'
        prices['fuel']['units'] = UNITS
    prices['updated_at'] = datetime.now(timezone.utc).isoformat()
    save(PRICES, prices)
    print(json.dumps(prices, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
