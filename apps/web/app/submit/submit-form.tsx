'use client';

import { useRef, useState } from 'react';

type Stage = { id: string; name: string; order: number };
type Event = { id: string; name: string; stages: Stage[] };

type Status = 'idle' | 'uploading' | 'success' | 'error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.85rem 1rem',
  background: 'var(--card)',
  color: 'var(--fg)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: '1rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.4rem',
  color: 'var(--muted)',
  fontSize: '0.85rem',
};

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function SubmitForm({ event }: { event: Event }) {
  const [file, setFile] = useState<File | null>(null);
  const [stageId, setStageId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = file && stageId && consent && status !== 'uploading';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !file) return;

    setStatus('uploading');
    setError(null);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('eventId', event.id);
    fd.append('stageId', stageId);
    fd.append('anonymous', name || email ? 'false' : 'true');
    if (name) fd.append('contributorName', name);
    if (email) fd.append('contributorEmail', email);
    fd.append('consent', 'true');

    try {
      const res = await fetch(`${API_URL}/submissions`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message ?? 'erro ao submeter');
      }
      setReceipt(data.receiptCode ?? data.id);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'erro desconhecido');
    }
  }

  function reset() {
    setFile(null);
    setStageId('');
    setName('');
    setEmail('');
    setConsent(false);
    setReceipt(null);
    setError(null);
    setStatus('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (status === 'success' && receipt) {
    return (
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '1.5rem 1.25rem',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Obrigado!</h2>
        <p style={{ color: 'var(--muted)', margin: '0.5rem 0 1.25rem' }}>
          O teu envio está em moderação. Se for usado em direto, aparece em breve.
        </p>
        <div
          style={{
            background: '#0b0b0c',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '0.75rem',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            wordBreak: 'break-all',
            marginBottom: '1rem',
          }}
        >
          <div style={{ color: 'var(--muted)', fontSize: '0.7rem', marginBottom: 4 }}>
            Código de submissão (guarda para apagares depois)
          </div>
          {receipt}
        </div>
        <button
          type="button"
          onClick={reset}
          style={{
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            padding: '0.85rem 1rem',
            borderRadius: 10,
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Submeter outro
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      <div>
        <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Em direto</div>
        <h1 style={{ margin: '0.15rem 0 0', fontSize: '1.4rem' }}>{event.name}</h1>
      </div>

      <div>
        <label style={labelStyle}>Foto ou vídeo</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
          style={inputStyle}
        />
        {file && (
          <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 6 }}>
            {file.name} · {formatBytes(file.size)}
          </div>
        )}
      </div>

      <div>
        <label style={labelStyle}>Onde tiraste? (PEC)</label>
        <select
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          required
          style={inputStyle}
        >
          <option value="">— escolhe a PEC —</option>
          {event.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Nome (opcional, para crédito on-screen)</label>
        <input
          type="text"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="Anónimo"
          style={inputStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>Email (opcional, para te avisarmos se for usado)</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="opcional"
          style={inputStyle}
        />
      </div>

      <label
        style={{
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'flex-start',
          color: 'var(--muted)',
          fontSize: '0.85rem',
          padding: '0.5rem 0',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
          style={{ marginTop: 4 }}
        />
        <span>
          Autorizo o uso das minhas imagens na transmissão em directo, redes sociais do
          canal e arquivo do evento.
        </span>
      </label>

      {error && (
        <div
          style={{
            background: '#3a1414',
            border: '1px solid #6e1f1f',
            color: '#fca5a5',
            padding: '0.75rem',
            borderRadius: 8,
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          background: 'var(--accent)',
          color: 'white',
          border: 'none',
          padding: '1rem',
          borderRadius: 10,
          fontSize: '1rem',
          fontWeight: 600,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          opacity: canSubmit ? 1 : 0.5,
        }}
      >
        {status === 'uploading' ? 'A enviar…' : 'Submeter'}
      </button>
    </form>
  );
}
