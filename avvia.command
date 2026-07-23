#!/bin/bash
# Micheluccio — Giri in centro (Ragusa 3D)
# Doppio clic: avvia il server locale e apre il gioco nel browser.
# (Al primo avvio macOS potrebbe chiedere: tasto destro > Apri)
cd "$(dirname "$0")"
PORT=8000
while lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done
echo "Micheluccio è in moto su http://localhost:$PORT"
echo "Lascia aperta questa finestra mentre giochi; chiudila per spegnere il server."
( sleep 1
  # il tuo profilo Chrome blocca WebGL: apri in Safari (WebGL2 funziona)
  open -a Safari "http://localhost:$PORT"
) &
exec python3 -m http.server "$PORT"
