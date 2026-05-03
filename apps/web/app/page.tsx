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

export default async function Home() {
  const event = await getActiveEvent();

  return (
    <main
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '2rem 1.25rem',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>RallyShare</h1>
        <p style={{ color: 'var(--muted)', margin: '0.25rem 0 0' }}>
          Envia as tuas fotos e clips para a transmissão.
        </p>
      </header>

      <section
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '1rem 1.25rem',
        }}
      >
        {event ? (
          <>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Em direto</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{event.name}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 4 }}>
              {event.stages?.length ?? 0} PECs
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--muted)' }}>Sem evento activo de momento.</div>
        )}
      </section>

      <a
        href={event ? '/submit' : '#'}
        aria-disabled={!event}
        style={{
          background: 'var(--accent)',
          color: 'white',
          textDecoration: 'none',
          textAlign: 'center',
          padding: '1rem',
          borderRadius: 10,
          fontSize: '1rem',
          fontWeight: 600,
          opacity: event ? 1 : 0.5,
          pointerEvents: event ? 'auto' : 'none',
        }}
      >
        Submeter foto ou vídeo
      </a>
    </main>
  );
}
