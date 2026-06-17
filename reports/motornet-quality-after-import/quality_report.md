# Motornet catalog quality audit

## Sintesi

- Auto totali: 5645
- Righe Excel generate: 5645
- Elettriche totali: 1237
- Elettriche con anomalie: 0
- Termiche totali: 4408
- Termiche con anomalie: 30
- Auto senza immagine: 267
- Problemi immagine ignorati: True

## Output principali

- `motornet_catalog_audit.xlsx`: catalogo completo modificabile in Excel, limitato ai campi usati dal sito.
- `all_cars_audit.csv`: stesso contenuto in CSV.
- `ev_quality_issues.csv`: solo elettriche con problemi.
- `thermal_quality_issues.csv`: solo termiche con problemi.

## Colonne Excel esportate

```json
[
  "issues",
  "status",
  "notes",
  "id",
  "category",
  "brand",
  "model",
  "version",
  "powertrain",
  "fuel",
  "year",
  "price_eur",
  "price_source",
  "power_kw",
  "power_cv",
  "consumption_l_100km",
  "consumption_kg_100km",
  "consumption_kwh_100km",
  "battery_kwh",
  "range_wltp_km",
  "emissions_g_km",
  "image_url",
  "source_url",
  "motornet_detail_url"
]
```

## Soglie usate

```json
{
  "price_eur": [
    1000.0,
    1000000.0
  ],
  "power_kw": [
    1.0,
    1500.0
  ],
  "ev_consumption_kwh_100km": [
    7.0,
    40.0
  ],
  "ev_battery_kwh": [
    5.0,
    250.0
  ],
  "ev_range_wltp_km": [
    30.0,
    1000.0
  ],
  "thermal_consumption_l_100km": [
    1.0,
    30.0
  ],
  "thermal_consumption_kg_100km": [
    1.0,
    15.0
  ],
  "thermal_emissions_g_km": [
    1.0,
    500.0
  ]
}
```

## Elettriche — anteprima anomalie

Nessuna anomalia trovata.

## Termiche — anteprima anomalie

