'use client';

import { useEffect, useState } from 'react';
import { fetchTrashTalkCatalog, type TrashTalkCatalog } from '@/lib/api';
import { isCompatibleCatalog, setTrashTalkCatalog } from '@/lib/trash-talk-v3';

const REVALIDATE_AFTER_MS = 10_000;
export type TrashTalkCatalogState = {
  catalog: TrashTalkCatalog | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
};

let state: TrashTalkCatalogState = { catalog: null, loading: false, error: null, stale: false };
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function getTrashTalkCatalogState() { return state; }
export function subscribeTrashTalkCatalog(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function refreshTrashTalkCatalog(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && state.catalog && Date.now() - fetchedAt <= REVALIDATE_AFTER_MS) return Promise.resolve();
  state = { ...state, loading: true, error: null };
  notify();
  inflight = fetchTrashTalkCatalog()
    .then((result) => {
      if (result.validation.errors.length > 0) throw new Error(result.validation.errors.join(' · '));
      if (!isCompatibleCatalog(result.catalog)) throw new Error('Inkompatibler Trash-Talk-Katalog.');
      fetchedAt = Date.now();
      state = { catalog: result.catalog, loading: false, error: null, stale: false };
      setTrashTalkCatalog(result.catalog);
      notify();
    })
    .catch((reason: unknown) => {
      state = { ...state, loading: false, error: reason instanceof Error ? reason.message : 'Katalog konnte nicht geladen werden.', stale: state.catalog !== null };
      notify();
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function useTrashTalkCatalog(): TrashTalkCatalogState & { refresh: () => Promise<void> } {
  const [, rerender] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeTrashTalkCatalog(() => rerender((value) => value + 1));
    void refreshTrashTalkCatalog();
    return unsubscribe;
  }, []);
  return { ...state, refresh: () => refreshTrashTalkCatalog(true) };
}
