'use client';

import { useEffect, useState } from 'react';

import { fetchGames } from '@/lib/api';
import { getTrashTalkCatalogState, refreshTrashTalkCatalog, subscribeTrashTalkCatalog } from '@/lib/use-trash-talk-catalog';
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
const subscribers = new Set<() => void>();
let gamesError: string | null = null;
let gamesLoading = false;

function notify() {
  for (const subscriber of subscribers) subscriber();
}

function load(force = false): Promise<GameRead[]> {
  if (inflight) return inflight;
  if (cache && !force) return Promise.resolve(cache);

  gamesLoading = cache === null;
  notify();
  void refreshTrashTalkCatalog();
  inflight = fetchGames()
    .then((games) => {
      cache = games;
      gamesError = null;
      lastFetched = Date.now();
      notify();
      return games;
    })
    .catch((reason: unknown) => {
      gamesError = reason instanceof Error ? reason.message : 'Spiele konnten nicht geladen werden.';
      notify();
      return cache ?? [];
    })
    .finally(() => {
      inflight = null;
      gamesLoading = false;
      notify();
    });

  return inflight;
}

/** Replace the cached games and notify every mounted consumer (e.g. after a rename). */
export function mutateGames(next: GameRead[]) {
  cache = next;
  gamesError = null;
  lastFetched = Date.now();
  notify();
}

/** Drop the cache so the next consumer refetches from scratch (e.g. after saving a new game). */
export function invalidateGames() {
  cache = null;
  gamesError = null;
  lastFetched = 0;
}

export function useGames() {
  const [, rerender] = useState(0);

  useEffect(() => {
    const onUpdate = () => rerender((value) => value + 1);
    subscribers.add(onUpdate);
    const unsubscribeCatalog = subscribeTrashTalkCatalog(onUpdate);

    if (cache === null) {
      void load();
    } else if (Date.now() - lastFetched > REVALIDATE_AFTER_MS) {
      void load(true);
    }
    void refreshTrashTalkCatalog();

    return () => {
      subscribers.delete(onUpdate);
      unsubscribeCatalog();
    };
  }, []);

  const catalog = getTrashTalkCatalogState();
  return { games: cache ?? [], loading: gamesLoading || (cache === null && gamesError === null),
    error: gamesError, stale: cache !== null && gamesError !== null,
    catalogError: catalog.error, catalogStale: catalog.stale, mutate: mutateGames };
}
