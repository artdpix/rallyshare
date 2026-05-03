import Link from 'next/link';
import { SubmitForm } from './submit-form';

async function getActiveEvent() {
  const url = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/events/active`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function SubmitPage() {
  const event = await getActiveEvent();

  return (
    <main
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '1.5rem 1.25rem 3rem',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Link
          href="/"
          style={{ color: 'var(--muted)', fontSize: '1rem', textDecoration: 'none' }}
        >
          ← Voltar
        </Link>
      </header>

      {event ? (
        <SubmitForm event={event} />
      ) : (
        <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem 0' }}>
          Sem evento activo de momento.
        </div>
      )}
    </main>
  );
}
