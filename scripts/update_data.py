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

def clean_cell(x):
    return str(x or '').replace('\ufeff', '').strip()

def norm(x):
    return clean_cell(x).lower().replace(' ', '').replace('_', '')

def to_float(x):
    try:
        return float(clean_cell(x).replace(',', '.'))
    except Exception:
        return None

def find_col(names, wanted):
    normalized = {norm(n): n for n in names or []}
    wanted_norm = [norm(w) for w in wanted]
    for w in wanted_norm:
        if w in normalized:
            return normalized[w]
    for n in names or []:
        nn = norm(n)
        if any(w in nn for w in wanted_norm):
            return n
    return None

def csv_dicts_after_real_header(text):
    sample = text[:5000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=';,|\t')
    except Exception:
        dialect = csv.excel
        dialect.delimiter = ';'
    raw_rows = list(csv.reader(io.StringIO(text), dialect=dialect))
    rows = [[clean_cell(c) for c in row] for row in raw_rows if any(clean_cell(c) for c in row)]
    header_idx = None
    for i, row in enumerate(rows):
        nr = [norm(c) for c in row]
        has_fuel = any('carburante' in c or 'prodotto' in c for c in nr)
        has_price = any('prezzo' in c or 'price' in c for c in nr)
        if has_fuel and has_price:
            header_idx = i
            break
    if header_idx is None:
        preview = rows[:5]
        raise ValueError(f'real CSV header not found. first rows: {preview}')
    headers = rows[header_idx]
    out = []
    for row in rows[header_idx + 1:]:
        if len(row) < len(headers):
            row = row + [''] * (len(headers) - len(row))
        if len(row) > len(headers):
            row = row[:len(headers)]
        out.append(dict(zip(headers, row)))
    return headers, out, header_idx

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
            r = requests.get(url, timeout=20, headers={'User-Agent':'Mozilla/5.0 elettrica-tco'})
            r.raise_for_status()
            text = r.content.decode('utf-8-sig', errors='replace')
            headers, rows, skipped = csv_dicts_after_real_header(text)
            fuel_col = find_col(headers, ['descCarburante','carburante','prodotto'])
            price_col = find_col(headers, ['prezzo','price'])
            self_col = find_col(headers, ['isSelf','self'])
            if not fuel_col or not price_col:
                print('missing columns after header detection', headers)
                continue
            buckets = {k: [] for k in FUEL_KEYS}
            for row in rows:
                k = key_for_fuel(row.get(fuel_col, ''))
                price = to_float(row.get(price_col, ''))
                if not k or not price or price <= 0 or price > 10:
                    continue
                if self_col and str(row.get(self_col, '')).lower() in ['0', 'false', 'servito'] and k in ['benzina', 'gasolio']:
                    continue
                buckets[k].append(price)
            data = {k: round(statistics.fmean(v), 3) for k, v in buckets.items() if v}
            print('MIMIT parsed', {'url': url, 'skipped_rows': skipped, 'columns': headers, 'samples': {k: len(v) for k, v in buckets.items()}})
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
