#!/usr/bin/env python3
import csv, io, json, re, statistics
from datetime import datetime, timezone
from pathlib import Path
import requests
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
PRICES = ROOT / 'data' / 'prices.json'
MIMIT_URLS = [
    'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv',
    'https://www.mise.gov.it/images/exportCSV/prezzo_alle_8.csv'
]
EU_PAGE = 'https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en'

def load(path):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}

def save(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def num(x):
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

def read_mimit():
    for url in MIMIT_URLS:
        try:
            r = requests.get(url, timeout=8, headers={'User-Agent':'Mozilla/5.0 elettrica-tco'})
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
                price = num(row.get(price_col,''))
                if not price or price <= 0 or price > 5:
                    continue
                if self_col and str(row.get(self_col,'')).lower() in ['0','false','servito']:
                    continue
                if 'benzina' in fuel and 'special' not in fuel:
                    benzina.append(price)
                if 'gasolio' in fuel and 'special' not in fuel and 'premium' not in fuel:
                    gasolio.append(price)
            if benzina and gasolio:
                return {'benzina': round(statistics.fmean(benzina),3), 'gasolio': round(statistics.fmean(gasolio),3), 'source': url, 'frequency': 'daily', 'samples': {'benzina': len(benzina), 'gasolio': len(gasolio)}}
        except Exception as exc:
            print('MIMIT source failed', url, exc)
    return {}

def eu_latest_xlsx_url():
    r = requests.get(EU_PAGE, timeout=20, headers={'User-Agent':'Mozilla/5.0 elettrica-tco'})
    r.raise_for_status()
    html = r.text
    links = re.findall(r'href="([^"]+?\.xlsx[^"]*)"', html)
    for link in links:
        if 'weekly' in link.lower() or 'prices' in link.lower() or 'tax' in link.lower():
            if link.startswith('/'):
                return 'https://energy.ec.europa.eu' + link.replace('&amp;', '&')
            return link.replace('&amp;', '&')
    return None

def read_eu_bulletin():
    try:
        url = eu_latest_xlsx_url()
        if not url:
            return {}
        r = requests.get(url, timeout=30, headers={'User-Agent':'Mozilla/5.0 elettrica-tco'})
        r.raise_for_status()
        wb = load_workbook(io.BytesIO(r.content), data_only=True)
        vals = []
        for ws in wb.worksheets:
            for row in ws.iter_rows(values_only=True):
                vals.append([str(x).strip() if x is not None else '' for x in row])
        italy_rows = [row for row in vals if any(cell.lower() in ['italy','italia','it'] for cell in row)]
        candidates = []
        for row in italy_rows:
            nums = [num(x) for x in row]
            nums = [x for x in nums if x and 0.5 <= x <= 3.0]
            if len(nums) >= 2:
                candidates.append(nums)
        if not candidates:
            return {}
        row = candidates[0]
        benzina = max(row[:3]) if len(row) >= 3 else row[0]
        gasolio = sorted(row[:4])[1] if len(row) >= 4 else row[1]
        return {'benzina': round(benzina,3), 'gasolio': round(gasolio,3), 'source': url, 'frequency': 'weekly', 'samples': {'italy_rows': len(italy_rows)}}
    except Exception as exc:
        print('EU source failed', exc)
        return {}

def main():
    prices = load(PRICES) or {'fuel':{}, 'electricity':{'home':0.30,'solar':0.08}}
    prices.setdefault('fuel', {})
    data = read_mimit() or read_eu_bulletin()
    if data.get('benzina'):
        prices['fuel']['benzina'] = data['benzina']
    if data.get('gasolio'):
        prices['fuel']['gasolio'] = data['gasolio']
    if data.get('source'):
        prices['fuel']['source'] = data['source']
        prices['fuel']['frequency'] = data.get('frequency')
        prices['fuel']['samples'] = data.get('samples', {})
        prices['status'] = 'updated_' + str(data.get('frequency','unknown'))
    else:
        prices['status'] = 'fallback_previous_values'
    prices['updated_at'] = datetime.now(timezone.utc).isoformat()
    save(PRICES, prices)
    print(json.dumps(prices, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
