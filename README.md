# Nachweismat – Stundennachweis-Generator

Eine kleine, reine JavaScript-Webanwendung, die monatliche Stundennachweise
erzeugt und als **Excel-Datei (.xlsx)** zum Download bereitstellt.

## Funktionen

- **Zeitraum** frei wählbar (Anfangs- und Endmonat/-jahr)
- **Feiertage aller 16 Bundesländer** sind eingebaut (inkl. beweglicher
  Feiertage über die Osterformel, Buß- und Bettag etc.)
- **Soll-Arbeitszeit** wahlweise pro Woche oder pro Monat
- **Krankheitstage** werden zufällig über den Zeitraum verteilt und als
  „Krank“ ausgewiesen
- **Urlaub** wahlweise als konkrete Zeiträume (z. B. `15.07.2025 - 26.07.2025`)
  oder als feste Anzahl Tage pro Monat; bei hinterlegtem **Urlaubsanspruch**
  wird der verbleibende Resturlaub automatisch berechnet
- **Realistische Stunden**: volle Stunden mit natürlicher Schwankung
  (nicht jeden Tag exakt 8 Stunden)
- **Excel-Export**: ein Tabellenblatt pro Monat plus Übersichtsblatt

## Lokal starten

Variante A – ohne Build (CDN-Fallback für Excel):

```bash
npx --yes serve -l 8080 .
# öffne http://localhost:8080
```

Variante B – mit lokal eingebundener Excel-Bibliothek (offline):

```bash
npm install
npm run setup     # kopiert xlsx nach vendor/
npm start
```

## Mit Docker

```bash
docker build -t nachweismat .
docker run --rm -p 8080:80 nachweismat
# öffne http://localhost:8080
```

Oder mit Docker Compose:

```bash
docker compose up --build -d
# öffne http://localhost:8080
docker compose down   # stoppen
```

Der Docker-Build bindet SheetJS lokal ein – die App funktioniert damit
vollständig offline.

## Projektstruktur

```text
index.html          Oberfläche + Werbe-Header
css/style.css       Styling
js/holidays.js      Feiertagsberechnung je Bundesland
js/app.js           Logik, Stundenverteilung, Excel-Export
Dockerfile          Multi-Stage-Build (Node -> nginx)
nginx.conf          Statisches Hosting
```

## Hinweis

Die Feiertagsangaben erfolgen ohne Gewähr. Das Werkzeug dient der eigenen
Dokumentation.
