'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';

export default function SignupPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const [form, setForm] = useState({
    email: '',
    username: '',
    displayName: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [globalError, setGlobalError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setGlobalError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details) {
          setErrors(data.details);
        } else {
          setGlobalError(data.error ?? 'Signup failed');
        }
        return;
      }

      setUser(data.data.user);
      router.push('/desktop');
    } catch {
      setGlobalError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  function fieldError(field: string) {
    return errors[field]?.[0];
  }

  return (
    <div className="glass rounded-2xl p-8" style={{ background: 'rgba(17,17,27,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="text-center mb-8">
        <div className="text-4xl mb-2">💻</div>
        <h1 className="text-2xl font-bold text-white">Create account</h1>
        <p className="text-sm mt-1" style={{ color: '#6c7086' }}>Set up your BrowserOS desktop</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {globalError && (
          <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(243,139,168,0.15)', color: '#f38ba8', border: '1px solid rgba(243,139,168,0.3)' }}>
            {globalError}
          </div>
        )}

        {[
          { key: 'displayName', label: 'Display name', type: 'text', placeholder: 'Your Name', autocomplete: 'name' },
          { key: 'username', label: 'Username', type: 'text', placeholder: 'yourhandle', autocomplete: 'username' },
          { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', autocomplete: 'email' },
          { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••', autocomplete: 'new-password' },
        ].map(({ key, label, type, placeholder, autocomplete }) => (
          <div key={key}>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#cdd6f4' }}>
              {label}
            </label>
            <input
              type={type}
              required
              autoComplete={autocomplete}
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: fieldError(key) ? '1px solid rgba(243,139,168,0.6)' : '1px solid rgba(255,255,255,0.1)',
                color: '#cdd6f4',
              }}
              placeholder={placeholder}
            />
            {fieldError(key) && (
              <p className="text-xs mt-1" style={{ color: '#f38ba8' }}>
                {fieldError(key)}
              </p>
            )}
          </div>
        ))}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: '#89b4fa', color: '#1e1e2e' }}
        >
          {isLoading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-sm mt-6" style={{ color: '#6c7086' }}>
        Already have an account?{' '}
        <Link href="/login" style={{ color: '#89b4fa' }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
