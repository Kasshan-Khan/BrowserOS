'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Login failed');
        return;
      }

      setUser(data.data.user);
      const from = searchParams.get('from') ?? '/desktop';
      router.push(from);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="rounded-2xl p-8"
      style={{
        background: 'rgba(17,17,27,0.8)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="text-4xl mb-2">💻</div>
        <h1 className="text-2xl font-bold text-white">BrowserOS</h1>
        <p className="text-sm mt-1" style={{ color: '#6c7086' }}>
          Sign in to your desktop
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              background: 'rgba(243,139,168,0.15)',
              color: '#f38ba8',
              border: '1px solid rgba(243,139,168,0.3)',
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: '#cdd6f4' }}
          >
            Email
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#cdd6f4',
            }}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium" style={{ color: '#cdd6f4' }}>
              Password
            </label>
            <Link href="/reset-password" className="text-xs" style={{ color: '#89b4fa' }}>
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#cdd6f4',
            }}
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: '#89b4fa', color: '#1e1e2e' }}
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm mt-6" style={{ color: '#6c7086' }}>
        Don&apos;t have an account?{' '}
        <Link href="/signup" style={{ color: '#89b4fa' }}>
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: 'rgba(17,17,27,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="text-4xl mb-2">💻</div>
          <p style={{ color: '#6c7086' }}>Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
