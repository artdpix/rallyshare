import { ImageResponse } from 'next/og';

const ALLOWED = new Set([180, 192, 512]);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ size: string }> },
) {
  const { size } = await ctx.params;
  const n = Number(size);
  if (!ALLOWED.has(n)) return new Response('not found', { status: 404 });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0b0b0c',
          color: '#e11d48',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(n * 0.65),
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        R
      </div>
    ),
    { width: n, height: n },
  );
}
