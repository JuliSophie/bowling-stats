# Bowling Stats

Bowling Stats is a two-part app for capturing bowling scores from monitor photos, reviewing the OCR result, storing games, and browsing player statistics.

The project consists of:

- a FastAPI backend in `backend/`
- a Next.js frontend in `frontend/`

## Current feature set

- upload a monitor photo
- detect the monitor corners
- manually adjust the four corners
- generate a rectified black/white preview and line debug view
- extract player names and frame values with OCR
- review and edit OCR output before saving
- delete unwanted OCR rows before saving
- store games in SQLite
- browse player and group statistics
- rename players from the player detail page
- merge players automatically when the full normalized name already exists

## Tech stack

- frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, Recharts
- backend: FastAPI, SQLAlchemy, SQLite
- OCR/image processing: OpenCV, EasyOCR, NumPy

## Project structure

```text
.
|- backend/
|  |- app/
|  |- requirements.txt
|  `- README.md
|- frontend/
|  |- app/
|  |- components/
|  |- lib/
|  `- README.md
`- README.md
```

## Local development

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8001
```

### Frontend

```bash
cd frontend
npm install
copy .env.local.example .env.local
npm run dev
```

Frontend dev runs on `http://localhost:3001`.

By default the frontend expects the API at `/api`. For local development you can point it directly at the backend with `NEXT_PUBLIC_API_BASE=http://127.0.0.1:8001`.

## Runtime behavior

- the backend creates SQLite tables on startup
- there is currently no migration system
- EasyOCR needs a writable cache/model directory; `BOWLING_TEMP_DIR` can be used to control that location
- the first OCR run on a fresh machine can take longer because EasyOCR may download models

## Player name matching

Player matching uses the full normalized name:

- leading and trailing whitespace is removed
- repeated internal spaces are collapsed to a single space
- comparison is case-insensitive

Examples:

- `Chris`, `chris`, and ` CHRIS ` are the same player
- `Chris Miller`, `chris miller`, and `chris     miller` are the same player
- `Chris` and `Chris Miller` are different players

Renaming a player to an already-existing normalized full name merges the two players.

## Main API areas

- upload flow: `/upload/corners`, `/upload/rectify`, `/upload/extract`
- game storage: `/games`
- player rename/merge: `/players/rename`
- statistics: `/stats`

## Deployment notes

The project has been used with:

- FastAPI behind a reverse proxy
- Next.js frontend on port 3001
- Cloudflare Tunnel / Nginx Proxy Manager style routing

If the frontend uses `/api`, your reverse proxy must forward that prefix to the backend routes.

For more detail, see:

- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)
