"use client";

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { login } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
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
      <input
        id="password"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="mt-1 w-full rounded-lg border border-lane-200 bg-lane-50 p-3 text-lane-900 outline-none focus:border-coral"
      />

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
