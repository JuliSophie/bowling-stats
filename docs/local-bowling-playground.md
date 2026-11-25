# Lokaler Live-Testspielplatz

Der Playground startet eine isolierte FastAPI-Instanz und die vorhandene Next.js-Live-Seite.
Der Debug-Client unter `http://127.0.0.1:8317/debug` erzeugt Sessions und sendet echte
`/api/tracking/mock-throws`-Requests; die Live-Seite empfängt die Broadcasts über WebSocket.
Die Antwort enthält ein Companion-Token, das der Client nur verwirft und nicht anzeigt.

## Start

Aus dem Repository:

```powershell
.\scripts\bowling-playground.ps1 start
```

## Ausprobieren

1. [Debug-Client öffnen](http://127.0.0.1:8317/debug) und **Neue Session erstellen** wählen.
2. **Live-Seite öffnen** anklicken oder [die Live-Seite](http://127.0.0.1:4317/live)
   in einem zweiten Fenster öffnen. Dort den angezeigten sechsstelligen Code eingeben.
3. In der Live-Seite einmal **Ton testen** anklicken. Diese Browser-Geste ist für Audio nötig.
4. Im Debug-Client einzelne Würfe senden oder **Strike**, **Spare**, **Double** und
   **Turkey** ausprobieren. Mehrwurf-Presets benötigen einen einzelnen Spieler und
   einen neuen Frame; unmögliche Pinzahlen sind deaktiviert. **Spiel zurücksetzen**
   bricht auch eine laufende Folge ab.

Die Bahnkurve und Geschwindigkeit sind synthetische Testwerte, keine Kameramessung.
Der Companion muss dafür nicht laufen. Nach einem Backend-Neustart eine neue Session
erstellen und erneut koppeln; gespeicherte Testspiele bleiben in der separaten Datenbank.

## Stoppen

Das Startskript beaufsichtigt beide Server und bleibt im Vordergrund aktiv.
Die Kindprozesse öffnen keine leeren Terminalfenster; ihre Ausgabe steht in den Logs.
Zum Stoppen in einem zweiten Terminal aus dem Repository:

```powershell
.\scripts\bowling-playground.ps1 stop
```

Standardmäßig sind ausschließlich `127.0.0.1:8317` (Backend) und `127.0.0.1:4317`
(Frontend) erlaubt. Die Testdatenbank und Logs liegen außerhalb des Repositories unter
`%LOCALAPPDATA%\BowlingStatsPlayground`; sie werden für Fehlersuche behalten.
Ein belegter Port oder ein Neustart des Backends erfordert einen neuen Playground-Start
beziehungsweise eine neue Session. Es werden keine Produktions-`.env`-Dateien verändert.

## Nuxt-Spieleübersicht (isolierter Pilot)

Die Nuxt-Demo ist **nicht** Teil dieses Backend-Playgrounds und verwendet keine
Backend- oder Produktions-API. Sie wird separat aus `frontend-nuxt` gestartet:

```powershell
cd frontend-nuxt
npm install
npm run dev                 # http://127.0.0.1:4318
npm run generate            # statische Ausgabe unter .output/public
npm run preview             # statische SPA lokal auf 127.0.0.1:4318
```

Die statische Ausgabe kann von einem beliebigen Static Host mit SPA-Fallback
ausgeliefert werden. `NUXT_PUBLIC_LEGACY_ORIGIN` ist optional und aktiviert nur
explizite Navigation zur bestehenden Anwendung; ohne diese Variable bleiben
nicht verfügbare Ziele ehrlich deaktiviert.

Die vollständige Spieleübersicht, ihre Grenzen, der komponentenbezogene
CSS-Aufbau und die Trennung von statischem Frontend und FastAPI sind in
[frontend-nuxt/README.md](../frontend-nuxt/README.md) beschrieben. Der Pilot
ersetzt keine laufende Anwendung und verändert kein Serverskript.
