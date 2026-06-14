# Elettrica

Sito statico per capire se un'auto elettrica conviene rispetto a termiche vendute in Italia.

## Cosa include

- simulatore TCO elettrica vs benzina/diesel/GPL/metano;
- confronto tra auto elettrica reale e auto termica reale del mercato italiano;
- prezzi carburante aggiornabili ogni giorno via GitHub Actions da MIMIT quando disponibile;
- costo al km EV con ricarica domestica, pubblica e quota fotovoltaico;
- bollo EV esente per 5 anni, poi costo configurabile;
- manutenzione EV e termica configurabile;
- catalogo BEV mercato Italia ampliato in più file;
- seed termiche Italia con benzina, diesel, GPL e alcuni metano storici/stock;
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
- data/cars_ev_4.json
- data/cars_ev_5.json
- data/cars_ev_6.json
- data/cars_ev_7.json
- data/ice_cars_seed.json
- scripts/update_data.py
- .github/workflows/update-data.yml
- .github/workflows/pages.yml

## Aggiornamento dati

Il workflow `Update dynamic vehicle cost data` parte ogni giorno alle 06:17 UTC e può essere lanciato anche a mano da GitHub Actions.

Lo script `update_data.py` legge il CSV MIMIT `prezzo_alle_8.csv` e prova ad aggiornare benzina, gasolio, GPL e metano. Se la fonte non risponde o cambia formato, mantiene gli ultimi valori precedenti senza inventare dati.

## Limiti attuali

- Le tariffe delle colonnine non hanno un feed pubblico unico nazionale con prezzo €/kWh per ogni operatore. Per questo il sito usa `data/charging.json`, modificabile a mano.
- I prezzi auto sono valori indicativi di partenza: vanno verificati con configuratore/listino ufficiale perché cambiano per allestimento, promo, IPT, messa su strada e mese.
- Il metano nuovo è ormai poco rappresentato nel mercato italiano; alcuni modelli metano nel seed sono trattati come usato/stock e servono per simulazione manuale.
- Non sono ancora modellati valore residuo, assicurazione, interessi finanziamento, pneumatici e incentivi locali.

## Come pubblicare

1. Vai in Settings > Pages del repo.
2. In Build and deployment, scegli GitHub Actions.
3. Lancia il workflow Deploy static site to GitHub Pages oppure fai un push su main.
