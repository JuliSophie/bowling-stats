# Bowling Stats Frontend

Next.js frontend for the OCR upload flow, score review, saved-game stats, and player detail pages.

## Responsibilities

- upload a score monitor image
- let the user adjust the detected monitor corners
- show the rectified OCR preview and line debug image
- review and edit OCR results before saving
- remove unwanted OCR rows before saving
- browse saved games and player statistics
- rename players from the player detail page
- provide homescreen install metadata and icons

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Recharts

## Development

```bash
cd frontend
npm install
copy .env.local.example .env.local
npm run dev
```

The dev server runs on `http://localhost:3001`.

## API base URL

The frontend uses:

- `NEXT_PUBLIC_API_BASE` when it is defined
- otherwise `/api`

For local direct backend access, the example env uses:

```env
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8001
```

In a reverse-proxy setup, `/api` should be forwarded to the backend.

## Main areas

### Upload flow

- choose image
- detect corners
- adjust corners manually
- preview rectified image
- extract OCR result
- edit names and frames
- delete empty/unwanted OCR rows
- save the game

### Stats view

- player overview list
- player detail page with score trend and per-player stats
- game charts and social/group stats
- player rename action on the detail page

### Companion-Kalibrierung

Zoomanzeige und Zoomregler sowie „Kalibrieren“ und „Bahn übernehmen“ befinden sich
ausschließlich im Overlay „Kalibrierung öffnen“. Der Zoomregler unterstützt Maus,
Touch und Tastatur. Befehlsrückmeldungen werden auch direkt im Overlay angezeigt.
Akku/Bereitschaft, „Pins markieren“ und „Track löschen“ bleiben im normalen
Companion-Bereich. Ohne Live-/Companion-Verbindung sind die Setup-Steuerungen deaktiviert.

### Live-Effekte und Ton

Neue, live eintreffende Würfe werden nur einmal hervorgehoben: Der werfende Spieler erhält
einen kurzen Licht-Sweep und die Score-Zelle poppt auf. Spares und Strikes zeigen zusätzlich
eine sequenzierte SPARE-/STRIKE-, DOUBLE- oder TURKEY-Einblendung. Historische Daten,
Reconnect-Snapshots, Duplikate und Korrekturen lösen keine Effekte aus. Die Animationen
laufen einzeln in einer kleinen Warteschlange und respektieren `prefers-reduced-motion`.
Die Ergebnisanzeige aktualisiert sich dabei sofort. Bei einem neuen Wurf mit Kurvendaten
zeichnet sich die gemessene Bahn in 0,9 Sekunden, während ein runder Ball ihr bis zum
Pin-Deck folgt. Erst am Ende der Fahrt erscheint das Ergebnis; fehlen Kurvendaten,
erscheint es sofort. Bei bekanntem Pin-Muster reagieren die getroffenen Pins
kurz auf den Einschlag.
Ein schwebendes Overlay direkt über der Bahn erscheint und verblasst, ohne Platz im
Layout zu reservieren oder Klicks auf die Bahn abzufangen. Das gilt für die mobile
und die Desktop-Ansicht.
Die Einblendung hat keine Hintergrundfläche: Große Schrift mit Kontur und Schatten
bleibt über der Bahn lesbar. Spare trägt eine silberne Krone mit drei Sternen,
Strike eine goldene; Double und Turkey werden stufenweise größer.
Normale Würfe zeigen die jeweilige Pinzahl (auch 0) ohne Krone. Null Pins wackeln
kurz, kleine Zahlen gleiten herein, mittlere klappen auf und hohe Zahlen landen
mit einem kurzen Nachfedern. Die Pinzahl wird auch für Bildschirmleser benannt.
Die gesamte Sequenz dauert 3 Sekunden (Pinzahl), 4 Sekunden (Spare/Strike)
beziehungsweise 5 Sekunden (Double/Turkey); die Ballfahrt ist darin enthalten.
Schrift und Kronen sind besonders groß.
Die Einblendung zoomt aus einem Punkt auf und schrumpft am Ende zum selben Punkt
zurück. Dazwischen „atmen“ Schrift und Krone sanft
(7 % Größenänderung in 1,8 Sekunden pro Richtung), ohne ihre Position zu verändern.
Abgestimmte Bézier-Kurven beschleunigen und bremsen die Bewegungen weich ab.
Die Atmung beginnt bereits 0,2 Sekunden vor dem Ende des Aufzoomens, damit der
Übergang ohne Stillstand ineinanderfließt.
Normale Pinzahlen bleiben auf schmalen Geräten über der Bahn; die längeren Sonderergebnisse
dürfen über die Bahn hinausragen, bleiben aber innerhalb des Bildschirms.
Der Spruch erscheint nach der Ballfahrt. Bei reduzierter Bewegung bleibt die Kurve stehen, der
Ball bewegt sich nicht und das Ergebnis erscheint per Überblendung.
Die Ergebnisdialog-Anzeige wartet laufende Wurfeffekte ab.
Spielneustart und Sessionwechsel verwerfen laufende und wartende
Effekte. Strike-Serien berücksichtigen auch die Historie und korrigierte Ergebnisse.

