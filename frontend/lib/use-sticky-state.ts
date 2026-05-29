'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

// In-memory, session-lived UI state keyed by a stable string.
//
// React `useState` is destroyed when a route unmounts, so toggles like "which
// card is expanded" reset on back-navigation. This keeps such state in a module
// store so a remounting page reads it back *synchronously* on the first render —
// matching the data cache in `use-games`, so restored UI doesn't cause a layout
// shift. State is intentionally lost on a hard refresh.

const store = new Map<string, unknown>();

export function useStickyState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));

  // Adopt the stored value when the key changes (e.g. navigating between two
  // player detail pages reuses the same component instance with a new key).
  const previousKey = useRef(key);
  useEffect(() => {
    if (previousKey.current !== key) {
      previousKey.current = key;
      setValue(store.has(key) ? (store.get(key) as T) : initial);
    }
  }, [key, initial]);

  useEffect(() => {
    store.set(key, value);
  }, [key, value]);

  return [value, setValue];
}
