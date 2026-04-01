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
- Visar all insamlad info i en webapp.
- Uppdateras automatiskt med angivet intervall.
- Inkluderar direktlänk + förenklad TCO-påverkan över 36 månader.

## Lokal körning
1. Gå till projektet:
   cd EV-Price-Watcher
2. Installera beroenden:
   npm install
3. Starta webappen:
   npm start
4. Öppna:
   http://localhost:3000

## Miljövariabler
- PORT (valfri): standard 3000
- REFRESH_MINUTES (valfri): standard 60, minsta tillåtna 5
- STATE_PATH (valfri): t.ex. /data/state.json i Railway med volume

## Railway
Den här tjänsten körs som web service i Railway.

1. Skapa en Railway-service från detta repo.
2. Ange build/start:
   - Build Command: npm install
   - Start Command: npm start
3. Sätt miljövariabler:
   - REFRESH_MINUTES=60
   - STATE_PATH=/data/state.json
4. Montera en persistent volume på /data.
5. Öppna den publika Railway-URL:en för att se dashboarden.

Utan persistent volume kommer state att nollställas mellan omstarter.

## Engångskörning i terminal
Om du vill köra en manuell engångsskanning utan webapp:
npm run watch:run
