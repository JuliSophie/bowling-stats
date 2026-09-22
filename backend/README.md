# Bowling Stats Backend

FastAPI backend for OCR extraction, game storage, player rename/merge handling, and statistics.

## Responsibilities

- validate and process uploaded score monitor images
- detect monitor corners
- build rectified preview images
- extract player names and frame values from the score table
- persist games and scores in SQLite
- aggregate statistics for the frontend dashboard
- rename players and merge them when the normalized full name already exists

## Stack

- FastAPI
- SQLAlchemy
- SQLite
- OpenCV
- EasyOCR
- NumPy

## Development

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8001
```

On Linux/macOS, activate the venv with `source venv/bin/activate`.

## Environment

Settings are loaded from `backend/.env` (independent of the current directory).

Important settings:

- `BOWLING_DATABASE_URL`: SQLite database location
- `BOWLING_CORS_ORIGINS`: allowed frontend origins
- `BOWLING_TEMP_DIR`: writable temp/model cache directory for OCR runtime files
- `BOWLING_ENVIRONMENT`: optional environment label

Notes:

- tables are created automatically on startup
- there is no migration layer yet
- EasyOCR needs a writable cache directory; if permissions are wrong, OCR extraction can fail

## Main routes

### Trash-talk v3

All routes below are GET-only under `/api/trash-talk` and use the application's
existing authentication boundary:

- `/catalog`: built-in scenarios plus enabled generated templates, stable IDs
  and a content release digest.
- `/coverage`: enabled template counts, empty/thin scenario warnings and bindings.
  This measures catalog coverage, not proof that every scenario is reachable
  in every real game.
- `/batches?limit=50&offset=0` and `/batches/{id}`: persisted generation/import
  history, validation errors, enabled state and usage/cost metadata.

Generated batches and disabled IDs are stored in the committed
`app/data/trash-talk/generated.json` snapshot; the built-in `catalog.json` is
unchanged. There are no browser mutation or AI-generation endpoints. Live/game rendering,
pin corrections and coverage checks make no AI calls.

### Local content maintenance

Run from `backend` using the project's virtual environment. Normal commands do
not read or write the bowling database and use the JSON snapshot. Import,
disable, and `generate --execute` take an advisory writer lock and write an
atomic replacement. `validate`, `coverage`, and generation dry-runs are
read-only. The key is loaded automatically from the ignored `backend/.env`;
normal generation does not require a `BOWLING_DATABASE_URL` step.

```powershell
.\venv\Scripts\python.exe -m app.trash_talk_cli validate
.\venv\Scripts\python.exe -m app.trash_talk_cli coverage
.\venv\Scripts\python.exe -m app.trash_talk_cli import .\candidates.json
.\venv\Scripts\python.exe -m app.trash_talk_cli disable live.open
```

Legacy v1/v2 content is migrated separately from the repository root. Supply
the captured baseline explicitly and run the check before `--write`:

```powershell
node scripts/migrate-legacy-trash-talk.mjs --baseline C:\path\to\legacy-catalog-baseline
node scripts/migrate-legacy-trash-talk.mjs --baseline C:\path\to\legacy-catalog-baseline --write
```

Both old `3.0.0` and current `3.1.0` input catalogs are accepted. Partial,
conflicting, or field-present-but-null migration state is rejected before
either output is written. The check-only operation and a completed migration
are idempotent; the generated snapshot remains a separate protocol `3.0.0`
file.

Deploy frontend and backend together: the consolidated catalog uses protocol
`3.1.0` and requires the `legacyV2` envelope. Mixed old/new releases are rejected
explicitly instead of silently dropping legacy commentary. A serving process
must be restarted to load changed backend code; save any in-memory live session
before restarting it.

Runtime projections may contain enabled pools with no remaining active templates.
Those pools are skipped during selection, not treated as an invalid catalog.
Legacy live pools also project `templateSelectionIds`, preserving their original
selection keys when individual occurrences are disabled.

Live commentary distinguishes unavailable pin positions (`null` or an omitted
field) from an explicitly observed empty list (`[]`). Count-only corrections
preserve unknown identities; pattern corrections require an explicit array.
Unknown positions are not removed from per-delivery arrays when saving a game.

Post-strike/spare one-pin throws can use the group's French flavor; zero-pin
follow-ups can use Paris flavor, alongside ordinary variants. This includes
legal tenth-frame rack resets and follows player identity across interleaved
turns. Leader wording is explicitly provisional: earned points include only
known bonus contributions, and players may be at different stages. Unknown or
illegal recorded deliveries suppress these contextual claims. Later throws and
corrections re-evaluate existing captions without replaying animations.

`testdata\live-commentary-content-revision.json` records the intentional live-text
revision. Restoring its archived changed pool reconstructs the original core
hash; separate hashes protect the new content. The original legacy golden data
and generated-history ledger are not rewritten.

Import format (known scenario IDs only):

```json
{
  "candidates": [
    {"scenario_id": "live.strike", "text": "Strike. Die Pins machen geschlossen Feierabend."}
  ]
}
```

Candidates are validated independently and enabled automatically if valid.
Invalid entries remain visible but inactive. Disabling accepts a template ID
from `/catalog` or a whole scenario ID. Base template IDs are content-addressed;
generated IDs belong to their immutable batch. No approval roles are introduced.
The validator checks allowed placeholders, lengths, duplicate text and known
scenarios; it cannot prove natural-language truth. Inspect history afterward.

`generate SCENARIO --model MODEL --count 10 --max-output-tokens 4096
--input-usd-per-million PRICE --output-usd-per-million PRICE
--total-budget-usd BUDGET` prints a dry-run plan. Replace MODEL/PRICE/BUDGET with
an explicitly chosen supported OpenAI Responses model, its verified current USD
prices per million tokens and the total budget. No default prices are assumed.
Only adding `--execute` enables a paid call; set `OPENAI_API_KEY` in the ignored
`backend/.env` or local process without committing it. The server does not need
an API key to serve the catalog/history.

The request contains only deliberately authored synthetic writing instructions
and allowed placeholders, not repository files or actual game/player data.
One invocation makes at most one request; timeout/invalid-output failures are
recorded and never retried automatically. The JSON file reserves a conservative estimated maximum before dispatch under a
file lock. The budget is cumulative over this clone's OpenAI batch history, not
monthly or global-provider state; increasing it is an
explicit operator action. Ambiguous requests retain the reservation until
their costs are known. Recorded USD amounts use supplied prices, not an invoice
guarantee; changing provider prices requires updating the operator inputs.

The initial committed `generated.json` is intentionally empty. It is not an
automatic reset mechanism and must not replace an existing operator ledger.
Previously stored Trash-Talk records in an old SQLite database are not migrated,
and old expenses are not counted, unless they are explicitly transferred by a
separate approved procedure. There is currently no export command.

### Scoring evidence

Saved-score responses include optional `trash_talk_evidence`. Complete, legal
rolls must reconcile with the stored total before exact what-if claims qualify.
The service reuses the live scorer and recalculates the entire game, including
earlier strike bonuses, for one extra second-throw pin in frames 1–9. Frame 10
does not invent an unrecorded bonus throw. An 8+1 frame is not labelled a missed
single-pin attempt. Invalid/missing pin sets suppress pin identities, not
independently valid total-score evidence.

The companion's per-delivery pin-number sets survive explicit game saving in
`frames[].fallenPins`. OCR uploads have no such evidence. These are known pin
identities, not persisted camera coordinates.

### Health

- `GET /health`

### Upload / OCR

- `POST /upload/corners`
  - accepts an image file
  - returns guessed monitor corners

- `POST /upload/rectify`
  - accepts an image file plus four manual corners
  - returns the rectified black/white preview and line debug image

- `POST /upload/extract`
  - accepts an image file plus four manual corners
  - optional `bw_threshold`
  - returns extracted players and frame values

### Games

- `GET /games`
- `POST /games`

### Players

- `PATCH /players/rename`
  - renames a player
  - merges into an existing player when the normalized full name already exists

### Stats

- `GET /stats`

## Name normalization and merge rules

Player matching is based on the full normalized name:

- trim leading and trailing whitespace
- collapse repeated internal spaces
- compare case-insensitively

Examples:

- `Chris` == `chris`
- `Chris Miller` == `chris     miller`
- `Chris` != `Chris Miller`

This rule is used both when saving new games and when renaming players.

## Error handling

Upload routes return detailed HTTP error messages and log server-side tracebacks. If OCR fails in production, check the service logs, for example with `journalctl -u bowling-api -n 100 --no-pager`.
