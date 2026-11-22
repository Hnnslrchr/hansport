# hansport

Training, Gesundheit und Coach – als eigenständige Web-App (PWA) auf Vercel.
Aktivitäten und Gesundheitswerte kommen direkt von **Garmin** (Personal API), die Waage von **Withings**,
der Coach nutzt die **Claude-API** mit eigenem Schlüssel. Alle Daten liegen privat im eigenen Vercel-Blob-Speicher
und sind nur nach Anmeldung erreichbar.

## Aufbau

| Teil | Ort |
| --- | --- |
| Oberfläche (Preact, offline-fähig) | `src/`, gebaut nach `public/index.html` |
| Web-spezifische Module (Speicher, Garmin, Withings, Coach) | `src/web/` |
| Serverfunktionen | `api/` (Login, Datenbank, Garmin, FIT, Withings, Coach, Medien, Status) |
| Gemeinsame Serverlogik | `lib/` |
| Zugangsprüfung für alle Seiten und Kartendaten | `middleware.js` |
| Offline-Karte und Relief | `public/map/`, `public/rel/` |

## Umgebungsvariablen (in Vercel eintragen, nie ins Repository)

| Name | Pflicht | Wofür |
| --- | --- | --- |
| `APP_PASSWORD` | ja | Passwort für die Anmeldung (mindestens 16 Zeichen empfohlen) |
| `GARMIN_API_KEY` | ja | Garmin Personal API Key (Garmin Connect → Einstellungen) |
| `ATHLETEDATA_API_KEY` | optional | Gesundheitsdaten (Garmin, Withings) über athletedata statt direkt; Schlüssel unter athletedata.health/dashboard/mcp |
| `ANTHROPIC_API_KEY` | für den Coach | Claude-API-Schlüssel |
| `WITHINGS_CLIENT_ID`, `WITHINGS_CLIENT_SECRET` | für die Waage ohne athletedata | eigene Withings-Entwickler-App, Callback `https://<domain>/api/withings-callback` |
| `SESSION_SECRET` | optional | zusätzlicher Schlüssel für Sitzungen; ändern meldet alle Geräte ab |
| `COACH_MODEL` | optional | Standard `claude-sonnet-5-5` |
| `BLOB_READ_WRITE_TOKEN` | automatisch | kommt von der verbundenen privaten Blob-Ablage |

## Entwickeln

```bash
npm install
npm run build:web        # baut public/index.html, login.html, sw.js, manifest
APP_PASSWORD=test HANSPORT_LOCAL_DATA=/tmp/hsdata npm run dev   # http://localhost:8787
```

Tests (brauchen lokale Testdaten, die nicht im Repository liegen): `npm run test:web` und `node test/web/e2e.mjs ad` (über athletedata).

## Datenschutz

- GPS-Spuren, Gesundheitswerte und Fotos sind privat; ohne Sitzung liefert der Server nichts aus, auch keine Kartenausschnitte.
- Schlüssel zu Garmin, Withings und Claude liegen nur als Umgebungsvariablen auf dem Server.
- Export und Löschen: in der App unter Mehr → Daten.
