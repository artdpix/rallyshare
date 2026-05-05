'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function AdminLoginPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${API_URL}/admin/submissions?status=pending`, {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      if (res.status === 401) {
        setErr('Token inválido.');
        return;
      }
      if (!res.ok) {
        setErr(`Erro do servidor (HTTP ${res.status}).`);
        return;
      }
      localStorage.setItem('rally.adminToken', token.trim());
      router.replace('/admin');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'erro de rede');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Régie</h1>
          <p style={{ color: 'var(--muted)', margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            Acesso restrito. Cola o token de operador.
          </p>
        </div>

        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="token"
          autoFocus
          autoComplete="off"
          style={{
            width: '100%',
            padding: '0.85rem 1rem',
            background: 'var(--bg)',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            fontSize: '1rem',
            fontFamily: 'monospace',
          }}
        />

        {err && (
          <div
            style={{
              background: '#3a1414',
              border: '1px solid #6e1f1f',
              color: '#fca5a5',
              padding: '0.6rem 0.75rem',
              borderRadius: 8,
              fontSize: '0.85rem',
            }}
          >
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !token.trim()}
          style={{
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            padding: '0.9rem 1rem',
            borderRadius: 10,
            fontSize: '1rem',
            fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy || !token.trim() ? 0.5 : 1,
          }}
        >
          {busy ? 'A validar…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
