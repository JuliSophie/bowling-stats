'use client';

import { usePathname, useRouter } from 'next/navigation';
import { MouseEvent, ReactNode, useEffect } from 'react';

// Scroll handling is delegated to the Next.js App Router, which already does
// what we want: scroll to top on forward navigation (Link / router.push) and
// restore the previous position on back/forward (popstate / router.back).
//
// The only thing tracked here is how deep we are in the *app's own* history, so
// the back button can fall back to a sensible href when there's nothing in-app
// to go back to (e.g. the user opened a deep link directly).

let navDepth = 0;
let sawPopState = false;
let initialized = false;

export function NavigationMemory() {
  const pathname = usePathname();

  useEffect(() => {
    // Undo any lingering 'manual' setting and let the browser/Next restore scroll.
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'auto';
    }

    const onPopState = () => {
      sawPopState = true;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!initialized) {
      // The first render is the entry page, not a navigation.
      initialized = true;
      return;
    }

    if (sawPopState) {
      // Back/forward navigation — treat as a step back out of the app stack.
      sawPopState = false;
      navDepth = Math.max(0, navDepth - 1);
    } else {
      // A push (Link or router.push) added a new entry to the app stack.
      navDepth += 1;
    }
  }, [pathname]);

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

  const goBack = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (navDepth > 0) {
      // We pushed our way here within the app — let the browser/Next pop the
      // entry and restore its scroll position.
      router.back();
    } else {
      // Arrived via a deep link with no in-app history to pop.
      router.push(fallbackHref);
    }
  };

  return (
    <button type="button" onClick={goBack} className={className}>
      {children}
    </button>
  );
}
