"use client";

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { login } from '@/lib/api';

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <line x1="3" y1="21" x2="21" y2="3" /> : null}
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(password);
      const from = searchParams.get('from');
      router.replace(from && from.startsWith('/') ? from : '/');
    } catch {
      setError('Falsches Passwort. Bitte erneut versuchen.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="soft-card mx-auto mt-16 w-full max-w-sm p-6">
      <p className="eyebrow">Bowling Stats</p>
      <h1 className="mt-2 text-2xl font-black text-lane-950">Anmelden</h1>
      <p className="mt-2 text-sm text-lane-600">
        Diese Seite ist privat. Bitte gib das gemeinsame Passwort ein.
      </p>

      <label className="mt-6 block text-sm font-bold text-lane-800" htmlFor="password">
        Passwort
      </label>
      <div className="relative mt-1">
        <input
          id="password"
          type={showPassword ? 'text' : 'password'}
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-lane-200 bg-lane-50 p-3 pr-12 text-lane-900 outline-none focus:border-coral"
        />
        <button
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-lg text-lane-500 transition hover:text-lane-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-coral"
          aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
          aria-pressed={showPassword}
          title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
        >
          <EyeIcon crossed={showPassword} />
        </button>
      </div>

      {error ? <p className="mt-3 text-sm font-semibold text-coral">{error}</p> : null}

      <button
        type="submit"
        disabled={loading || !password}
        className="mt-6 w-full rounded-lg bg-coral p-3 font-black text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? 'Anmelden…' : 'Anmelden'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="app-main">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
