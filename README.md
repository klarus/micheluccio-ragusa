# Micheluccio — Giri in centro (Ragusa 3D)

Prototipo di videogioco 3D che gira nel browser: **Micheluccio**, calvo e con giubbotto
Ducati rosso, gira in moto per il centro di **Ragusa** (Ragusa Superiore + Ibla).
La città — vie, sagome e altezze degli edifici, piazze — è ricostruita dai dati reali di
**OpenStreetMap** (9.279 edifici, 1.216 strade, 11 piazze).

## Avvio

I moduli JavaScript non funzionano aprendo `index.html` con doppio clic: serve un
piccolo server locale.

```bash
cd micheluccio-ragusa
python3 -m http.server 8000
```

Poi apri **http://localhost:8000** nel browser.

## Comandi

| Tasto | Azione |
|---|---|
| W / ↑ | accelera |
| S / ↓ | frena |
| A / ← · D / → | sterza |
| SPAZIO | freno a mano (curve più strette) |
| C | cambia camera (ravvicinata / lontana / onboard) |
| M | audio on/off |
| R | torna al punto di partenza |

Si parte vicino alla Cattedrale di San Giovanni Battista; da lì puoi scendere verso
Ragusa Ibla o girare per il centro.

## Struttura

- `index.html` — pagina, HUD e overlay di avvio
- `js/main.js` — loop di gioco, fisica arcade, camera, minimappa, audio
- `js/city.js` — costruzione delle mesh della città + collisioni (senza DOM, testabile in node)
- `js/bike.js` — modello low-poly di Micheluccio e della sua sportiva
- `tools/fetch_osm.py` — scarica i dati da OpenStreetMap (Overpass API) e genera `data/city.json`
- `tools/smoke.mjs` — test senza browser: `node tools/smoke.mjs`

Per rigenerare i dati della città: `python3 tools/fetch_osm.py`

## Limiti noti

- Terreno piatto: le colline e i dislivelli di Ragusa non sono (ancora) modellati.
- Niente traffico né pedoni: la città è tutta per Micheluccio.

## Note legali

- "Ducati" è un marchio di Ducati Motor Holding: progetto personale, non commerciale,
  nessuna affiliazione.
- Dati geografici © OpenStreetMap contributors, licenza ODbL.
