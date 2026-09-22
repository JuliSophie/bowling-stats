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
- read-only saying catalog and coverage: `/stats/trash-talk` (API: `/api/trash-talk/catalog`, `/api/trash-talk/coverage`)

## Deterministic sayings and local maintenance

Sayings are selected from the enabled German catalog using semantic context and
stable template identities. Browser sessions, routes and random values do not
choose the variant. Missing evidence suppresses unsupported claims. Consistency
requires the same data and compatible app/catalog release; clients refresh on
normal navigation rather than polling. The catalog endpoint is read-only for
the browser; score rendering and corrections do not call an AI service.

Validate or inspect the shipped catalog locally (from `backend`, with the
repository environment active):

```bash
python -m app.trash_talk_cli validate
python -m app.trash_talk_cli coverage
```

The one-time legacy-content migration is deliberately separate from runtime
startup. Run it from the repository root with the captured baseline supplied
explicitly, first without `--write`:

```powershell
node scripts/migrate-legacy-trash-talk.mjs --baseline C:\path\to\legacy-catalog-baseline
node scripts/migrate-legacy-trash-talk.mjs --baseline C:\path\to\legacy-catalog-baseline --write
```

The tool accepts the old `3.0.0` input format and emits protocol `3.1.0`.
It refuses partial or conflicting migration state before opening either output
file; check-only runs are byte-preserving and safe to repeat.

Generation/import are local operator operations. Valid imported/generated
templates automatically become active; invalid candidates remain in batch
history with errors. `python -m app.trash_talk_cli disable <template-or-scenario-id>`
disables content in the local JSON history without deleting history or changing
source files. The browser can inspect batches but cannot generate, activate or
disable anything. Structural validation cannot establish that arbitrary prose
is true or funny; inspect generated wording in the history page.

OpenAI generation is an explicit local command with a dry-run default, model,
current operator-supplied token prices and a shared cumulative USD budget.
No keys or actual player/game data are sent by the browser. Put the key once in
the ignored `backend/.env`; generated-file changes are reviewed with `git diff`
and committed/deployed manually. See the backend README for commands and
cost/failure semantics. Existing Trash-Talk history in an old database is not
automatically migrated, and old expenses are not counted without an explicit
transfer procedure. There is currently no export command. TTS is not implemented.

## Deployment notes

The project has been used with:

- FastAPI behind a reverse proxy
- Next.js frontend on port 3001
- Cloudflare Tunnel / Nginx Proxy Manager style routing

If the frontend uses `/api`, your reverse proxy must forward that prefix to the backend routes.

For more detail, see:

- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)
- [docs/local-bowling-playground.md](docs/local-bowling-playground.md)
