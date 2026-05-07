'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type EventRow = {
  id: string;
  slug: string;
  name: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  stagesCount: number;
  submissionsCount: number;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.85rem 1rem',
  background: 'var(--bg)',
  color: 'var(--fg)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: '1rem',
};

function formatDateRange(starts: string, ends: string) {
  try {
    const s = new Date(starts);
    const e = new Date(ends);
    const d1 = s.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });
    const d2 = e.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });
    return d1 === d2 ? d1 : `${d1} → ${d2}`;
  } catch {
    return '';
  }
}

export function EventsClient({ apiUrl }: { apiUrl: string }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [rallyId, setRallyId] = useState('');
  const [activate, setActivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem('rally.adminToken');
    if (!t) {
      router.replace('/admin/login');
      return;
    }
    setToken(t);
  }, [router]);

  const handle401 = useCallback(() => {
    localStorage.removeItem('rally.adminToken');
    router.replace('/admin/login');
  }, [router]);

  const authedFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const res = await fetch(`${apiUrl}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });
      if (res.status === 401) {
        handle401();
        throw new Error('unauthenticated');
      }
      return res;
    },
    [apiUrl, token, handle401],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authedFetch('/admin/events');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEvents(await res.json());
    } catch (e) {
      if ((e as Error).message !== 'unauthenticated') {
        setErr((e as Error).message);
      }
    }
  }, [token, authedFetch]);

  useEffect(() => {
    if (token) refresh();
  }, [token, refresh]);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!rallyId.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await authedFetch('/admin/events/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rallyId: rallyId.trim(), activate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      setMsg(
        `Importado: ${data.name} (${data.stagesCount} PECs)${data.activated ? ' — definido como activo' : ''}`,
      );
      setRallyId('');
      await refresh();
    } catch (e) {
      if ((e as Error).message !== 'unauthenticated') {
        setErr((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string) {
    try {
      const res = await authedFetch(`/admin/events/${id}/active`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      if ((e as Error).message !== 'unauthenticated') {
        setErr((e as Error).message);
      }
    }
  }

  async function deactivate(id: string) {
    try {
      const res = await authedFetch(`/admin/events/${id}/deactivate`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      if ((e as Error).message !== 'unauthenticated') {
        setErr((e as Error).message);
      }
    }
  }

  async function deactivateAll() {
    try {
      const res = await authedFetch('/admin/events/deactivate-all', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      if ((e as Error).message !== 'unauthenticated') {
        setErr((e as Error).message);
      }
    }
  }

  if (!token) return null;

  return (
    <main
      style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '1.5rem 1.25rem 3rem',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/admin" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Moderação
        </Link>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Eventos</h1>
      </header>

      <section
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '1.25rem',
        }}
      >
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem' }}>Importar de anubesport</h2>
        <p style={{ margin: '0 0 1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
          Cola o ID do rally ou a URL completa (ex.{' '}
          <code style={{ color: 'var(--fg)' }}>https://anubesport.com/timing/?rallyId=329</code>).
          As PECs com <code>compute=1</code> são criadas/actualizadas.
        </p>
        <form onSubmit={handleImport} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="text"
            value={rallyId}
            onChange={(e) => setRallyId(e.target.value)}
            placeholder="329  ou  https://anubesport.com/timing/?rallyId=329"
            style={inputStyle}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: 'var(--muted)',
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={activate}
              onChange={(e) => setActivate(e.target.checked)}
            />
            <span>Definir como evento activo (desactiva os outros)</span>
          </label>

          {msg && (
            <div
              style={{
                background: '#0e2e1a',
                border: '1px solid #1a4d2e',
                color: '#86efac',
                padding: '0.6rem 0.85rem',
                borderRadius: 8,
                fontSize: '0.85rem',
              }}
            >
              {msg}
            </div>
          )}
          {err && (
            <div
              style={{
                background: '#3a1414',
                border: '1px solid #6e1f1f',
                color: '#fca5a5',
                padding: '0.6rem 0.85rem',
                borderRadius: 8,
                fontSize: '0.85rem',
              }}
            >
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !rallyId.trim()}
            style={{
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              padding: '0.85rem 1rem',
              borderRadius: 10,
              fontSize: '1rem',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy || !rallyId.trim() ? 0.5 : 1,
              alignSelf: 'flex-start',
            }}
          >
            {busy ? 'A importar…' : 'Importar'}
          </button>
        </form>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Eventos existentes</h2>
          {events.some((e) => e.active) && (
            <button
              onClick={deactivateAll}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '0.3rem 0.7rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Desactivar todos
            </button>
          )}
        </div>

        {events.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
              color: 'var(--muted)',
              textAlign: 'center',
              border: '1px dashed var(--border)',
              borderRadius: 12,
            }}
          >
            ainda sem eventos importados
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {events.map((ev) => (
              <div
                key={ev.id}
                style={{
                  background: 'var(--card)',
                  border: '1px solid',
                  borderColor: ev.active ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 10,
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {ev.active && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          padding: '0.1rem 0.45rem',
                          borderRadius: 4,
                          background: 'var(--accent)',
                          color: 'white',
                          fontWeight: 700,
                        }}
                      >
                        ACTIVO
                      </span>
                    )}
                    <span style={{ fontWeight: 600 }}>{ev.name}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 4 }}>
                    {formatDateRange(ev.startsAt, ev.endsAt)} · {ev.stagesCount} PECs ·{' '}
                    {ev.submissionsCount} envios · <code>{ev.slug}</code>
                  </div>
                </div>
                {ev.active ? (
                  <button
                    onClick={() => deactivate(ev.id)}
                    style={{
                      background: 'transparent',
                      color: 'var(--muted)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    Desactivar
                  </button>
                ) : (
                  <button
                    onClick={() => setActive(ev.id)}
                    style={{
                      background: 'transparent',
                      color: 'var(--fg)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    Activar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