Der Sprüche-Katalog wird erst nach offener Live-Verbindung als eigener Client-Baustein
geladen. Trifft vorher ein Wurf ein, bleibt Score und Ballverlauf sofort sichtbar und
der Spruch lautet zunächst „Wurf registriert.“. Ein später eintreffender Katalog
ändert nur noch vorhandene Sprüche; gelöschte Würfe werden nicht wieder eingeblendet.
Beim Wiederbeitritt übernimmt der erste WebSocket-Snapshot die Event-Historie;
eine zusätzliche HTTP-Abfrage vor dem Verbindungsaufbau entfällt.

Pinbezogene Live-Sprüche verwenden nur belegte Würfe desselben Spielers im
aktuellen Spiel. Ein „Stammgast“-Pin braucht mindestens drei frühere
Einzelpin-Fehlversuche mit diesem Pin und muss die bisherigen Einzelpin-Misses
deutlich anführen. Eine „Standardseite“ setzt mehrere erfolgreiche
Einzelpin-Spareversuche auf dieser Seite und belegte Fehlversuche auf der
Gegenseite voraus. Links zählen die Pins 2/4/7/8, rechts 3/6/9/10; 1 und 5
liegen in der Mitte. Unvollständige Pin-Muster bleiben bei allgemeineren
Sprüchen. Gespeicherte Spiele werden für diese beiden Aussagen nicht
herangezogen. Gleichnamige Spieler bleiben über ihre Spielerposition getrennt;
auch Strike-Serien werden nicht zwischen ihnen geteilt.

Die übrigen Live-Sprüche unterscheiden niedrige, mittlere und hohe erste Würfe
mit belegbarer Restpinzahl, späte offene Frames sowie Double, Turkey und längere
Strike-Serien desselben Spielers. Ein benannter Gegner erscheint nur bei genau
zwei verschieden benannten Spielern; daraus wird kein endgültiger Rang abgeleitet.
„Na ja“ und „Immerhin“ vergleichen nur erste Würfe desselben Spielers im
aktuellen Spiel: mindestens drei frühere erste Würfe und mindestens zwei Pins
Abstand zum bisherigen Schnitt. Ohne diesen Beleg gilt der allgemeine
Pinzahl-Spruch, nicht eine dauerhafte Bewertung des Spielers.

Zum Anpassen: In `components/live-throw-result.tsx` steuern `THROW_TRAVEL_MS`
und `THROW_EFFECT_DURATION` Fahrt und Gesamtdauer je Wurftyp (alle Werte in
Millisekunden; die Gesamtdauer muss Fahrt, Ein- und Ausblenden umfassen).
In `app/globals.css` steuert `animation-timing-function` bei
`.live-effect-banner` die Zoom-Kurven, `.live-effect-breath` das Atemtempo und
`@keyframes live-effect-breathe` dessen Stärke (`scale(0.93)` entspricht −7 %).
Die Klassen `.live-effect-banner`, `.live-effect-throw`, `.live-effect-double`
und `.live-effect-turkey` enthalten die Schriftgrößen.

Jeder neue Live-Wurf löst sofort einen dezenten, aufsteigenden Klang aus,
unabhängig von wartenden Animationen. Normale Würfe spielen zwei weiche Sinustöne
(A5 und C#6, eine große Terz). Spare ergänzt E6 zu drei Tönen; Strike, Double und
Turkey ergänzen zusätzlich A6 zu vier Tönen. Der letzte Ton bleibt jeweils kurz
stehen und klingt länger weich aus. Gesamtdauer: 0,82 / 0,97 / 1,12 Sekunden.
Getrennte Lautstärke-Hüllkurven ersetzen den gleitenden „Bloop“.
„Ton testen“ spielt den Zweiklang.
Historie, Duplikate und der spätere Start einer wartenden Animation erzeugen keinen weiteren Ton.
Der Browser benötigt dafür einmalig eine Benutzeraktion: Beim Koppeln wird Audio bereits
aktiviert. Nach automatischer Session-Wiederherstellung oder einer Audio-Unterbrechung
steht bei Bedarf „Ton aktivieren“ bereit; danach heißt der Button „Ton testen“.
Ohne diese Benutzeraktion erzeugt ein eintreffender Wurf keinen AudioContext.
Die normale Autoplay-Sperre erzeugt keinen wiederkehrenden Warntext.
Lautstärke und Stummschaltung lassen sich im Live-Statusbereich ändern und werden lokal
im Browser gespeichert. Nicht unterstützte Audio-Wiedergabe und echte Aktivierungsfehler
werden weiterhin sichtbar angezeigt.
Der Standardpegel beträgt 85 % bei einer maximalen Signalamplitude von 0,7
(vorher 0,18). Es spielt immer nur ein Ton gleichzeitig. Bei 0 % oder Stummschaltung
bleiben auch Testtöne stumm.

Die Wurfklassifikation lässt sich mit Node.js 22.6+ prüfen:
`node --experimental-strip-types --test lib/live-effects.test.mjs`.

## Homescreen install

The frontend includes:

- app icon metadata
- Apple touch icon generation
- web manifest metadata for standalone install

## Notes

- error responses from the API are logged with request URL and HTTP status in the browser console
- the OCR review table is intentionally editable inline; no separate edit mode is required for names or frame values
