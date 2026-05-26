'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: '⌂' },
  { href: '/stats/games', label: 'Spiele', icon: '🎳' },
  { href: '/stats/players', label: 'Bestenliste', icon: '🏆' },
];

export default function Navigation() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const systemDark = media.matches;
    const initialTheme = systemDark ? 'dark' : 'light';

    root.dataset.theme = initialTheme;
    root.style.colorScheme = initialTheme;
    setTheme(initialTheme);

    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      const nextTheme = event.matches ? 'dark' : 'light';
      root.dataset.theme = nextTheme;
      root.style.colorScheme = nextTheme;
      setTheme(nextTheme);
    };

    media.addEventListener('change', onSystemThemeChange);
    return () => media.removeEventListener('change', onSystemThemeChange);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    setTheme(nextTheme);
  };

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.14)] backdrop-blur-2xl sm:px-6 lg:px-8" style={{ background: 'var(--nav-bg)', borderColor: 'var(--nav-border)', color: '#fff4e6' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-coral text-xl text-lane-950 shadow-[0_12px_28px_rgba(255,140,105,0.26)]">🎳</span>
            <span className="min-w-0">
              <span className="block truncate text-base font-black leading-tight tracking-tight">Bowling Stats</span>
              <span className="block truncate text-[0.65rem] font-bold uppercase tracking-[0.22em] text-amber-100/55">sophiealexandra.de</span>
            </span>
          </Link>

          <nav className="hidden items-center rounded-full border border-white/10 bg-white/10 p-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  isActive(item.href)
                    ? 'bg-white text-lane-950 shadow-lg'
                    : 'text-amber-50/72 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="theme-toggle hidden sm:inline-flex"
              aria-label={theme === 'dark' ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren'}
              title={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <Link href="/upload" className="inline-flex rounded-full bg-coral px-3 py-2 text-sm font-black text-lane-950 shadow-[0_10px_22px_rgba(255,140,105,0.22)] transition hover:-translate-y-0.5 hover:bg-[#ff9d80] sm:px-4">
              <span className="sm:hidden">Upload</span>
              <span className="hidden sm:inline">Neuer Upload</span>
            </Link>
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-3 bottom-3 z-50 rounded-[1.75rem] border p-2 text-white shadow-[0_18px_60px_rgba(0,0,0,0.36)] backdrop-blur-2xl md:hidden" style={{ background: 'var(--nav-bg)', borderColor: 'var(--nav-border)' }}>
        <div className="grid grid-cols-3 gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[0.7rem] font-bold transition ${
                isActive(item.href)
                  ? 'bg-white text-lane-950'
                  : 'text-amber-50/68 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <button
        type="button"
        onClick={toggleTheme}
        className="theme-toggle fixed bottom-24 right-4 z-50 md:hidden"
        aria-label={theme === 'dark' ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren'}
        title={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </>
  );
}
