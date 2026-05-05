'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Asset = { storageKey: string; mime: string; bytes: number };
type Stage = { id: string; name: string; order: number } | null;
type Submission = {
  id: string;
  type: 'photo' | 'video';
  status: 'pending' | 'approved' | 'rejected' | 'aired';
  stage: Stage;
  contributorName: string | null;
  contributorEmail: string | null;
  anonymous: boolean;
  nsfwFlag: boolean;
  createdAt: string;
  asset: Asset | null;
};

type Tab = 'pending' | 'approved' | 'rejected';

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

const styles = {
  shell: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr 280px',
    gridTemplateRows: '48px 1fr',
    gap: '1px',
    height: '100vh',
    background: 'var(--border)',
  } as React.CSSProperties,
  topbar: {
    gridColumn: '1 / -1',
    background: 'var(--card)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 1rem',
    gap: '1rem',
  } as React.CSSProperties,
  pane: {
    background: 'var(--bg)',
    overflowY: 'auto',
    minHeight: 0,
  } as React.CSSProperties,
  card: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  } as React.CSSProperties,
  btn: {
    padding: '0.85rem 1rem',
    borderRadius: 8,
    border: 'none',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  } as React.CSSProperties,
  tab: (active: boolean): React.CSSProperties => ({
    padding: '0.4rem 0.85rem',
    borderRadius: 6,
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'white' : 'var(--muted)',
    border: '1px solid',
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    cursor: 'pointer',
    fontSize: '0.85rem',
  }),
};

export function AdminClient({ apiUrl }: { apiUrl: string }) {
  const [tab, setTab] = useState<Tab>('pending');
  const [items, setItems] = useState<Submission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/admin/submissions?status=${tab}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Submission[] = await res.json();
      setItems(data);
      setErr(null);
      setSelectedId((prev) => {
        if (prev && data.some((i) => i.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'erro de rede');
    }
  }, [apiUrl, tab]);

  useEffect(() => {
    fetchList();
    const t = setInterval(fetchList, 5000);
    return () => clearInterval(t);
  }, [fetchList]);

  const moderate = useCallback(
    async (action: 'approve' | 'reject') => {
      if (!selected || busy) return;
      setBusy(true);
      try {
        const res = await fetch(
          `${apiUrl}/admin/submissions/${selected.id}/moderate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // optimistic: remove from local list and pick next
        setItems((prev) => {
          const idx = prev.findIndex((i) => i.id === selected.id);
          const next = prev.filter((i) => i.id !== selected.id);
          const nextSel = next[idx] ?? next[idx - 1] ?? null;
          setSelectedId(nextSel?.id ?? null);
          return next;
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'erro a moderar');
      } finally {
        setBusy(false);
      }
    },
    [apiUrl, selected, busy],
  );

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedId((prev) => {
          const idx = items.findIndex((i) => i.id === prev);
          return items[Math.min(idx + 1, items.length - 1)]?.id ?? prev;
        });
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedId((prev) => {
          const idx = items.findIndex((i) => i.id === prev);
          return items[Math.max(idx - 1, 0)]?.id ?? prev;
        });
      } else if (e.key === 'a' && tab === 'pending') {
        e.preventDefault();
        moderate('approve');
      } else if (e.key === 'r' && tab === 'pending') {
        e.preventDefault();
        moderate('reject');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, tab, moderate]);

  const mediaUrl = selected?.asset
    ? `${apiUrl}/media/${selected.asset.storageKey}`
    : null;

  return (
    <div style={styles.shell}>
      <div style={styles.topbar}>
        <strong>RallyShare · Moderação</strong>
        <div style={{ display: 'flex', gap: '0.4rem', marginLeft: '1rem' }}>
          {(['pending', 'approved', 'rejected'] as Tab[]).map((t) => (
            <button key={t} style={styles.tab(tab === t)} onClick={() => setTab(t)}>
              {t === 'pending' ? 'Pendentes' : t === 'approved' ? 'Aprovados' : 'Rejeitados'}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: '0.8rem' }}>
          {items.length} {items.length === 1 ? 'item' : 'itens'}
          {err ? ` · erro: ${err}` : ''}
        </div>
      </div>

      <aside style={styles.pane}>
        {items.length === 0 ? (
          <div style={{ padding: '2rem 1rem', color: 'var(--muted)', textAlign: 'center' }}>
            sem itens
          </div>
        ) : (
          items.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{
                ...styles.card,
                background: s.id === selectedId ? '#1f2024' : 'transparent',
                borderLeft:
                  s.id === selectedId ? '3px solid var(--accent)' : '3px solid transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: 4,
                    background: s.type === 'video' ? '#1e3a8a' : '#065f46',
                    color: 'white',
                  }}
                >
                  {s.type}
                </span>
                {s.nsfwFlag && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.1rem 0.4rem',
                      borderRadius: 4,
                      background: '#7f1d1d',
                      color: 'white',
                    }}
                  >
                    NSFW?
                  </span>
                )}
                <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: '0.75rem' }}>
                  {timeAgo(s.createdAt)}
                </span>
              </div>
              <div style={{ fontSize: '0.9rem' }}>
                {s.stage?.name ?? <span style={{ color: 'var(--muted)' }}>sem PEC</span>}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                {s.anonymous ? 'anónimo' : s.contributorName ?? s.contributorEmail ?? 'sem nome'}
                {s.asset ? ` · ${formatBytes(s.asset.bytes)}` : ''}
              </div>
            </div>
          ))
        )}
      </aside>

      <main
        style={{
          ...styles.pane,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        {selected && mediaUrl ? (
          selected.type === 'video' ? (
            <video
              key={selected.id}
              src={mediaUrl}
              controls
              autoPlay
              muted
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />
          ) : (
            <img
              key={selected.id}
              src={mediaUrl}
              alt=""
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          )
        ) : (
          <div style={{ color: 'var(--muted)' }}>selecciona um item</div>
        )}
      </main>

      <aside style={{ ...styles.pane, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {selected ? (
          <>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>PEC</div>
              <div>{selected.stage?.name ?? '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Contribuidor</div>
              <div>{selected.anonymous ? 'anónimo' : selected.contributorName ?? '—'}</div>
              {selected.contributorEmail && !selected.anonymous && (
                <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                  {selected.contributorEmail}
                </div>
              )}
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Tipo / tamanho</div>
              <div>
                {selected.type}
                {selected.asset ? ` · ${formatBytes(selected.asset.bytes)}` : ''}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Recebido</div>
              <div>{new Date(selected.createdAt).toLocaleString('pt-PT')}</div>
            </div>

            {tab === 'pending' && (
              <>
                <button
                  style={{ ...styles.btn, background: '#16a34a', color: 'white' }}
                  disabled={busy}
                  onClick={() => moderate('approve')}
                >
                  Aprovar (A)
                </button>
                <button
                  style={{ ...styles.btn, background: '#52525b', color: 'white' }}
                  disabled={busy}
                  onClick={() => moderate('reject')}
                >
                  Rejeitar (R)
                </button>
              </>
            )}

            <div style={{ marginTop: 'auto', color: 'var(--muted)', fontSize: '0.75rem' }}>
              Atalhos: <kbd>J</kbd>/<kbd>K</kbd> navegar · <kbd>A</kbd> aprovar · <kbd>R</kbd> rejeitar
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--muted)' }}>nada seleccionado</div>
        )}
      </aside>
    </div>
  );
}
