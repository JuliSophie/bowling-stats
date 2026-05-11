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

## Homescreen install

The frontend includes:

- app icon metadata
- Apple touch icon generation
- web manifest metadata for standalone install

## Notes

- error responses from the API are logged with request URL and HTTP status in the browser console
- the OCR review table is intentionally editable inline; no separate edit mode is required for names or frame values
