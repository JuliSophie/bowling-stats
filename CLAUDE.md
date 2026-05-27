# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bowling Stats is a mobile-first PWA for capturing bowling scorecards via OCR and displaying player/game statistics. The UI is in German ("Lade..." for loading, "Spiele" for games, etc.).

## Architecture

**Monorepo with two independent services:**

- `frontend/` — Next.js 16 + React 19 + TypeScript + Tailwind CSS + Recharts
- `backend/` — FastAPI + SQLAlchemy + SQLite, with OpenCV/Tesseract for OCR

The frontend calls the backend via `NEXT_PUBLIC_API_BASE` (defaults to production URL). All API functions live in `frontend/lib/api.ts`. Shared TypeScript types are in `frontend/types/index.ts`.

**Backend routes** are mounted under `/api`:
- `/api/upload/*` — OCR pipeline (corner detection, rectification, table building, extraction)
- `/api/games` — CRUD for saved games
- `/api/stats` — aggregated statistics
- `/health` — healthcheck (no `/api` prefix)

**Frontend routing** (App Router):
- `/` — home dashboard
- `/upload` — OCR upload flow (corner adjust, preview, extract, review, save)
- `/stats/games` — game list (redirected from `/stats`)
- `/stats/games/[id]` — single game detail with score table and chart
- `/stats/days` — game days overview
- `/stats/days/[date]` — single day detail with per-player stats
- `/stats/players` — player list
- `/stats/players/[name]` — player detail with trends, rename action

## Development Commands

```bash
# Frontend
cd frontend
npm install
cp .env.local.example .env.local   # sets NEXT_PUBLIC_API_BASE=http://127.0.0.1:8001
npm run dev                         # http://localhost:3001

# Backend
cd backend
python -m venv venv
venv\Scripts\activate               # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

# Type checking (no test suite or linter configured)
cd frontend && npx tsc --noEmit
```

## Key Conventions

- **Path alias:** `@/*` maps to `frontend/*` (e.g., `@/components/navigation`, `@/types`)
- **Styling:** Tailwind with a custom `lane-*` color palette (lane-50 through lane-900). Common card style: `rounded-lg border border-lane-200 bg-lane-50 p-3`
- **All pages are client components** (`"use client"`) that fetch data via `fetchStats()` / `fetchGames()` from `lib/api.ts` and manage their own loading state
- **Charts** use Recharts with custom bowling pin SVG dots (`PinDot`) for strikes/spares and a color palette constant (`PLAYER_COLORS`)
- **Navigation** uses a `NavigationMemory` component in the root layout for back-button state tracking

## Shared Modules

Reusable utilities and UI components extracted from the page routes:

**Utilities (`lib/`):**
- `constants.ts` — `PLAYER_COLORS` (8-color palette)
- `frame-utils.ts` — bowling math: `getFrameType`, `isOpenFrame`, `isStrikeFrame`, `isSpareFrame`, `median`, `parseCumulative`, `formatNullableScore`, `parseThrowPins`, `getFirstThrowPins`, `getFramePoints`, `getPlayerGames`
- `player-stats.ts` — `derivePlayerSummaries` (full `PlayerSummary` type), `buildPlayerTrendData`

**UI Components (`components/ui/`):**
- `info-tip.tsx` — portal-based tooltip triggered by an "i" button
- `benchmark-bar.tsx` — colored progress bar driven by `StatBenchmark`
- `stat-card.tsx` — `StatCard` (label/value with optional benchmark, info tooltip, link) + `InsightCard` (larger value variant)
- `chart-toggle.tsx` — pill-shaped toggle button for chart options

**Chart/Table Components (`components/`):**
- `pin-dot.tsx` — `PinDot` (SVG bowling pin for Recharts dots) + `PIN_LEGEND`
- `score-table.tsx` — bowling frame score grid table

**Legacy:** `stats-view.tsx` (~1400 lines) now imports from these shared modules but retains its own `InfoTip` and `StatCard` variants (different styling). It should eventually be retired in favor of the dedicated page routes.
