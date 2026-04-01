# EV Price Watcher (Sverige)

Fristående projekt för att bevaka ändringar hos:
- Tesla Sverige
- Xpeng Sverige
- BYD Sverige
- Kia Sverige
- Regeringen (elbilspremie/stöd)
- Transportstyrelsen (bonus/malus/premie)

## Funktion
- Kör mot definierade källor.
- Extraherar rader med pris/ränta.
- Sparar snapshot i state.json (eller i sökväg från STATE_PATH).
- Skickar endast kort sammanfattning när något ändrats.
- Inkluderar direktlänk + förenklad TCO-påverkan över 36 månader.

## Lokal körning
1. Gå till projektet:
   cd EV-Price-Watcher
2. Installera beroenden:
   npm install
3. Kör bevakning:
   npm run watch:run

## Webhook
PowerShell:
$env:WEBHOOK_URL="https://din-webhook"
npm run watch:run

## Railway
Den här tjänsten passar som schemalagd worker i Railway.

1. Skapa en Railway-service från detta repo.
2. Ange build/start:
   - Build Command: npm install
   - Start Command: npm start
3. Sätt miljövariabler:
   - WEBHOOK_URL=https://din-webhook
   - STATE_PATH=/data/state.json
4. Montera en persistent volume på /data.
5. Lägg till schedule, till exempel varje timme:
   0 * * * *

Utan persistent volume kommer state att nollställas mellan containers, och då kan tjänsten tolka allt som nya ändringar.
