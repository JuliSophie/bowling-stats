# Bowling Stats Backend

FastAPI backend fuer OCR-Upload, persistierte Bowling-Spiele und Dashboard-Statistiken.

## Entwicklung

1. Virtuelle Umgebung anlegen.
2. `pip install -r requirements.txt`
3. `.env.example` nach `.env` kopieren und bei Bedarf anpassen.
4. `uvicorn app.main:app --reload --port 8001`

## Wichtige Endpunkte

- `POST /upload` OCR-Entwurf aus einem Bowling-Monitorfoto erzeugen
- `POST /games` bestaetigtes Spiel speichern
- `GET /stats` Dashboard-Daten abrufen
