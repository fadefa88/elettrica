# Elettrica

Sito statico per capire se un'auto elettrica conviene rispetto a diesel o benzina.

## Cosa include

- simulatore TCO elettrica vs diesel/benzina;
- prezzo carburante al litro aggiornabile ogni giorno via GitHub Actions;
- costo al km EV con ricarica domestica, pubblica e quota fotovoltaico;
- bollo EV esente per 5 anni, poi costo configurabile;
- manutenzione EV e termica configurabile;
- catalogo iniziale di BEV vendibili/comuni in Italia;
- deploy GitHub Pages.

## File principali

```text
index.html
styles.css
app.js
data/prices.json
data/charging_tariffs.json
data/cars_ev.json
scripts/update_data.py
.github/workflows/update-data.yml
.github/workflows/pages.yml
```

## Aggiornamento prezzi

Il workflow `Update dynamic vehicle cost data` parte ogni giorno alle 06:17 UTC e può essere lanciato anche a mano da GitHub Actions.

Lo script prova a leggere gli open data ministeriali `prezzo_alle_8.csv` per benzina e gasolio. Se la fonte non risponde o cambia formato, mantiene i valori precedenti e non rompe il sito.

## Limiti attuali

- Le tariffe delle colonnine non hanno un feed pubblico unico nazionale con prezzo €/kWh per ogni operatore. Per questo il sito usa `data/charging_tariffs.json`, modificabile a mano.
- Il catalogo auto è un seed iniziale: prezzi, consumi e autonomie sono indicativi e vanno verificati con listino/preventivo reale.
- Non sono ancora modellati valore residuo, assicurazione, interessi finanziamento, pneumatici e incentivi locali.

## Come pubblicare

1. Vai in **Settings → Pages** del repo.
2. In **Build and deployment**, scegli **GitHub Actions**.
3. Lancia il workflow `Deploy static site to GitHub Pages` oppure fai un push su `main`.

