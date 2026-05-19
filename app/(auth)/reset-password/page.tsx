'use client';

import { Suspense } from 'react';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Step = 'request' | 'sent' | 'reset' | 'done';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get('token');

  const [step, setStep] = useState<Step>(tokenParam ? 'reset' : 'request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setStep('sent');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenParam, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setStep('done');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-8" style={{ background: 'rgba(17,17,27,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="text-center mb-8">
        <div className="text-4xl mb-2">🔐</div>
        <h1 className="text-2xl font-bold text-white">
          {step === 'done' ? 'Password reset!' : 'Reset password'}
        </h1>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm mb-4" style={{ background: 'rgba(243,139,168,0.15)', color: '#f38ba8', border: '1px solid rgba(243,139,168,0.3)' }}>
          {error}
        </div>
      )}

      {step === 'request' && (
        <form onSubmit={handleRequest} className="space-y-4">
          <p className="text-sm" style={{ color: '#6c7086' }}>
            Enter your email and we&apos;ll send a reset link.
          </p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#cdd6f4' }}
            placeholder="you@example.com"
          />
          <button type="submit" disabled={isLoading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: '#89b4fa', color: '#1e1e2e' }}>
            {isLoading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      {step === 'sent' && (
        <p className="text-sm text-center" style={{ color: '#a6e3a1' }}>
          ✓ Check your email for a reset link.
        </p>
      )}

      {step === 'reset' && (
        <form onSubmit={handleReset} className="space-y-4">
          <p className="text-sm" style={{ color: '#6c7086' }}>Enter your new password.</p>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#cdd6f4' }}
            placeholder="New password (min 8 chars)"
          />
          <button type="submit" disabled={isLoading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: '#89b4fa', color: '#1e1e2e' }}>
            {isLoading ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      )}

      {step === 'done' && (
        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: '#a6e3a1' }}>
            ✓ Your password has been reset. You can now sign in.
          </p>
          <Link href="/login"
            className="inline-block px-6 py-2 rounded-lg text-sm font-semibold"
            style={{ background: '#89b4fa', color: '#1e1e2e' }}>
            Back to sign in
          </Link>
        </div>
      )}

      {step !== 'done' && (
        <p className="text-center text-sm mt-6" style={{ color: '#6c7086' }}>
          <Link href="/login" style={{ color: '#89b4fa' }}>Back to sign in</Link>
        </p>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="glass rounded-2xl p-8" style={{ background: 'rgba(17,17,27,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="text-center">
          <div className="text-4xl mb-2">🔐</div>
          <p style={{ color: '#6c7086' }}>Loading…</p>
        </div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
