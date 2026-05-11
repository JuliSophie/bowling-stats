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

Settings are loaded from `.env` with the `BOWLING_` prefix.

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