- **Aston Martin Valhalla V8 Twin Turbo DCT Aston Martin Valhalla V8 Twin Turbo DCT** — too high prezzo: 1.01766e+06 EUR > 1e+06 — `https://www.motornet.it/auto/scheda-modello/modello/2704/allestimento/AST0502`
- **Chevrolet Suburban 6.2 V8 V8 EcoTec3 425cv High Country 4WD Chevrolet Suburban 6.2 V8 V8 EcoTec3 425cv High Country 4WD** — too high emissioni CO2: 515 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2434/allestimento/CHC1038`
- **Chevrolet Silverado Crew Cab 6.2 V8 EcoTec3 420cv High Country AWD Chevrolet Silverado Crew Cab 6.2 V8 EcoTec3 420cv High Country AWD** — too high emissioni CO2: 522 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2166/allestimento/CHC1039`
- **Chevrolet Silverado Crew Cab 6.2 V8 BiFuel 420cv High Country AWD Auto Chevrolet Silverado Crew Cab 6.2 V8 BiFuel 420cv High Country AWD Auto** — too high consumo termico: 100 l/100 km > 30 — `https://www.motornet.it/auto/scheda-modello/modello/2166/allestimento/CHC1042`
- **Chevrolet Silverado Crew Cab 6.2 V8 BiFuel 420cv Trail Boss AWD Auto Chevrolet Silverado Crew Cab 6.2 V8 BiFuel 420cv Trail Boss AWD Auto** — too high consumo termico: 100 l/100 km > 30 — `https://www.motornet.it/auto/scheda-modello/modello/2166/allestimento/CHC1027`
- **Chevrolet Silverado Crew Cab 6.2 V8 BiFuel 420cv ZR2 AWD Auto Chevrolet Silverado Crew Cab 6.2 V8 BiFuel 420cv ZR2 AWD Auto** — too high consumo termico: 100 l/100 km > 30 — `https://www.motornet.it/auto/scheda-modello/modello/2166/allestimento/CHC1041`
- **Cirelli Motor Company 5 1.5 177cv Cross DCT Cirelli Motor Company 5 1.5 177cv Cross DCT** — too high emissioni CO2: 1685 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2544/allestimento/CIR0078`
- **Cirelli Motor Company 5 1.5 177cv Premium DCT Cirelli Motor Company 5 1.5 177cv Premium DCT** — too high emissioni CO2: 1685 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2544/allestimento/CIR0048`
- **Cirelli Motor Company 5 1.5 177cv Cross DCT Cirelli Motor Company 5 1.5 177cv Cross DCT** — too high emissioni CO2: 1685 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2544/allestimento/CIR0085`
- **Cirelli Motor Company 5 1.5 177cv Premium DCT Cirelli Motor Company 5 1.5 177cv Premium DCT** — too high emissioni CO2: 1685 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2544/allestimento/CIR0058`
- **Cirelli Motor Company 5 1.5 Mild Hybrid 177cv Cross DCT Cirelli Motor Company 5 1.5 Mild Hybrid 177cv Cross DCT** — too high emissioni CO2: 1685 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2544/allestimento/CIR0079`
- **Cirelli Motor Company 5 1.5 Mild Hybrid 177cv Premium DCT Cirelli Motor Company 5 1.5 Mild Hybrid 177cv Premium DCT** — too high emissioni CO2: 1685 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2544/allestimento/CIR0077`
- **Cirelli Motor Company 5 1.5 Mild Hybrid Bi-Fuel Gpl 177cv Cross DCT Cirelli Motor Company 5 1.5 Mild Hybrid Bi-Fuel Gpl 177cv Cross DCT** — too high emissioni CO2: 1685 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2544/allestimento/CIR0086`
- **Cirelli Motor Company 5 1.5 Mild Hybrid Bi-Fuel Gpl 177cv Premium DCT Cirelli Motor Company 5 1.5 Mild Hybrid Bi-Fuel Gpl 177cv Premium DCT** — too high emissioni CO2: 1685 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2544/allestimento/CIR0084`
- **Cirelli Motor Company 7 1.5 177cv Cross DCT Cirelli Motor Company 7 1.5 177cv Cross DCT** — too high emissioni CO2: 1782 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2545/allestimento/CIR0052`
- **Cirelli Motor Company 7 1.5 177cv Premium DCT Cirelli Motor Company 7 1.5 177cv Premium DCT** — too high emissioni CO2: 1782 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2545/allestimento/CIR0155`
- **Cirelli Motor Company 7 1.5 Bi-Fuel Gpl 177cv Cross DCT Cirelli Motor Company 7 1.5 Bi-Fuel Gpl 177cv Cross DCT** — too high emissioni CO2: 1782 g/km > 500 — `https://www.motornet.it/auto/scheda-modello/modello/2545/allestimento/CIR0062`
- **COR Motornet.it | auto | scheda modello | modello | 2735 | allestimento | COR0556 Motornet.it | auto | scheda modello | modello | 2735 | allestimento | COR0556** — missing prezzo | missing power_kw/power_cv | missing consumo termico | missing emissioni CO2 — `https://www.motornet.it/auto/scheda-modello/modello/2735/allestimento/COR0556`
- **COR Motornet.it | auto | scheda modello | modello | 2735 | allestimento | COR0552 Motornet.it | auto | scheda modello | modello | 2735 | allestimento | COR0552** — missing prezzo | missing power_kw/power_cv | missing consumo termico | missing emissioni CO2 — `https://www.motornet.it/auto/scheda-modello/modello/2735/allestimento/COR0552`
- **COR Motornet.it | auto | scheda modello | modello | 2735 | allestimento | COR0553 Motornet.it | auto | scheda modello | modello | 2735 | allestimento | COR0553** — missing prezzo | missing power_kw/power_cv | missing consumo termico | missing emissioni CO2 — `https://www.motornet.it/auto/scheda-modello/modello/2735/allestimento/COR0553`
- **COR Motornet.it | auto | scheda modello | modello | 2735 | allestimento | COR0558 Motornet.it | auto | scheda modello | modello | 2735 | allestimento | COR0558** — missing prezzo | missing power_kw/power_cv | missing consumo termico | missing emissioni CO2 — `https://www.motornet.it/auto/scheda-modello/modello/2735/allestimento/COR0558`
- **COR Motornet.it | auto | scheda modello | modello | 2734 | allestimento | COR0554 Motornet.it | auto | scheda modello | modello | 2734 | allestimento | COR0554** — missing prezzo | missing power_kw/power_cv | missing consumo termico | missing emissioni CO2 — `https://www.motornet.it/auto/scheda-modello/modello/2734/allestimento/COR0554`
- **COR Motornet.it | auto | scheda modello | modello | 2734 | allestimento | COR0555 Motornet.it | auto | scheda modello | modello | 2734 | allestimento | COR0555** — missing prezzo | missing power_kw/power_cv | missing consumo termico | missing emissioni CO2 — `https://www.motornet.it/auto/scheda-modello/modello/2734/allestimento/COR0555`
- **COR Motornet.it | auto | scheda modello | modello | 2659 | allestimento | COR0554 Motornet.it | auto | scheda modello | modello | 2659 | allestimento | COR0554** — missing prezzo | missing power_kw/power_cv | missing consumo termico | missing emissioni CO2 — `https://www.motornet.it/auto/scheda-modello/modello/2659/allestimento/COR0554`
- **COR Motornet.it | auto | scheda modello | modello | 2659 | allestimento | COR0555 Motornet.it | auto | scheda modello | modello | 2659 | allestimento | COR0555** — missing prezzo | missing power_kw/power_cv | missing consumo termico | missing emissioni CO2 — `https://www.motornet.it/auto/scheda-modello/modello/2659/allestimento/COR0555`
- **Ferrari Daytona Sp3 6.5 V12 Ferrari Daytona Sp3 6.5 V12** — too high prezzo: 2e+06 EUR > 1e+06 — `https://www.motornet.it/auto/scheda-modello/modello/2422/allestimento/FER2174`
- **Mitsubishi ASX 1.2 Turbo GPL Invite Mitsubishi ASX 1.2 Turbo GPL Invite** — too high consumo termico: 100 l/100 km > 30 — `https://www.motornet.it/auto/scheda-modello/modello/396/allestimento/MIT3181`
- **Renault Symbioz 1.2 ECO-G Esprit Alpine 120cv Renault Symbioz 1.2 ECO-G Esprit Alpine 120cv** — too high consumo termico: 100 l/100 km > 30 — `https://www.motornet.it/auto/scheda-modello/modello/2651/allestimento/REN912A`
- **Renault Symbioz 1.2 ECO-G Evolution 120cv Renault Symbioz 1.2 ECO-G Evolution 120cv** — too high consumo termico: 100 l/100 km > 30 — `https://www.motornet.it/auto/scheda-modello/modello/2651/allestimento/REN910A`
- **Renault Symbioz 1.2 ECO-G Techno 120cv Renault Symbioz 1.2 ECO-G Techno 120cv** — too high consumo termico: 100 l/100 km > 30 — `https://www.motornet.it/auto/scheda-modello/modello/2651/allestimento/REN911A`

## Immagini

Immagini ignorate per richiesta operativa.

