'use client';

import { usePathname, useRouter } from 'next/navigation';
import { MouseEvent, ReactNode, useEffect, useRef, useState } from 'react';

const STACK_KEY = 'bowling-navigation-stack';
const SCROLL_KEY = 'bowling-navigation-scroll';
const INTENT_KEY = 'bowling-navigation-intent';
const MAX_STACK_LENGTH = 60;

type NavigationIntent = {
  kind: 'push' | 'back';
  from: string;
  to: string;
  at: number;
};

type ScrollMap = Record<string, { x: number; y: number }>;

let cancelActiveRestore: (() => void) | null = null;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(key, JSON.stringify(value));
}

function readStack() {
  return readJson<string[]>(STACK_KEY, []);
}

function writeStack(stack: string[]) {
  writeJson(STACK_KEY, stack.slice(-MAX_STACK_LENGTH));
}

function getBrowserRoute() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function saveScroll(route: string) {
  if (typeof window === 'undefined' || !route) return;
  const scrolls = readJson<ScrollMap>(SCROLL_KEY, {});
  scrolls[route] = { x: window.scrollX, y: window.scrollY };
  writeJson(SCROLL_KEY, scrolls);
}

function setIntent(intent: NavigationIntent) {
  writeJson(INTENT_KEY, intent);
}

function takeIntent(route: string) {
  const intent = readJson<NavigationIntent | null>(INTENT_KEY, null);
  if (!intent || intent.to !== route || Date.now() - intent.at > 10_000) return null;
  sessionStorage.removeItem(INTENT_KEY);
  return intent;
}

function isInternalAnchor(anchor: HTMLAnchorElement) {
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;

  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin;
}

function routeFromUrl(url: URL) {
  return `${url.pathname}${url.search}${url.hash}`;
}

function scrollToTop() {
  cancelActiveRestore?.();
  cancelActiveRestore = null;
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

function restoreScroll(route: string) {
  cancelActiveRestore?.();
  cancelActiveRestore = null;

  const position = readJson<ScrollMap>(SCROLL_KEY, {})[route];
  if (!position) {
    return;
  }

  let attempts = 0;
  let timeoutId: number | null = null;
  let animationFrameId: number | null = null;
  let observer: ResizeObserver | null = null;
  const maxAttempts = 90;

  const cleanup = () => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
    observer?.disconnect();
    if (cancelActiveRestore === cleanup) cancelActiveRestore = null;
  };

  cancelActiveRestore = cleanup;

  const apply = () => {
    window.scrollTo({ top: position.y, left: position.x, behavior: 'auto' });
    attempts += 1;

    const reachedTarget = Math.abs(window.scrollY - position.y) < 2;
    if (reachedTarget || attempts >= maxAttempts) {
      cleanup();
      return;
    }

    timeoutId = window.setTimeout(apply, attempts < 10 ? 16 : 100);
  };

  observer = new ResizeObserver(() => {
    animationFrameId = window.requestAnimationFrame(apply);
  });
  observer.observe(document.documentElement);
  animationFrameId = window.requestAnimationFrame(apply);
}

function normalizeStackForBack(stack: string[], currentRoute: string, fallbackHref: string) {
  const nextStack = stack.length ? [...stack] : [currentRoute];

  if (nextStack[nextStack.length - 1] !== currentRoute) {
    nextStack.push(currentRoute);
  }

  while (nextStack.length && nextStack[nextStack.length - 1] === currentRoute) {
    nextStack.pop();
  }

  const target = nextStack[nextStack.length - 1] ?? fallbackHref;
  if (!nextStack.length) nextStack.push(target);

  return { target, stack: nextStack };
}

function useCurrentRoute() {
  const pathname = usePathname();
  const [route, setRoute] = useState(pathname);

  useEffect(() => {
    setRoute(getBrowserRoute());
  }, [pathname]);

  return route;
}

export function NavigationMemory() {
  const route = useCurrentRoute();
  const routeRef = useRef(route);
  const previousRouteRef = useRef(route);
  const initializedRef = useRef(false);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    let ticking = false;
    const saveCurrentScroll = () => saveScroll(routeRef.current);
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        saveCurrentScroll();
        ticking = false;
      });
    };
    const onPageHide = () => saveCurrentScroll();
    const onPopState = () => saveCurrentScroll();
    const saveFromAnchor = (event: globalThis.MouseEvent | PointerEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || !isInternalAnchor(anchor)) return;

      const from = getBrowserRoute();
      const to = routeFromUrl(new URL(anchor.href, window.location.href));
      saveScroll(from);
      if (to !== getBrowserRoute()) {
        setIntent({ kind: 'push', from, to, at: Date.now() });
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('pointerdown', saveFromAnchor, true);
    document.addEventListener('click', saveFromAnchor, true);

    return () => {
      saveCurrentScroll();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('pointerdown', saveFromAnchor, true);
      document.removeEventListener('click', saveFromAnchor, true);
    };
  }, []);

  useEffect(() => {
    if (previousRouteRef.current !== route) {
      saveScroll(previousRouteRef.current);
    }

    const stack = readStack();

    if (!initializedRef.current) {
      if (stack[stack.length - 1] !== route) {
        stack.push(route);
        writeStack(stack);
      }
      initializedRef.current = true;
      routeRef.current = route;
      previousRouteRef.current = route;
      return;
    }

    const intent = takeIntent(route);
    let shouldRestoreScroll = intent?.kind === 'back';
    const shouldScrollToTop = intent?.kind === 'push';

    if (intent?.kind === 'back') {
      if (stack[stack.length - 1] !== route) {
        const existingIndex = stack.lastIndexOf(route);
        writeStack(existingIndex >= 0 ? stack.slice(0, existingIndex + 1) : [...stack, route]);
      }
    } else if (stack[stack.length - 2] === route) {
      stack.pop();
      writeStack(stack);
      shouldRestoreScroll = true;
    } else if (stack[stack.length - 1] !== route) {
      stack.push(route);
      writeStack(stack);
    }

    routeRef.current = route;
    previousRouteRef.current = route;
    if (shouldRestoreScroll) restoreScroll(route);
    else if (shouldScrollToTop) scrollToTop();
  }, [route]);

  return null;
}

export function BackButton({
  children = '← Zurück',
  className,
  fallbackHref = '/',
}: {
  children?: ReactNode;
  className?: string;
  fallbackHref?: string;
}) {
  const router = useRouter();
  const currentRoute = useCurrentRoute();

  const goBack = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    saveScroll(currentRoute);

    const { target, stack } = normalizeStackForBack(readStack(), currentRoute, fallbackHref);
    writeStack(stack);
    setIntent({ kind: 'back', from: currentRoute, to: target, at: Date.now() });
    router.push(target, { scroll: false });
  };

  return (
    <button type="button" onClick={goBack} className={className}>
      {children}
    </button>
  );
}
