'use client';

import { useEffect, useState } from 'react';

import { fetchGames } from '@/lib/api';
import type { GameRead } from '@/types';

// Shared, session-lived cache for the games list.
//
// Every page fetches the same `fetchGames()` payload. Keeping it in a module
// cache means that when a page remounts (e.g. browser back / BackButton), the
// data is available *synchronously* on the first render. That keeps the DOM at
// full height immediately, which is what lets the browser's native scroll
// restoration land on the right position instead of a collapsed loading state.

const REVALIDATE_AFTER_MS = 10_000;

let cache: GameRead[] | null = null;
let lastFetched = 0;
let inflight: Promise<GameRead[]> | null = null;
const subscribers = new Set<(games: GameRead[]) => void>();

function notify(games: GameRead[]) {
  for (const subscriber of subscribers) subscriber(games);
}

function load(force = false): Promise<GameRead[]> {
  if (inflight) return inflight;
  if (cache && !force) return Promise.resolve(cache);

  inflight = fetchGames()
    .then((games) => {
      cache = games;
      lastFetched = Date.now();
      notify(games);
      return games;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Replace the cached games and notify every mounted consumer (e.g. after a rename). */
export function mutateGames(next: GameRead[]) {
  cache = next;
  lastFetched = Date.now();
  notify(next);
}

/** Drop the cache so the next consumer refetches from scratch (e.g. after saving a new game). */
export function invalidateGames() {
  cache = null;
  lastFetched = 0;
}

export function useGames() {
  const [games, setGames] = useState<GameRead[]>(() => cache ?? []);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    const onUpdate = (next: GameRead[]) => setGames(next);
    subscribers.add(onUpdate);

    if (cache === null) {
      // First ever visit this session: show the loading state, then fill in.
      setLoading(true);
      load()
        .then(setGames)
        .catch(() => setGames([]))
        .finally(() => setLoading(false));
    } else {
      // We already have data — render it instantly and quietly revalidate if stale.
      setGames(cache);
      if (Date.now() - lastFetched > REVALIDATE_AFTER_MS) {
        load(true).catch(() => {});
      }
    }

    return () => {
      subscribers.delete(onUpdate);
    };
  }, []);

  return { games, loading, mutate: mutateGames };
}
