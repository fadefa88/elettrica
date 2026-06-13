# Elettrica

Sito statico per capire se un'auto elettrica conviene rispetto a diesel o benzina.

## Cosa include

- simulatore TCO elettrica vs diesel/benzina;
- confronto tra auto elettrica reale e auto termica reale;
- prezzo carburante al litro aggiornabile ogni giorno via GitHub Actions;
- costo al km EV con ricarica domestica, pubblica e quota fotovoltaico;
- bollo EV esente per 5 anni, poi costo configurabile;
- manutenzione EV e termica configurabile;
- catalogo iniziale di BEV e termiche comuni;
- importer per database grande di auto benzina/diesel da FuelEconomy.gov;
- deploy GitHub Pages.

## File principali

- index.html
- styles.css
- app.js
- data/prices.json
- data/charging.json
- data/cars_ev.json
- data/cars_ev_2.json
- data/cars_ev_3.json
- data/ice_cars_seed.json
- data/ice_cars_world.json
- scripts/update_data.py
- scripts/update_ice_cars.py
- .github/workflows/update-data.yml
- .github/workflows/pages.yml

## Aggiornamento dati

Il workflow `Update dynamic vehicle cost data` parte ogni giorno alle 06:17 UTC e può essere lanciato anche a mano da GitHub Actions.

Lo script `update_data.py` prova a leggere gli open data ministeriali `prezzo_alle_8.csv` per benzina e gasolio. Se la fonte non risponde o cambia formato, mantiene i valori precedenti e non rompe il sito.

Lo script `update_ice_cars.py` scarica il dataset FuelEconomy.gov, filtra auto benzina/diesel recenti e genera `data/ice_cars_world.json` con consumi convertiti in l/100 km.

## Limiti attuali

- Le tariffe delle colonnine non hanno un feed pubblico unico nazionale con prezzo €/kWh per ogni operatore. Per questo il sito usa `data/charging.json`, modificabile a mano.
- Il seed termiche italiano ha prezzi indicativi.
- Il database FuelEconomy.gov è molto ampio ma orientato al mercato USA: utile per consumi normalizzati, non per listini italiani.
- Non sono ancora modellati valore residuo, assicurazione, interessi finanziamento, pneumatici e incentivi locali.

## Come pubblicare

1. Vai in Settings > Pages del repo.
2. In Build and deployment, scegli GitHub Actions.
3. Lancia il workflow Deploy static site to GitHub Pages oppure fai un push su main.
