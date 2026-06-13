#!/usr/bin/env python3
import csv, io, json, statistics
from datetime import datetime, timezone
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
PRICES = ROOT / 'data' / 'prices.json'
URLS = [
    'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv',
    'https://www.mise.gov.it/images/exportCSV/prezzo_alle_8.csv'
]

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
    low = {n.lower(): n for n in names}
    for w in want:
        if w.lower() in low:
            return low[w.lower()]
    for n in names:
        if any(w.lower() in n.lower() for w in want):
            return n
    return None

def read_fuel():
    for url in URLS:
        try:
            r = requests.get(url, timeout=30, headers={'User-Agent':'elettrica-tco/1.0'})
            r.raise_for_status()
            text = r.content.decode('utf-8', errors='replace')
            dialect = csv.Sniffer().sniff(text[:2000], delimiters=';,|\t')
            reader = csv.DictReader(io.StringIO(text), dialect=dialect)
            fuel_col = col(reader.fieldnames or [], ['descCarburante','carburante','prodotto'])
            price_col = col(reader.fieldnames or [], ['prezzo','price'])
            self_col = col(reader.fieldnames or [], ['isSelf','self'])
            if not fuel_col or not price_col:
                continue
            benzina, gasolio = [], []
            for row in reader:
                fuel = str(row.get(fuel_col,'')).lower()
                price = to_float(row.get(price_col,''))
                if not price or price <= 0 or price > 5:
                    continue
                if self_col and str(row.get(self_col,'')).lower() in ['0','false','servito']:
                    continue
                if 'benzina' in fuel and 'special' not in fuel:
                    benzina.append(price)
                if 'gasolio' in fuel and 'special' not in fuel and 'premium' not in fuel:
                    gasolio.append(price)
            return {
                'benzina': round(statistics.fmean(benzina), 3) if benzina else None,
                'gasolio': round(statistics.fmean(gasolio), 3) if gasolio else None,
                'source': url,
                'samples': {'benzina': len(benzina), 'gasolio': len(gasolio)}
            }
        except Exception as exc:
            print('source failed', url, exc)
    return {}

def main():
    prices = load(PRICES) or {'fuel':{}, 'electricity':{'home':0.30,'solar':0.08}}
    prices.setdefault('fuel', {})
    data = read_fuel()
    if data.get('benzina'):
        prices['fuel']['benzina'] = data['benzina']
    if data.get('gasolio'):
        prices['fuel']['gasolio'] = data['gasolio']
    if data.get('source'):
        prices['fuel']['source'] = data['source']
        prices['fuel']['samples'] = data['samples']
        prices['status'] = 'updated'
    else:
        prices['status'] = 'fallback_previous_values'
    prices['updated_at'] = datetime.now(timezone.utc).isoformat()
    save(PRICES, prices)
    print(json.dumps(prices, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
