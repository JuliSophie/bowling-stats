# Nuxt Spieleübersicht (Pilot)

Die isolierte Nuxt-4-SPA ist ein synthetischer, statisch generierbarer Web-Pilot.
Sie verwendet ausschließlich `public/fixtures/games.json` und ruft keine
Produktions- oder Backend-API auf. `NUXT_PUBLIC_LEGACY_ORIGIN` aktiviert
ausdrückliche Links zur bestehenden Next-Anwendung (nur `http`/`https`);
synthetische IDs werden niemals dorthin verlinkt.

```powershell
npm install
npm run dev                 # http://127.0.0.1:4318
npm run typecheck
npm test
npm run generate            # .output/public, ohne Nuxt-Node-Runtime hostbar
npm run preview             # loopback static SPA preview on 127.0.0.1:4318
npm run e2e                 # against the generated static output
npm run generate:subpath    # optional /pilot/ base-path build
npm run e2e:subpath         # browser gates against that /pilot/ build
```

Die beiden `:subpath`-Skripte verwenden Windows-Umgebungssyntax. Nach diesem
Vergleich erneut `npm run generate` ausführen, bevor die normale Root-Vorschau
gestartet wird. `e2e` startet seinen eigenen lokalen Vorschauprozess; eine bereits
laufende Vorschau vorher beenden. Screenshots liegen standardmäßig unter
`test-results\screenshots`; `PILOT_SCREENSHOT_DIR` kann ein anderes Ziel vorgeben.

## Was tatsächlich portiert ist

Die Route `/stats/games` zeigt einen zusammenhängenden Verlauf aus Tagesgruppen,
Tages- und Spielsiegern, die
aufklappbaren Spielkarten, Punkteverläufe mit PB-/Open-Frame-Optionen sowie die
Frame-Tabelle mit Split-Anzeige. Es gibt sieben erfundene Spiele; eines enthält
absichtlich nur teilweise erfasste Frames. Detailseiten, Bearbeitung, Upload,
Live-WebSocket und Anmeldung sind nicht portiert.

Jeder Tag bietet zwei unabhängige Aktionen: **Spiele anzeigen** öffnet die
Spielkarten und **Tagesauswertung** blendet eine klar markierte
**VORSCHAU** ein. Diese Vorschau summiert die synthetischen Tagesergebnisse
über `dayPlayers`; sie ist keine simulierte Detailseite oder API-Funktion.
Die Pilotnavigation bündelt Spieltage und Spiele unter **Verlauf**; eine
konfigurierte Tagesansicht des Bestands bleibt separat verlinkt.

ECharts und vue-echarts übernehmen die Diagrammdarstellung. Reine Berechnungen
werden aus `frontend\lib\game-chart-data.ts`, `frame-utils.ts` und `excitement.ts`
geteilt, nicht als zweite Vue-spezifische Scoring-Implementierung kopiert.
Die bestehende React-Darstellung bleibt erhalten.

Die zentralen Vue-Bausteine unter `app\components` sind:

- `UiCard.vue` und `ScoreChips.vue`: gemeinsame Oberflächen und Ergebnisanzeigen.
- `GameDayPreviewCard.vue` und `GamePreviewCard.vue`: Gruppierung und Aufklappen.
- `GameChart.vue`, `ScoreTable.vue` und `SplitPatternPopover.vue`: Visualisierung.
- `PilotNavigation.vue`: gemeinsame Desktop-/Mobilnavigation.

Dieser Pilot demonstriert **Vue Scoped CSS**, nicht eine weitere
Tailwind-Einführung. `app\assets\css\main.css` enthält nur die gemeinsame Basis
und semantische Hell-/Dunkel-Variablen; Komponenten besitzen ihre eigenen Styles.
Das bestehende Tailwind-Frontend und dessen Abhängigkeiten werden nicht ersetzt.
Aufklappzustände leben nur im Browser-Arbeitsspeicher und setzen sich beim
Neuladen zurück. Die ausdrückliche Theme-Auswahl bleibt in `bowling-theme`.

## Hosting: aktueller Bestand und mögliche Ablösung

Der Build ist unabhängig vom Backend. Für einen statischen Host müssen der
konfigurierte Base-Pfad und SPA-Fallback auf `index.html` zusammenpassen.
Die Demo-Daten sind frei erfunden und nicht aus der Datenbank exportiert.

Im vorhandenen Repository ist ein Next.js-Server mit `next build` und
`next start --port 3001` konfiguriert. FastAPI ist davon getrennt. Die
Proxy-Konfigurationen sind Beispiele mit abweichenden Ports; das produktive
Build-/Neustartskript befindet sich nur auf dem Hostingserver und wurde nicht
eingesehen. Daraus folgt keine verifizierte Aussage über dessen aktive Dienste.

Für eine spätere **statische** Nuxt-Ablösung könnte die Auswahl so bleiben:

| Auswahl | Frontend | Backend |
|---|---|---|
| Frontend | Generieren und `.output\public` als zusammengehöriges Release veröffentlichen | Unverändert |
| Backend | Unverändert | Bestehenden FastAPI-Build-/Restartpfad ausführen |
| Beides | Frontend-Release veröffentlichen | Backend aktualisieren, API-Kompatibilität beachten |

Für dieses statische Modell braucht das ausgelieferte Frontend keinen
dauerhaft laufenden Nuxt-/Node-Prozess. Node wird weiterhin zum Bauen benötigt.
Die einmalige Static-Host-/Proxy-Einrichtung ersetzt nicht die API-Anbindung:
Authentifizierung, API-Routing und WebSocket-Weiterleitung wären vor einer echten
Ablösung separat zu prüfen. Der Pilot liest ausschließlich seine JSON-Fixture.

Würde später SSR oder eine Nuxt-Server-API eingesetzt, wäre stattdessen ein
laufender Nitro-Server nötig. Das ist **nicht** die gewählte Pilotkonfiguration.
Weder das Serverskript noch ein produktiver Dienst wurden verändert.
