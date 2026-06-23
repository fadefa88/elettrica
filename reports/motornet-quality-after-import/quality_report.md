# Motornet catalog audit

- Total cars: 5660
- OK rows: 5328
- Rows with issues: 332

## Audit thresholds

- EV consumption: 7-40 kWh/100 km
- EV battery: 5-250 kWh
- EV WLTP range: 30-1000 km
- Thermal consumption: 1-30 l/100 km
- Methane consumption: 1-15 kg/100 km
- CO2 emissions: 1-500 g/km

## Categories

- thermal: 4400
- electric: 1260

## Fuels

- ibrida_benzina: 2074
- elettrica: 1260
- benzina: 954
- ibrida_diesel: 664
- diesel: 497
- gpl: 174
- ibrida_gpl: 33
- ibrida_metano: 2
- metano: 2

## Top issues

- missing consumption_l_100km: 207
- missing power_cv: 108
- too high emissions_g_km: 1685 g/km > 500: 8
- missing consumption_kg_100km: 4
- too high emissions_g_km: 1782 g/km > 500: 3
- too high price_eur: 770000 € > 600000: 1
- too high price_eur: 850000 € > 600000: 1
- too high emissions_g_km: 522 g/km > 500: 1
- too high emissions_g_km: 515 g/km > 500: 1
- too high price_eur: 631076 € > 600000: 1
- too high price_eur: 2e+06 € > 600000: 1
- too high price_eur: 1.01766e+06 € > 600000: 1

## Output files

- motornet_catalog_audit.xlsx: curated workbook for manual cleanup
- motornet_catalog_audit.csv: same data in CSV format
- quality_report.md: markdown summary

Images are intentionally ignored in issue generation.
